/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { HttpHeader, HttpHeaders as CommonHttpHeaders, HttpProxyOptions, HttpProxyAuthenticationType } from '../common/http';
export { HttpHeader, HttpProxyOptions, HttpProxyAuthenticationType } from '../common/http';
import { BufferedEventEmitter } from '../common/event';
import { CrtError } from './error';
import axios = require('axios');
import { ClientBootstrap, InputStream, SocketOptions, TlsConnectionOptions } from './io';

require('./polyfills')

/**
 * A collection of HTTP headers
 *
 * @module aws-crt
 * @category HTTP
 */
export class HttpHeaders implements CommonHttpHeaders {
    // Map from "header": [["HeAdEr", "value1"], ["HEADER", "value2"], ["header", "value3"]]
    private headers: { [index: string]: [HttpHeader] } = {};

    /** Construct from a collection of [name, value] pairs */
    constructor(headers: HttpHeader[] = []) {
        for (const header of headers) {
            this.add(header[0], header[1]);
        }
    }

    get length(): number {
        let length = 0;
        for (let key in this.headers) {
            length += this.headers[key].length;
        }
        return length;
    }

    /**
     * Add a name/value pair
     * @param name - The header name
     * @param value - The header value
    */
    add(name: string, value: string) {
        let values = this.headers[name.toLowerCase()];
        if (values) {
            values.push([name, value]);
        } else {
            this.headers[name.toLowerCase()] = [[name, value]];
        }
    }

    /**
     * Set a name/value pair, replacing any existing values for the name
     * @param name - The header name
     * @param value - The header value
    */
    set(name: string, value: string) {
        this.headers[name.toLowerCase()] = [[name, value]];
    }

    /**
     * Get the list of values for the given name
     * @param name - The header name to look for
     * @return List of values, or empty list if none exist
     */
    get_values(name: string) {
        const values = [];
        const values_list = this.headers[name.toLowerCase()] || [];
        for (const entry of values_list) {
            values.push(entry[1]);
        }
        return values;
    }

    /**
     * Gets the first value for the given name, ignoring any additional values
     * @param name - The header name to look for
     * @param default_value - Value returned if no values are found for the given name
     * @return The first header value, or default if no values exist
     */
    get(name: string, default_value = "") {
        const values = this.headers[name.toLowerCase()];
        if (!values) {
            return default_value;
        }
        return values[0][1] || default_value;
    }

    /**
     * Removes all values for the given name
     * @param name - The header to remove all values for
     */
    remove(name: string) {
        delete this.headers[name.toLowerCase()];
    }

    /**
     * Removes a specific name/value pair
     * @param name - The header name to remove
     * @param value - The header value to remove
     */
    remove_value(name: string, value: string) {
        const key = name.toLowerCase();

        let values = this.headers[key];
        for (let idx = 0; idx < values.length; ++idx) {
            const entry = values[idx];
            if (entry[1] === value) {
                if (values.length === 1) {
                    delete this.headers[key];
                } else {
                    delete values[idx];
                }
                return;
            }
        }
    }

    /** Clears the entire header set */
    clear() {
        this.headers = {};
    }

    /**
     * Iterator. Allows for:
     * let headers = new HttpHeaders();
     * ...
     * for (const header of headers) { }
    */
    *[Symbol.iterator]() {
        for (const key in this.headers) {
            const values = this.headers[key];
            for (let entry of values) {
                yield entry;
            }
        }
    }

    /** @internal */
    _flatten(): HttpHeader[] {
        let flattened = [];
        for (const pair of this) {
            flattened.push(pair);
        }
        return flattened;
    }
}

/** Represents a request to a web server from a client */
export class HttpRequest {
    constructor(
        /** The verb to use for the request (i.e. GET, POST, PUT, DELETE, HEAD) */
        public method: string,
        /** The URI of the request */
        public path: string,
        /** Additional custom headers to send to the server */
        public headers = new HttpHeaders(),
        /** The request body, in the case of a POST or PUT request */
        public body?: InputStream) {
    }
}

export class HttpClientConnection extends BufferedEventEmitter {
    public _axios: any;
    private axios_options: axios.AxiosRequestConfig;
    protected bootstrap: ClientBootstrap;
    protected socket_options?: SocketOptions;
    protected tls_options?: TlsConnectionOptions;
    protected proxy_options?: HttpProxyOptions;

    /**
     * Browser-specific overload of constructor without bootstrap
     */
    constructor(host_name: string, port: number, socket_options?: SocketOptions, tls_options?: TlsConnectionOptions, proxy_options?: HttpProxyOptions);
    constructor(bootstrap: ClientBootstrap, host_name: string, port: number, socket_options?: SocketOptions, tls_options?: TlsConnectionOptions, proxy_options?: HttpProxyOptions);
    constructor(
        bootstrapOrHost: ClientBootstrap | string,
        hostOrPort: string | number,
        portOrSocketOptions?: number | SocketOptions,
        socketOptionsOrTlsOptions?: SocketOptions | TlsConnectionOptions,
        tlsOptionsOrProxyOptions?: TlsConnectionOptions | HttpProxyOptions,
        maybeProxyOptions?: HttpProxyOptions,
    ) {
        super();
        this.cork();

        this.bootstrap = (bootstrapOrHost instanceof ClientBootstrap) ? bootstrapOrHost : new ClientBootstrap();
        const host_name = (bootstrapOrHost instanceof String) ? bootstrapOrHost : hostOrPort as string;
        const port = (portOrSocketOptions instanceof SocketOptions) ? hostOrPort as number : portOrSocketOptions as number;
        this.socket_options = (portOrSocketOptions instanceof SocketOptions) ? portOrSocketOptions : socketOptionsOrTlsOptions as SocketOptions;
        this.tls_options = (socketOptionsOrTlsOptions instanceof TlsConnectionOptions) ? socketOptionsOrTlsOptions : tlsOptionsOrProxyOptions as TlsConnectionOptions;
        this.proxy_options = (tlsOptionsOrProxyOptions instanceof HttpProxyOptions) ? tlsOptionsOrProxyOptions : maybeProxyOptions;
        const scheme = (this.tls_options) ? 'https' : 'http'

        this.axios_options = {
            baseURL: `${scheme}://${host_name}:${port}/`
        };

        if (this.proxy_options) {
            this.axios_options.proxy = {
                host: this.proxy_options.host_name,
                port: this.proxy_options.port,
            };

            if (this.proxy_options.auth_method == HttpProxyAuthenticationType.Basic) {
                this.axios_options.proxy.auth = {
                    username: this.proxy_options.auth_username || "",
                    password: this.proxy_options.auth_password || "",
                };
            }
        }
        this._axios = axios.default.create(this.axios_options);
        setTimeout(() => {
            this.emit('connect');
        }, 0);
    }

    /** Emitted when the connection is connected and ready to start streams */
    on(event: 'connect', listener: () => void): this;

    /** Emitted when an error occurs on the connection */
    on(event: 'error', listener: (error: Error) => void): this;

    /** Emitted when the connection has completed */
    on(event: 'close', listener: () => void): this;

    // Override to allow uncorking on ready
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        if (event == 'connect') {
            setTimeout(() => {
                this.uncork();
            }, 0);
        }
        return this;
    }

    /**
     * Make a client initiated request to this connection.
     * @param request - The HttpRequest to attempt on this connection
     * @returns A new stream that will deliver events for the request
     */
    request(request: HttpRequest) {
        return stream_request(this, request);
    }

    close() {
        this.emit('close');
        this._axios = undefined;
    }
}

function stream_request(connection: HttpClientConnection, request: HttpRequest) {
    const _to_object = (headers: HttpHeaders) => {
        // browsers refuse to let users configure host or user-agent
        const forbidden_headers = ['host', 'user-agent'];
        let obj: { [index: string]: string } = {};
        for (const header of headers) {
            if (forbidden_headers.indexOf(header[0].toLowerCase()) != -1) {
                continue;
            }
            obj[header[0]] = headers.get(header[0]);
        }
        return obj;
    }
    let body = (request.body) ? (request.body as InputStream).data : undefined;
    let stream = HttpClientStream._create(connection);
    stream.connection._axios.request({
        url: request.path,
        method: request.method.toLowerCase(),
        headers: _to_object(request.headers),
        body: body
    }).then((response: any) => {
        stream._on_response(response);
    }).catch((error: any) => {
        stream._on_error(error);
    });
    return stream;
}

/**
 * Represents a single http message exchange (request/response) in HTTP.
 *
 * NOTE: Binding either the ready or response event will uncork any buffered events and start
 * event delivery
 */
export class HttpClientStream extends BufferedEventEmitter {
    private response_status_code?: number;
    private encoder = new TextEncoder();
    private constructor(readonly connection: HttpClientConnection) {
        super();
        this.cork();
    }

    /**
     * HTTP status code returned from the server.
     * @return Either the status code, or undefined if the server response has not arrived yet.
     */
    status_code() {
        return this.response_status_code;
    }

    /**
     * Begin sending the request.
     *
     * The stream does nothing until this is called. Call activate() when you
     * are ready for its callbacks and events to fire.
     */
    activate() {
        setTimeout(() => {
            this.uncork();
        }, 0);
    }

    /**
     * Emitted when the header block arrives from the server.
     */
    on(event: 'response', listener: (status_code: number, headers: HttpHeaders) => void): this;

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

    /** Emitted when stream has completed sucessfully. */
    on(event: 'end', listener: () => void): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    // Private helpers for stream_request()
    static _create(connection: HttpClientConnection) {
        return new HttpClientStream(connection);
    }

    // Convert axios' single response into a series of events
    _on_response(response: any) {
        this.response_status_code = response.status;
        let headers = new HttpHeaders();
        for (let header in response.headers) {
            headers.add(header, response.headers[header]);
        }
        this.emit('response', this.response_status_code, headers);
        let data = response.data;
        if (data && !(data instanceof ArrayBuffer)) {
            data = this.encoder.encode(data.toString());
        }
        this.emit('data', data);
        this.emit('end');
        this.connection.close();
    }

    // Gather as much information as possible from the axios error
    // and pass it on to the user
    _on_error(error: any) {
        let info = "";
        if (error.response) {
            this.response_status_code = error.response.status;
            info += `status_code=${error.response.status}`;
            if (error.response.headers) {
                info += ` headers=${JSON.stringify(error.response.headers)}`;
            }
            if (error.response.data) {
                info += ` data=${error.response.data}`;
            }
        } else {
            info = "No response from server";
        }

        this.emit('error', new Error(`msg=${error.message}, connection=${JSON.stringify(this.connection)}, info=${info}`));
    }
}

interface PendingRequest {
    resolve: (connection: HttpClientConnection) => void;
    reject: (error: CrtError) => void;
}

/** Creates, manages, and vends connections to a given host/port endpoint */
export class HttpClientConnectionManager {
    private pending_connections = new Set<HttpClientConnection>();
    private live_connections = new Set<HttpClientConnection>();
    private free_connections: HttpClientConnection[] = [];
    private pending_requests: PendingRequest[] = [];

    constructor(
        readonly bootstrap: ClientBootstrap,
        readonly host: string,
        readonly port: number,
        readonly max_connections: number,
        readonly initial_window_size: number,
        readonly socket_options: SocketOptions,
        readonly tls_opts?: TlsConnectionOptions,
        readonly proxy_options?: HttpProxyOptions
    ) {

    }

    private remove(connection: HttpClientConnection) {
        this.pending_connections.delete(connection);
        this.live_connections.delete(connection);
        const free_idx = this.free_connections.indexOf(connection);
        if (free_idx != -1) {
            this.free_connections.splice(free_idx, 1);
        }
    }

    private resolve(connection: HttpClientConnection) {
        const request = this.pending_requests.shift();
        if (request) {
            request.resolve(connection);
        } else {
            this.free_connections.push(connection);
        }
    }

    private reject(error: CrtError) {
        const request = this.pending_requests.shift();
        if (request) {
            request.reject(error);
        }
    }

    private pump() {
        if (this.pending_requests.length == 0) {
            return;
        }
        // Try to service the request with a free connection
        {
            let connection = this.free_connections.pop();
            if (connection) {
                return this.resolve(connection);
            }
        }

        // If there's no more room, nothing can be resolved right now
        if ((this.live_connections.size + this.pending_connections.size) == this.max_connections) {
            return;
        }

        // There's room, create a new connection
        let connection = new HttpClientConnection(
            this.bootstrap,
            this.host,
            this.port,
            this.socket_options,
            this.tls_opts,
            this.proxy_options);
        this.pending_connections.add(connection);
        const on_connect = () => {
            this.pending_connections.delete(connection);
            this.live_connections.add(connection);
            this.free_connections.push(connection);
            this.resolve(connection);
        }
        const on_error = (error: any) => {
            if (this.pending_connections.has(connection)) {
                // Connection never connected, error it out
                return this.reject(new CrtError(error));
            }
            // If the connection errors after use, get it out of rotation and replace it
            this.remove(connection);
            this.pump();
        }
        const on_close = () => {
            this.remove(connection);
            this.pump();
        }
        connection.on('connect', on_connect);
        connection.on('error', on_error);
        connection.on('close', on_close);
    }

    /**
     * Vends a connection from the pool
     * @returns A promise that results in an HttpClientConnection. When done with the connection, return
     *          it via {@link release}
     */
    acquire(): Promise<HttpClientConnection> {
        return new Promise((resolve, reject) => {
            this.pending_requests.push({
                resolve: resolve,
                reject: reject
            });
            this.pump();
        });
    }

    /**
     * Returns an unused connection to the pool
     * @param connection - The connection to return
    */
    release(connection: HttpClientConnection) {
        this.free_connections.push(connection);
        this.pump();
    }

    /** Closes all connections and rejects all pending requests */
    close() {
        this.pending_requests.forEach((request) => {
            request.reject(new CrtError('HttpClientConnectionManager shutting down'));
        })
    }
}
