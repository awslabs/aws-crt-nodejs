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

import { HttpClientConnectionManager, HttpClientConnection, HttpHeaders, HttpRequest } from "../lib/native/http";
import { ClientBootstrap, SocketOptions, SocketType, SocketDomain, ClientTlsContext, TlsConnectionOptions } from "../lib/native/io";

jest.setTimeout(10000);
jest.retryTimes(3);

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

async function test_connection(host: string, port: number, tls_opts?: TlsConnectionOptions) {
    const bootstrap = new ClientBootstrap();
    let setup_error_code: Number = -1;
    let shutdown_error_code: Number = -1;
    let connection_error: Error | undefined;
    const promise = new Promise((resolve, reject) => {
        let connection = new HttpClientConnection(
            bootstrap,
            host,
            port,
            new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 3000),
            tls_opts
        );
        connection.on('connect', () => {
            setup_error_code = 0;
            connection.close();
        });
        connection.on('close', () => {
            if (!connection_error) {
                shutdown_error_code = 0;
                resolve(true);
            }
        });
        connection.on('error', (error) => {
            connection_error = error;
            reject(error);
        });
    });
    await expect(promise).resolves.toBeTruthy();

    expect(setup_error_code).toEqual(0);
    expect(shutdown_error_code).toEqual(0);
    expect(connection_error).toBeUndefined();
}

test('HTTP Connection Create/Destroy', async () => {
    await test_connection("s3.amazonaws.com", 80);
});

test('HTTPS Connection Create/Destroy', async () => {
    const host = "s3.amazonaws.com";
    await test_connection(host, 443, new TlsConnectionOptions(new ClientTlsContext(), host));
});

async function test_stream(method: string, host: string, port: number, tls_opts?: TlsConnectionOptions) {
    const promise = new Promise((resolve, reject) => {
        let connection = new HttpClientConnection(
            new ClientBootstrap(),
            host,
            port,
            new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 3000),
            tls_opts);
        connection.on('connect', () => {
            let request = new HttpRequest(
                method, '/', undefined,
                new HttpHeaders([
                    ['host', host],
                    ['user-agent', 'AWS CRT for NodeJS']
                ])
            );
            let stream = connection.request(request);
            stream.on('response', (status_code, headers) => {
                expect(status_code).toBe(200);
                expect(headers).toBeDefined();
            });
            stream.on('data', (body_data) => {
                expect(body_data.byteLength).toBeGreaterThan(0);
            });
            stream.on('end', () => {
                connection.close();
            });
            stream.on('error', (error) => {
                connection.close();
                console.log(error);
                expect(error).toBeUndefined();
            });
        });
        connection.on('close', () => {
            resolve(true);
        });
        connection.on('error', (error) => {
            reject(error);
        });
    });

    await expect(promise).resolves.toBeTruthy();
}

test('HTTP Stream GET', async () => {
    await test_stream('GET', 'example.com', 80);
});

test('HTTPS Stream GET', async () => {
    const host = 'example.com';
    await test_stream('GET', host, 443, new TlsConnectionOptions(new ClientTlsContext(), host));
})

test('HTTP Connection Manager create/destroy', () => {
    const bootstrap = new ClientBootstrap();
    let connection_manager = new HttpClientConnectionManager(
        bootstrap,
        "s3.amazon.com",
        80,
        4,
        16 * 1024,
        new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 3000),
        undefined
    );
    expect(connection_manager).toBeDefined();
    connection_manager.close();
});

test('HTTP Connection Manager acquire/release', async () => {
    const bootstrap = new ClientBootstrap();
    let connection_manager = new HttpClientConnectionManager(
        bootstrap,
        "s3.amazon.com",
        80,
        4,
        16 * 1024,
        new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 3000),
        undefined
    );
    expect(connection_manager).toBeDefined();

    const connection = await connection_manager.acquire();
    expect(connection).toBeDefined();
    connection_manager.release(connection);

    connection_manager.close();
});

test('HTTP Connection Manager acquire/stream/release', async () => {
    const bootstrap = new ClientBootstrap();
    let connection_manager = new HttpClientConnectionManager(
        bootstrap,
        "example.com",
        80,
        4,
        16 * 1024,
        new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 3000),
        undefined
    );
    expect(connection_manager).toBeDefined();

    const connection = await connection_manager.acquire();
    expect(connection).toBeDefined();

    let request = new HttpRequest(
        'GET', '/', undefined,
        new HttpHeaders([
            ['host', 'example.com'],
            ['user-agent', 'AWS CRT for NodeJS']
        ])
    );

    let connection_error: Error | undefined;

    const promise = new Promise((resolve, reject) => {
        let stream = connection.request(request);
        stream.on('response', (status_code, headers) => {
            expect(status_code).toBe(200);
            expect(headers).toBeDefined();
        });
        stream.on('data', (body_data) => {
            expect(body_data.byteLength).toBeGreaterThan(0);
        });
        stream.on('end', () => {
            connection_manager.release(connection);
            connection_manager.close();
            if (!connection_error) {
                resolve(true);
            }
        });
        stream.on('error', (error) => {
            connection_error = error;
            reject(error);
        });
    })
    
    await expect(promise).resolves.toBeTruthy();
    expect(connection_error).toBeUndefined();
});
