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

import { HttpClientConnectionManager, HttpClientConnection, HttpHeaders as NativeHeaders, HttpRequest } from "./http";
import { ClientBootstrap, SocketOptions, SocketType, SocketDomain, ClientTlsContext, TlsConnectionOptions } from "./io";

jest.setTimeout(10000);
jest.retryTimes(3);

test('HTTP Request', () => {
    let request = new HttpRequest("GET", "/index.html");

    expect(request.method).toBe("GET");
    expect(request.path).toBe('/index.html');
    expect(request.headers.length).toBe(0);

    request.method = "POST";
    request.path = "/test.html"

    expect(request.method).toBe("POST");
    expect(request.path).toBe('/test.html');

    request.headers.add("Host", "www.amazon.com");
    expect(request.headers.length).toBe(1);
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

async function test_stream(method: string, host: string, port: number, activate: boolean, tls_opts?: TlsConnectionOptions) {
    const promise = new Promise((resolve, reject) => {
        let connection = new HttpClientConnection(
            new ClientBootstrap(),
            host,
            port,
            new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 3000),
            tls_opts);
        connection.on('connect', () => {
            let request = new HttpRequest(
                method,
                '/',
                new NativeHeaders([
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
            if (activate) {
                stream.activate();
            } else {
                resolve(true);
            }
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
    await test_stream('GET', 'example.com', 80, true, undefined);
});

test('HTTPS Stream GET', async () => {
    const host = 'example.com';
    await test_stream('GET', host, 443, true, new TlsConnectionOptions(new ClientTlsContext(), host));
});

test('HTTP Stream UnActivated', async () => {
    await test_stream('GET', 'example.com', 80, false, undefined);
});

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
        'GET',
        '/',
        new NativeHeaders([
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
        stream.activate();
    })

    await expect(promise).resolves.toBeTruthy();
    expect(connection_error).toBeUndefined();
});
