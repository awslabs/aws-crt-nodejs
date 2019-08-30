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

import { HttpClientConnection } from "../lib/native/http";
import { using } from "../lib/common/resource_safety";
import { ClientBootstrap, SocketOptions, SocketType, SocketDomain, ClientTlsContext, TlsContextOptions } from "../lib/native/io";

test('HTTP Connection Create/Destroy', (done) => {
    using(new ClientBootstrap(), async (bootstrap) => {
        const on_setup = (connection: HttpClientConnection, error_code: Number) => {
            expect(connection).toBeDefined();
            expect(error_code).toEqual(0);
        }

        const on_shutdown = (connection: HttpClientConnection, error_code: Number) => {
            expect(connection).toBeDefined();
            expect(error_code).toEqual(0);
            done();
        }

        await HttpClientConnection.create(
            bootstrap,
            on_setup,
            on_shutdown,
            "www.amazon.com",
            80,
            new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 3000),
            new ClientTlsContext(new TlsContextOptions()));
    });
})
