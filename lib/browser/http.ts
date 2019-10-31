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

import { HttpHeaders, HttpProxyOptions, HttpProxyAuthenticationType } from '../common/http';
export { HttpHeaders, HttpProxyOptions, HttpProxyAuthenticationType } from '../common/http';
import { BufferedEventEmitter } from '../common/event';
import { InputStream } from './io';
import { CrtError } from './error';
import * as axios from 'axios';

/** Represents a request to a web server from a client */
export class HttpRequest {
    constructor(
        /** The verb to use for the request (i.e. GET, POST, PUT, DELETE, HEAD) */
        public method: string,
        /** The URI of the request */
        public path: string,
        /** The request body, in the case of a POST or PUT request */
        public body?: InputStream,
        /** Additional custom headers to send to the server */
        public headers = new HttpHeaders()) {
    }
}

export class HttpClientConnection extends BufferedEventEmitter {
    readonly axios: any;
    constructor(
        host_name: string,
        port: number,
        scheme?: string,
        proxy_options?: HttpProxyOptions,
    ) {
        super();
        if (!scheme) {
            scheme = (port == 443) ? 'https' : 'http'
        }
        let axios_options: axios.AxiosRequestConfig = {
            baseURL: `${scheme}://${host_name}:${port}/`
        };
        if (proxy_options) {
            axios_options.proxy = {
                host: proxy_options.host_name,
                port: proxy_options.port,
            };

            if (proxy_options.auth_method == HttpProxyAuthenticationType.Basic) {
                axios_options.proxy.auth = {
                    username: proxy_options.auth_username || "",
                    password: proxy_options.auth_password || "",
                };
            }
        }
        this.axios = axios.default.create(axios_options);
        setTimeout(() => {
            this.emit('connect');
        }, 0);
    }

    /** Emitted when the connection is connected and ready to start streams */
    on(event: 'connect', listener: () => void): this;

    /** Emitted when an error occurs on the connection */
    on(event: 'error', listener: (error: Error) => void): this;

    /** Emitted when the connection has completed */
    on(event: 'close', listener: () => void): this;

    // Override to allow uncorking on ready
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        if (event == 'connect') {
            setTimeout(() => {
                this.uncork();
            }, 0);
        }
        return this;
    }

    /**
     * Make a client initiated request to this connection.
     * @param request - The HttpRequest to attempt on this connection
     * @returns A new stream that will deliver events for the request
     */
    request(request: HttpRequest) {
        return stream_request(this, request);
    }

    _on_end(stream: HttpClientStream) {
        this.emit('close');
    }
}

function stream_request(connection: HttpClientConnection, request: HttpRequest) {
    const _to_object = (headers: HttpHeaders) => {
        // browsers refuse to let users configure host or user-agent
        const forbidden_headers = ['host', 'user-agent'];
        let obj: { [index: string]: string } = {};
        for (const header of headers) {
            if (forbidden_headers.indexOf(header[0].toLowerCase()) != -1) {
                continue;
            }
            obj[header[0]] = headers.get(header[0]);
        }
        return obj;
    }
    let body = (request.body) ? (request.body as InputStream).data : undefined;
    let stream = HttpClientStream._create(connection);
    stream.connection.axios.request({
        url: request.path,
        method: request.method.toLowerCase(),
        headers: _to_object(request.headers),
        body: body
    }).then((response: any) => {
        stream._on_response(response);
    }).catch((error: any) => {
        stream._on_error(error);
    });
    return stream;
}

/**
 * Represents a single http message exchange (request/response) in HTTP.
 *
 * NOTE: Binding either the ready or response event will uncork any buffered events and start
 * event delivery
 */
export class HttpClientStream extends BufferedEventEmitter {
    private response_status_code?: number;
    private encoder = new TextEncoder();
    private constructor(readonly connection: HttpClientConnection) {
        super();
    }

    /**
     * HTTP status code returned from the server.
     * @return Either the status code, or undefined if the server response has not arrived yet.
     */
    status_code() {
        return this.response_status_code;
    }

    /**
     * Emitted when the header block arrives from the server.
     */
    on(event: 'response', listener: (status_code: number, headers: HttpHeaders) => void): this;

    /**
     * Emitted when a body chunk arrives from the server
     * @param body_data - The chunk of body data
     */
    on(event: 'data', listener: (body_data: ArrayBuffer) => void): this;

    /**
     * Emitted when an error occurs
     * @param error - A CrtError containing the error that occurred
     */
    on(event: 'error', listener: (error: Error) => void): this;

    /** Emitted when stream has completed sucessfully. */
    on(event: 'end', listener: () => void): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        if (event == 'ready' || event == 'response') {
            setTimeout(() => {
                this.uncork();
            }, 0);
        }
        return this;
    }

    // Private helpers for stream_request()
    static _create(connection: HttpClientConnection) {
        return new HttpClientStream(connection);
    }

    // Convert axios' single response into a series of events
    _on_response(response: any) {
        this.response_status_code = response.status;
        let headers = new HttpHeaders();
        for (let header in response.headers) {
            headers.add(header, response.headers[header]);
        }
        this.emit('response', this.response_status_code, headers);
        let data = response.data;
        if (data && !(data instanceof ArrayBuffer)) {
            data = this.encoder.encode(data.toString());
        }
        this.emit('data', data);
        this.emit('end');
        this.connection._on_end(this);
    }

    // Gather as much information as possible from the axios error
    // and pass it on to the user
    _on_error(error: any) {
        let info = "";
        if (error.response) {
            this.response_status_code = error.response.status;
            info += `status_code=${error.response.status}`;
            if (error.response.headers) {
                info += `headers=${error.response.headers}`;
            }
            if (error.response.data) {
                info += `data=${error.response.data}`;
            }
        } else {
            info = "No response from server";
        }

        this.emit('error', new Error(`msg=${error.message}, XHR=${error.request}, info=${info}`));
    }
}

interface PendingRequest {
    resolve: (connection: HttpClientConnection) => void;
    reject: (error: CrtError) => void;
}

/** Creates, manages, and vends connections to a given host/port endpoint */
export class HttpClientConnectionManager {
    private pending_connections = new Set<HttpClientConnection>();
    private live_connections = new Set<HttpClientConnection>();
    private free_connections: HttpClientConnection[] = [];
    private pending_requests: PendingRequest[] = [];

    constructor(
        readonly host: string,
        readonly port: number,
        readonly max_connections: number
    ) {

    }

    private remove(connection: HttpClientConnection) {
        this.pending_connections.delete(connection);
        this.live_connections.delete(connection);
        const free_idx = this.free_connections.indexOf(connection);
        if (free_idx != -1) {
            this.free_connections.splice(free_idx, 1);
        }
    }

    private resolve(connection: HttpClientConnection) {
        const request = this.pending_requests.shift();
        if (request) {
            request.resolve(connection);
        } else {
            this.free_connections.push(connection);
        }
    }

    private reject(error: CrtError) {
        const request = this.pending_requests.shift();
        if (request) {
            request.reject(error);
        }
    }

    private pump() {
        if (this.pending_requests.length == 0) {
            return;
        }
        // Try to service the request with a free connection
        {
            let connection = this.free_connections.pop();
            if (connection) {
                return this.resolve(connection);
            }
        }

        // If there's no more room, nothing can be resolved right now
        if ((this.live_connections.size + this.pending_connections.size) == this.max_connections) {
            return;
        }

        // There's room, create a new connection
        let connection = new HttpClientConnection(this.host, this.port);
        this.pending_connections.add(connection);
        const on_connect = () => {
            this.pending_connections.delete(connection);
            this.live_connections.add(connection);
            this.free_connections.push(connection);
            this.resolve(connection);
        }
        const on_error = (error: any) => {
            if (this.pending_connections.has(connection)) {
                // Connection never connected, error it out
                return this.reject(new CrtError(error));
            }
            // If the connection errors after use, get it out of rotation and replace it
            this.remove(connection);
            this.pump();
        }
        const on_close = () => {
            this.remove(connection);
            this.pump();
        }
        connection.on('connect', on_connect);
        connection.on('error', on_error);
        connection.on('close', on_close);
    }

    /**
     * Vends a connection from the pool
     * @returns A promise that results in an HttpClientConnection. When done with the connection, return
     *          it via {@link release}
     */
    acquire(): Promise<HttpClientConnection> {
        return new Promise((resolve, reject) => {
            this.pending_requests.push({
                resolve: resolve,
                reject: reject
            });
            this.pump();
        });
    }

    /**
     * Returns an unused connection to the pool
     * @param connection - The connection to return
    */
    release(connection: HttpClientConnection) {
        this.free_connections.push(connection);
        this.pump();
    }

    /** Closes all connections and rejects all pending requests */
    close() {
        this.pending_requests.forEach((request) => {
            request.reject(new CrtError('HttpClientConnectionManager shutting down'));
        })
    }
}
