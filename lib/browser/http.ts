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

import { HttpHeaders, HttpRequest } from '../common/http';
export { HttpHeaders, HttpRequest } from '../common/http';
import { BufferedEventEmitter } from '../common/event';
import { InputStream } from './io';
const axios = require('axios').default;

export class HttpClientConnection extends BufferedEventEmitter {
    readonly axios: any;
    constructor(
        host_name: string,
        port: number,
        scheme?: string
    ) {
        super();
        if (!scheme) {
            scheme = (port == 443) ? 'https' : 'http'
        }
        this.axios = axios.create({
            baseURL: `${scheme}://${host_name}:${port}/`
        });
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
        this.emit('end');
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
