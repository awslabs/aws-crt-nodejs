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
import { NativeResource } from "./native_resource";
import { ResourceSafe } from '../common/resource_safety';
import { ClientBootstrap, ClientTlsContext, SocketOptions } from './io';
import { CrtError } from './error';
import { HttpHeaders, HttpRequest } from '../common/http';
export { HttpHeaders, HttpRequest } from '../common/http';

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

    make_request(request: HttpRequest, on_response: StreamResponseCallback, on_body: StreamBodyCallback) {
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
            request.body,
            request.headers._flatten(),
            on_complete_impl,
            on_response_impl,
            on_body_impl
        );
        return stream = new HttpClientStream(
            native_handle,
            this,
            request,
            on_response,
            on_body);
    }
}

class HttpStream extends NativeResource implements ResourceSafe {
    public readonly complete: Promise<Number>;
    private resolve_complete?: (error_code: Number) => void;
    private reject_complete?: (reason: any) => void;

    protected constructor(
        native_handle: any,
        protected connection: HttpConnection,
        protected on_body_cb?: StreamBodyCallback) {
        super(native_handle);
        this.complete = new Promise((resolve, reject) => {
            this.resolve_complete = resolve;
            this.reject_complete = reject;
        });
    }

    close() {
        crt_native.http_stream_close(this.native_handle());
    }

    _on_body(data: ArrayBuffer) {
        if (this.on_body_cb) {
            this.on_body_cb(data);
        }
    }

    _on_complete(error_code: Number) {
        if (error_code == 0) {
            this.resolve_complete && this.resolve_complete(error_code);
        } else {
            this.reject_complete && this.reject_complete(new CrtError(error_code));
        }
        this.close();
    }
}

export type StreamResponseCallback = (status_code: Number, headers: HttpHeaders) => void;
export type StreamBodyCallback = (data: ArrayBuffer) => void;

export class HttpClientStream extends HttpStream {
    private response_status_code?: Number;
    constructor(
        native_handle: any,
        connection: HttpClientConnection,
        public readonly request: HttpRequest,
        protected on_response_cb: StreamResponseCallback,
        on_body_cb?: StreamBodyCallback) {
        super(native_handle, connection, on_body_cb);
    }

    status_code() {
        return this.response_status_code;
    }

    _on_response(status_code: Number, header_array: string[][]) {
        this.response_status_code = status_code;
        if (this.on_response_cb) {
            let headers = new HttpHeaders();
            for (let header of header_array) {
                const name = header[0];
                const value = header[1];
                headers.add(name, value);
            }
            this.on_response_cb(status_code, headers);
        }
    }
}
