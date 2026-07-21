/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/*
 * Verifies that the browser HttpClientConnection routes requests through an HTTP
 * proxy when proxy_options are supplied and the implementation runs under Node.js.
 *
 * Proxy support relies on undici's ProxyAgent, so these tests only run on Node.js.
 * A self-contained origin server and a CONNECT-tunneling forward proxy are stood up
 * in-process, so no external infrastructure is required.
 */

import { HttpClientConnection, HttpClientConnectionManager, HttpHeaders, HttpProxyOptions, HttpRequest, HttpProxyAuthenticationType } from "@awscrt/http";
import { is_nodejs } from "../common/platform";
import * as http from "http";
import * as net from "net";
import { AddressInfo } from "net";

// Only meaningful under Node.js; skip entirely in a real browser test run.
const describe_node = is_nodejs() ? describe : describe.skip;

jest.setTimeout(10000);

interface ProxyFixture {
    origin: http.Server;
    proxy: http.Server;
    origin_port: number;
    proxy_port: number;
    connect_count: () => number;
    last_proxy_auth: () => string | undefined;
    close: () => Promise<void>;
}

function listen(server: http.Server): Promise<number> {
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve((server.address() as AddressInfo).port);
        });
    });
}

async function start_fixture(): Promise<ProxyFixture> {
    const origin = http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain', 'x-served-by': 'origin' });
        res.end(`origin path=${req.url}`);
    });

    let connect_count = 0;
    let last_proxy_auth: string | undefined = undefined;
    // undici's ProxyAgent tunnels via HTTP CONNECT, so the proxy is exercised here.
    const proxy = http.createServer(() => { /* no direct requests expected */ });
    proxy.on('connect', (req, client_socket: net.Socket, head: Buffer) => {
        connect_count++;
        last_proxy_auth = req.headers['proxy-authorization'];
        const [host, port] = (req.url ?? "").split(':');
        const server_socket = net.connect(parseInt(port), host, () => {
            client_socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            server_socket.write(head);
            server_socket.pipe(client_socket);
            client_socket.pipe(server_socket);
        });
        server_socket.on('error', () => client_socket.destroy());
        client_socket.on('error', () => server_socket.destroy());
    });

    const origin_port = await listen(origin);
    const proxy_port = await listen(proxy);

    return {
        origin, proxy, origin_port, proxy_port,
        connect_count: () => connect_count,
        last_proxy_auth: () => last_proxy_auth,
        close: () => new Promise<void>((resolve) => {
            origin.close(() => proxy.close(() => resolve()));
        }),
    };
}

function do_request(fixture: ProxyFixture, proxy_options: HttpProxyOptions): Promise<{ status: number, body: string }> {
    return new Promise((resolve, reject) => {
        const connection = new HttpClientConnection(
            undefined,
            '127.0.0.1',
            fixture.origin_port,
            undefined,
            undefined,
            proxy_options);

        connection.on('connect', () => {
            const request = new HttpRequest("GET", "/hello", new HttpHeaders());
            const stream = connection.request(request);
            let status = 0;
            const chunks: Uint8Array[] = [];
            stream.on('response', (status_code) => { status = status_code; });
            stream.on('data', (data) => { chunks.push(new Uint8Array(data)); });
            stream.on('end', () => {
                connection.close();
                const body = Buffer.concat(chunks).toString('utf-8');
                resolve({ status, body });
            });
            stream.on('error', (error) => { connection.close(); reject(error); });
            stream.activate();
        });
        connection.on('error', reject);
    });
}

describe_node('Browser HTTP proxy (Node.js)', () => {
    test('routes request through proxy without auth', async () => {
        const fixture = await start_fixture();
        try {
            const proxy_options = new HttpProxyOptions('127.0.0.1', fixture.proxy_port);
            const { status, body } = await do_request(fixture, proxy_options);
            expect(status).toBe(200);
            expect(body).toBe('origin path=/hello');
            // The request must have traversed the proxy exactly once.
            expect(fixture.connect_count()).toBe(1);
            expect(fixture.last_proxy_auth()).toBeUndefined();
        } finally {
            await fixture.close();
        }
    });

    test('sends Basic Proxy-Authorization when auth configured', async () => {
        const fixture = await start_fixture();
        try {
            const proxy_options = new HttpProxyOptions(
                '127.0.0.1',
                fixture.proxy_port,
                HttpProxyAuthenticationType.Basic,
                'user',
                'pass');
            const { status } = await do_request(fixture, proxy_options);
            expect(status).toBe(200);
            expect(fixture.connect_count()).toBe(1);
            const expected = 'Basic ' + Buffer.from('user:pass').toString('base64');
            expect(fixture.last_proxy_auth()).toBe(expected);
        } finally {
            await fixture.close();
        }
    });

    test('bypasses proxy when no proxy_options provided', async () => {
        const fixture = await start_fixture();
        try {
            const { status, body } = await do_request(fixture, undefined as unknown as HttpProxyOptions);
            expect(status).toBe(200);
            expect(body).toBe('origin path=/hello');
            // Direct connection: proxy must not have been contacted.
            expect(fixture.connect_count()).toBe(0);
        } finally {
            await fixture.close();
        }
    });

    test('unusable proxy host surfaces through the error event, not a constructor throw', async () => {
        let connection: HttpClientConnection | undefined = undefined;
        expect(() => {
            connection = new HttpClientConnection(
                undefined, '127.0.0.1', 80, undefined, undefined,
                new HttpProxyOptions('bad host', 8888));
        }).not.toThrow();
        await new Promise<void>((resolve, reject) => {
            connection!.on('error', () => resolve());
            connection!.on('connect', () => reject(new Error('should not connect')));
        });
    });

    test('connection manager recovers after a failed proxy connection', async () => {
        const manager = new HttpClientConnectionManager(
            undefined, '127.0.0.1', 80, 1, 0, undefined, undefined,
            new HttpProxyOptions('bad host', 8888));
        // Failed connections must not permanently occupy the single slot.
        await expect(manager.acquire()).rejects.toBeDefined();
        await expect(manager.acquire()).rejects.toBeDefined();
    });
});
