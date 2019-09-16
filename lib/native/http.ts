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
import { NativeResource, NativeResourceMixin } from "./native_resource";
import { ResourceSafe } from '../common/resource_safety';
import { ClientBootstrap, ClientTlsContext, SocketOptions, InputStream } from './io';
import { CrtError } from './error';
import { HttpHeaders, HttpRequest } from '../common/http';
export { HttpHeaders, HttpRequest } from '../common/http';
import { BufferedEventEmitter } from '../common/event';

export class HttpConnection extends NativeResource implements ResourceSafe {

    protected constructor(native_handle: any) {
        super(native_handle);
    }

    close() {
        crt_native.http_connection_close(this.native_handle());
    }
}

type ClientConnectionCallback = (connection: HttpClientConnection, error_code: Number) => void;

export class HttpClientConnection extends HttpConnection {
    static create(
        bootstrap: ClientBootstrap,
        on_connection_setup: ClientConnectionCallback | undefined,
        on_connection_shutdown: ClientConnectionCallback | undefined,
        host_name: String,
        port: Number,
        socket_options: SocketOptions,
        tls_ctx?: ClientTlsContext) : Promise<HttpClientConnection> {
        
        return new Promise<HttpClientConnection>((resolve, reject) => {
            let connection: HttpClientConnection;
            const on_setup = (native_connection: any, error_code: Number) => {
                if (error_code) {
                    reject(new CrtError(error_code));
                }
                connection = new HttpClientConnection(
                    native_connection,
                    bootstrap,
                    socket_options,
                    tls_ctx);
                if (on_connection_setup) {
                    on_connection_setup(connection, error_code);
                }
                resolve(connection);
            }

            const on_shutdown = (_native_connection: any, error_code: Number) => {
                if (on_connection_shutdown) {
                    on_connection_shutdown(connection, error_code);
                }
            }

            // create new connection, connection will be delivered via on_setup
            // errors during construction will be thrown
            crt_native.http_connection_new(
                bootstrap.native_handle(),
                on_setup,
                on_shutdown,
                host_name,
                port,
                socket_options.native_handle(),
                tls_ctx ? tls_ctx.native_handle() : undefined
            )
        });
    }

    protected constructor(
        native_handle: any,
        protected bootstrap: ClientBootstrap,
        protected socket_options: SocketOptions,
        protected tls_ctx?: ClientTlsContext) {
        super(native_handle);
    }

    request(request: HttpRequest) {
        let stream: HttpClientStream;
        const on_response_impl = (status_code: Number, headers: string[][]) => {
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

class HttpStream extends NativeResourceMixin(BufferedEventEmitter) implements ResourceSafe {
    protected constructor(
        native_handle: any,
        public connection: HttpConnection) {
        super();
        this._super(native_handle);
        this.cork();
    }

    close() {
        crt_native.http_stream_close(this.native_handle());
    }

    on(event: 'end', listener: () => void): this;
    on(event: 'response', listener: (status_code: number, headers: HttpHeaders) => void): this;
    on(event: 'headers', listener: (headers: HttpHeaders) => void): this;
    on(event: 'data', listener: (body_data: ArrayBuffer) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'ready', listener: () => void): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        if (event == 'ready' || event == 'response') {
            process.nextTick(() => {
                this.uncork();
            })
        }
        return this;
    }

    _on_body(data: ArrayBuffer) {
        this.emit('data', data);
    }

    _on_complete(error_code: Number) {
        // schedule death after end is delivered
        this.on('end', () => {
            this.close();
        })
        this.emit('end');
    }
}

export class HttpClientStream extends HttpStream {
    private response_status_code?: Number;
    constructor(
        native_handle: any,
        connection: HttpClientConnection,
        public readonly request: HttpRequest) {
        super(native_handle, connection);
    }

    status_code() {
        return this.response_status_code;
    }

    _on_response(status_code: Number, header_array: string[][]) {
        this.response_status_code = status_code;
        let headers = new HttpHeaders();
        for (let header of header_array) {
            const name = header[0];
            const value = header[1];
            headers.add(name, value);
        }
        this.emit('ready');
        this.emit('response', status_code, headers);
    }
}
