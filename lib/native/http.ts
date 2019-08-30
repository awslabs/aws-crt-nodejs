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

export class HttpConnection extends NativeResource implements ResourceSafe {

    protected constructor(native_handle: any)
    {
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
        
        return new Promise<HttpClientConnection>((resolve) => {
            let connection: HttpClientConnection;
            const on_setup = (native_connection: any, error_code: Number) => {
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
}
