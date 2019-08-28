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

type ConnectionCallback = (error_code: Number) => void;

export class HttpConnection extends NativeResource implements ResourceSafe {

    constructor(
        bootstrap: ClientBootstrap,
        on_connection_setup: ConnectionCallback | undefined,
        on_connection_shutdown: ConnectionCallback | undefined,
        host_name: String,
        port: Number,
        socket_options: SocketOptions,
        tls_ctx: ClientTlsContext)
    {
        super(crt_native.http_connection_new(
            bootstrap.native_handle(),
            on_connection_setup,
            on_connection_shutdown,
            host_name,
            port,
            socket_options.native_handle(),
            tls_ctx.native_handle()
        ));
    }

    close() {
        crt_native.http_connection_close(this.native_handle());
    }
}
