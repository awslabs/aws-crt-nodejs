/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import crt_native from './binding';
import { NativeResource, NativeResourceMixin } from "./native_resource";
import { ResourceSafe } from '../common/resource_safety';
import { ClientBootstrap, SocketOptions, TlsConnectionOptions } from './io';
import { CrtError } from './error';
import { HttpProxyAuthenticationType, HttpProxyOptions as CommonHttpProxyOptions } from '../common/http';
export { HttpHeader, HttpProxyAuthenticationType } from '../common/http';
import { BufferedEventEmitter } from '../common/event';

/** @category HTTP */
export type HttpHeaders = crt_native.HttpHeaders;
/** @category HTTP */
export const HttpHeaders = crt_native.HttpHeaders;

/** @category HTTP */
export type HttpRequest = crt_native.HttpRequest;
/** @category HTTP */
export const HttpRequest = crt_native.HttpRequest;

/**
 * Base class for HTTP connections
 *
 * @module aws-crt
 * @category HTTP
 */
export class HttpConnection extends NativeResourceMixin(BufferedEventEmitter) implements ResourceSafe {

    protected constructor(native_handle: any) {
        super();
        this._super(native_handle);
    }

    /**
     * Close the connection.
     * Shutdown is asynchronous. This call has no effect if the connection is already
     * closing.
     */
    close() {
        crt_native.http_connection_close(this.native_handle());
    }

    /** Emitted when the connection is connected and ready to start streams */
    on(event: 'connect', listener: () => void): this;

    /** Emitted when an error occurs on the connection */
    on(event: 'error', listener: (error: Error) => void): this;

    /** Emitted when the connection has completed */
    on(event: 'close', listener: () => void): this;

    /** @internal */
    // Overridden to allow uncorking on ready
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        if (event == 'connect') {
            process.nextTick(() => {
                this.uncork();
            })
        }
        return this;
    }
}

/**
 * Proxy options for HTTP clients.
 *
 * @module aws-crt
 * @category HTTP
 */
export class HttpProxyOptions extends CommonHttpProxyOptions {
    /**
     *
     * @param host_name Name of the proxy server to connect through
     * @param port Port number of the proxy server to connect through
     * @param auth_method Type of proxy authentication to use. Default is {@link HttpProxyAuthenticationType.None}
     * @param auth_username Username to use when `auth_type` is {@link HttpProxyAuthenticationType.Basic}
     * @param auth_password Password to use when `auth_type` is {@link HttpProxyAuthenticationType.Basic}
     * @param tls_opts Optional TLS connection options for the connection to the proxy host.
     *                 Must be distinct from the {@link TlsConnectionOptions} provided to
     *                 the HTTP connection
     */
    constructor(
        host_name: string,
        port: number,
        auth_method = HttpProxyAuthenticationType.None,
        auth_username?: string,
        auth_password?: string,
        public tls_opts?: TlsConnectionOptions
    ) {
        super(host_name, port, auth_method, auth_username, auth_password);
    }

    /** @internal */
    create_native_handle() {
        return crt_native.http_proxy_options_new(
            this.host_name,
            this.port,
            this.auth_method,
            this.auth_username,
            this.auth_password,
            this.tls_opts ? this.tls_opts.native_handle() : undefined,
        );
    }
}

/**
 * Represents an HTTP connection from a client to a server
 *
 * @module aws-crt
 * @category HTTP
 */
export class HttpClientConnection extends HttpConnection {
    private _on_setup(native_handle: any, error_code: number) {
        if (error_code) {
            this.emit('error', new CrtError(error_code));
            return;
        }

        this.emit('connect');
    }

    private _on_shutdown(native_handle: any, error_code: number) {
        if (error_code) {
            this.emit('error', new CrtError(error_code));
            return;
        }
        this.emit('close');
    }

    /** Asynchronously establish a new HttpClientConnection.
     * @param bootstrap Client bootstrap to use when initiating socket connection.
     * @param host_name Host to connect to
     * @param port Port to connect to on host
     * @param socket_options Socket options
     * @param tls_opts Optional TLS connection options
     * @param proxy_options Optional proxy options
    */
    constructor(
        protected bootstrap: ClientBootstrap,
        host_name: string,
        port: number,
        protected socket_options: SocketOptions,
        protected tls_opts?: TlsConnectionOptions,
        proxy_options?: HttpProxyOptions,
        handle?: any) {

        super(handle
            ? handle
            : crt_native.http_connection_new(
                bootstrap.native_handle(),
                (handle: any, error_code: number) => {
                    this._on_setup(handle, error_code);
                },
                (handle: any, error_code: number) => {
                    this._on_shutdown(handle, error_code);
                },
                host_name,
                port,
                socket_options.native_handle(),
                tls_opts ? tls_opts.native_handle() : undefined,
                proxy_options ? proxy_options.create_native_handle() : undefined,
            ));
    }

    /**
     * Create {@link HttpClientStream} to carry out the request/response exchange.
     *
     * NOTE: The stream sends no data until :meth:`HttpClientStream.activate()`
     * is called. Call {@link HttpStream.activate} when you're ready for
     * callbacks and events to fire.
     * @param request - The HttpRequest to attempt on this connection
     * @returns A new stream that will deliver events for the request
     */
    request(request: HttpRequest) {
        let stream: HttpClientStream;
        const on_response_impl = (status_code: Number, headers: [string, string][]) => {
            stream._on_response(status_code, headers);
        }

        const on_body_impl = (data: ArrayBuffer) => {
            stream._on_body(data);
        }

        const on_complete_impl = (error_code: Number) => {
            stream._on_complete(error_code);
        }
        const native_handle = crt_native.http_stream_new(
            this.native_handle(),
            request,
            on_complete_impl,
            on_response_impl,
            on_body_impl
        );
        return stream = new HttpClientStream(
            native_handle,
            this,
            request);
    }
}

/**
 * Represents a single http message exchange (request/response) in HTTP/1.1. In H2, it may
 * also represent a PUSH_PROMISE followed by the accompanying response.
 *
 * NOTE: Binding either the ready or response event will uncork any buffered events and start
 * event delivery
 *
 * @module aws-crt
 * @category HTTP
 */
export class HttpStream extends NativeResourceMixin(BufferedEventEmitter) implements ResourceSafe {
    protected constructor(
        native_handle: any,
        readonly connection: HttpConnection) {
        super();
        this._super(native_handle);
        this.cork();
    }

    /**
     * Begin sending the request.
     *
     * The stream does nothing until this is called. Call activate() when you
     * are ready for its callbacks and events to fire.
     */
    activate() {
        crt_native.http_stream_activate(this.native_handle());
    }

    /**
     * Closes and ends all communication on this stream. Called automatically after the 'end'
     * event is delivered. Calling this manually is only necessary if you wish to terminate
     * communication mid-request/response.
     */
    close() {
        crt_native.http_stream_close(this.native_handle());
    }

    /** @internal */
    _on_body(data: ArrayBuffer) {
        this.emit('data', data);
    }

    /** @internal */
    _on_complete(error_code: Number) {
        if (error_code) {
            this.emit('error', new CrtError(error_code));
            this.close();
            return;
        }
        // schedule death after end is delivered
        this.on('end', () => {
            this.close();
        })
        this.emit('end');
    }
}

/**
 * Stream that sends a request and receives a response.
 *
 * Create an HttpClientStream with {@link HttpClientConnection.request}.
 *
 * NOTE: The stream sends no data until {@link HttpStream.activate} is called.
 * Call {@link HttpStream.activate} when you're ready for callbacks and events to fire.
 *
 * @module aws-crt
 * @category HTTP
 */
export class HttpClientStream extends HttpStream {
    private response_status_code?: Number;
    constructor(
        native_handle: any,
        connection: HttpClientConnection,
        readonly request: HttpRequest) {
        super(native_handle, connection);
    }

    /**
     * HTTP status code returned from the server.
     * @return Either the status code, or undefined if the server response has not arrived yet.
     */
    status_code() {
        return this.response_status_code;
    }

    /**
     * Emitted when the header block arrives from the server.
     * HTTP/1.1 - After all leading headers have been delivered
     * H2 - After the initial header block has been delivered
     */
    on(event: 'response', listener: (status_code: number, headers: HttpHeaders) => void): this;

    /**
     * Emitted when inline headers are delivered while communicating over H2
     * @param status_code - The HTTP status code returned from the server
     * @param headers - The full set of headers returned from the server in the header block
    */
    on(event: 'headers', listener: (headers: HttpHeaders) => void): this;

    /**
     * Emitted when a body chunk arrives from the server
     * @param body_data - The chunk of body data
     */
    on(event: 'data', listener: (body_data: ArrayBuffer) => void): this;

    /**
     * Emitted when an error occurs
     * @param error - A CrtError containing the error that occurred
     */
    on(event: 'error', listener: (error: Error) => void): this;

    /** Emitted when stream has completed successfully. */
    on(event: 'end', listener: () => void): this;

    /** @internal */
    // Overridden to allow uncorking on ready and response
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        if (event == 'response') {
            process.nextTick(() => {
                this.uncork();
            })
        }
        return this;
    }

    /** @internal */
    _on_response(status_code: Number, header_array: [string, string][]) {
        this.response_status_code = status_code;
        let headers = new HttpHeaders(header_array);
        this.emit('response', status_code, headers);
    }
}

/**
 * Creates, manages, and vends connections to a given host/port endpoint
 *
 * @module aws-crt
 * @category HTTP
 */
export class HttpClientConnectionManager extends NativeResource {
    private connections = new Map<any, HttpClientConnection>();
    /** Asynchronously establish a new HttpClientConnection.
         * @param bootstrap Client bootstrap to use when initiating socket connection.
         * @param host_name Host to connect to
         * @param port Port to connect to on host
         * @param socket_options Socket options
         * @param tls_opts Optional TLS connection options
         * @param proxy_options Optional proxy options
        */

    /**
     * @param bootstrap Client bootstrap to use when initiating socket connections
     * @param host Host to connect to
     * @param port Port to connect to on host
     * @param max_connections Maximum number of connections to pool
     * @param initial_window_size Optional initial window size
     * @param socket_options Socket options to use when initiating socket connections
     * @param tls_opts Optional TLS connection options
     * @param proxy_options Optional proxy options
     */
    constructor(
        readonly bootstrap: ClientBootstrap,
        readonly host: string,
        readonly port: number,
        readonly max_connections: number,
        readonly initial_window_size: number,
        readonly socket_options: SocketOptions,
        readonly tls_opts?: TlsConnectionOptions,
        readonly proxy_options?: HttpProxyOptions,
    ) {
        super(crt_native.http_connection_manager_new(
            bootstrap.native_handle(),
            host,
            port,
            max_connections,
            initial_window_size,
            socket_options.native_handle(),
            tls_opts ? tls_opts.native_handle() : undefined,
            proxy_options ? proxy_options.create_native_handle() : undefined,
            undefined /* on_shutdown */
        ));
    }

    /**
    * Vends a connection from the pool
    * @returns A promise that results in an HttpClientConnection. When done with the connection, return
    *          it via {@link release}
    */
    acquire(): Promise<HttpClientConnection> {
        return new Promise((resolve, reject) => {
            // Only create 1 connection in JS/TS from each native connection
            const on_acquired = (handle: any, error_code: number) => {
                if (error_code) {
                    reject(new CrtError(error_code));
                    return;
                }
                let connection = this.connections.get(handle);
                if (!connection) {
                    connection = new HttpClientConnection(
                        this.bootstrap,
                        this.host,
                        this.port,
                        this.socket_options,
                        this.tls_opts,
                        this.proxy_options,
                        handle
                    );
                    this.connections.set(handle, connection as HttpClientConnection);
                    connection.on('close', () => {
                        this.connections.delete(handle);
                    })
                }
                resolve(connection);
            };
            crt_native.http_connection_manager_acquire(this.native_handle(), on_acquired);
        });
    }

    /**
     * Returns an unused connection to the pool
     * @param connection - The connection to return
    */
    release(connection: HttpClientConnection) {
        crt_native.http_connection_manager_release(this.native_handle(), connection.native_handle());
    }

    /** Closes all connections and rejects all pending requests */
    close() {
        crt_native.http_connection_manager_close(this.native_handle());
    }
}
