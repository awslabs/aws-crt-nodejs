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

import { HttpClientConnection, HttpHeaders } from "../lib/native/http";
import { ClientBootstrap, SocketOptions, SocketType, SocketDomain, ClientTlsContext } from "../lib/native/io";

test('HTTP Headers', () => {
    let headers = new HttpHeaders([
        ['Host', 'www.amazon.com'],
        ['Content-Length', '42']
    ]);
    for (const header of headers) {
        expect(['Host', 'Content-Length']).toContain(header[0]);
        expect(['www.amazon.com', '42']).toContain(header[1]);
    }
    // Upgrade header does not exist
    expect(headers.get('Upgrade')).toBeFalsy();

    // Make sure case doesn't matter
    expect(headers.get('HOST')).toBe('www.amazon.com');

    // Remove Content-Length, and make sure host is all that's left
    headers.remove('content-length');
    for (const header of headers) {
        expect(header[0]).toBe('Host');
        expect(header[1]).toBe('www.amazon.com');
    }

    headers.clear();
    for (const header of headers) {
        // this should never be called
        expect(header).toBeNull();
    }
});

test('HTTP Connection Create/Destroy', async (done) => {
    const bootstrap = new ClientBootstrap();
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
            "s3.amazonaws.com",
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
}, 30000);

test('HTTPS Connection Create/Destroy', async (done) => {
    const bootstrap = new ClientBootstrap();
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
            "s3.amazonaws.com",
            443,
            new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 3000),
            new ClientTlsContext())
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
}, 30000);
