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
import { ClientBootstrap, SocketOptions, SocketType, SocketDomain } from "../lib/native/io";

test('HTTP Connection Create/Destroy', (done) => {
    using(new ClientBootstrap(), async (bootstrap) => {
        let setup_error_code: Number = -1;
        let setup_connection: HttpClientConnection | undefined;
        let shutdown_error_code: Number = -1;
        let shutdown_connection: HttpClientConnection | undefined;
        await new Promise((resolve, reject) => {
            const on_setup = (connection: HttpClientConnection, error_code: Number) => {
                setup_error_code = error_code;
                setup_connection = connection;
            }

            const on_shutdown = (connection: HttpClientConnection, error_code: Number) => {
                shutdown_error_code = error_code;
                shutdown_connection = connection;
                resolve();
            }

            HttpClientConnection.create(
                bootstrap,
                on_setup,
                on_shutdown,
                "www.amazon.com",
                80,
                new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 3000),
                undefined)
                .then((connection) => {
                    connection.close();
                })
                .catch((reason) => {
                    reject(reason);
                });
        }).catch((reason) => {
            expect(reason).toBeUndefined();
        });        
        
        expect(setup_connection).toBeDefined();
        expect(setup_error_code).toEqual(0);
        expect(shutdown_connection).toEqual(setup_connection);
        expect(shutdown_error_code).toEqual(0);
        done();
    });
}, 30000);
