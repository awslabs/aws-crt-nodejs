/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

import crt_native = require('./binding');
import { NativeResourceMixin } from "./native_resource";
import { ResourceSafe } from '../common/resource_safety';
import { ClientBootstrap, ClientTlsContext, SocketOptions, InputStream } from './io';
import { CrtError } from './error';
import { HttpHeaders, HttpRequest } from '../common/http';
export { HttpHeaders, HttpRequest } from '../common/http';
import { BufferedEventEmitter } from '../common/event';

/** Base class for HTTP connections */
export class HttpConnection extends NativeResourceMixin(BufferedEventEmitter) implements ResourceSafe {

    protected constructor(native_handle: any) {
        super();
        this._super(native_handle);
    }

    close() {
        crt_native.http_connection_close(this.native_handle());
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
            process.nextTick(() => {
                this.uncork();
            })
        }
        return this;
    }
}

/** Represents an HTTP connection from a client to a server */
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

    constructor(
        protected bootstrap: ClientBootstrap,
        host_name: string,
        port: number,
        protected socket_options: SocketOptions,
        protected tls_ctx?: ClientTlsContext) {
        
        super(crt_native.http_connection_new(
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
            tls_ctx ? tls_ctx.native_handle() : undefined
        ));
    }

    /** 
     * Make a client initiated request to this connection.
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
            request.method,
            request.path,
            request.body ? (request.body as InputStream).native_handle() : undefined,
            request.headers._flatten(),
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
 */
class HttpStream extends NativeResourceMixin(BufferedEventEmitter) implements ResourceSafe {
    protected constructor(
        native_handle: any,
        readonly connection: HttpConnection) {
        super();
        this._super(native_handle);
        this.cork();
    }

    /** 
     * Closes and ends all communication on this stream. Called automatically after the 'end'
     * event is delivered. Calling this manually is only necessary if you wish to terminate
     * communication mid-request/response.
     */
    close() {
        crt_native.http_stream_close(this.native_handle());
    }

    _on_body(data: ArrayBuffer) {
        this.emit('data', data);
    }

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

/** Represents a stream created on a client HTTP connection. {@see HttpStream} */
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

    /** Emitted when stream has completed sucessfully. */
    on(event: 'end', listener: () => void): this;

    // Override to allow uncorking on ready and response
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        if (event == 'response') {
            process.nextTick(() => {
                this.uncork();
            })
        }
        return this;
    }

    _on_response(status_code: Number, header_array: [string, string][]) {
        this.response_status_code = status_code;
        let headers = new HttpHeaders(header_array);
        this.emit('response', status_code, headers);
    }
}
