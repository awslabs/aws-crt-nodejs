/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 *
 * A module containing support for creating http connections and making requests on them.
 *
 * @packageDocumentation
 * @module http
 * @mergeTarget
 */

import {
    CommonHttpProxyOptions,
    HttpHeader,
    HttpHeaders as CommonHttpHeaders,
    HttpProxyAuthenticationType,
    HttpClientConnectionConnected,
    HttpClientConnectionError,
    HttpClientConnectionClosed,
    HttpStreamComplete,
    HttpStreamData,
    HttpStreamError
} from '../common/http';
export { HttpHeader, HttpProxyAuthenticationType } from '../common/http';
import { BufferedEventEmitter } from '../common/event';
import { is_nodejs } from '../common/platform';
import { CrtError } from './error';
import { ClientBootstrap, InputStream, SocketOptions, TlsConnectionOptions } from './io';

/**
 * Wraps IPv6 literals in brackets so they can be embedded in a URL.
 * @internal
 */
function format_url_host(host_name: string): string {
    return (host_name.indexOf(':') !== -1 && !host_name.startsWith('[')) ? `[${host_name}]` : host_name;
}

/**
 * Lazily loads undici's ProxyAgent. Kept behind a runtime require (and stubbed
 * out for browser bundlers via the "browser" field in package.json) so that
 * bundling the browser implementation for a real browser never pulls in undici
 * or its Node-core dependencies. Returns undefined when undici is unavailable.
 * @internal
 */
function load_proxy_agent(): any {
    try {
        // Reference require through a variable so bundlers that don't honor the
        // package.json "browser" field stub ("undici": false) don't statically pull
        // undici (and its node: imports) into browser bundles. In a real browser
        // require is absent and this resolves to undefined.
        const node_require = typeof require === 'function' ? require : undefined;
        return node_require ? node_require('undici').ProxyAgent : undefined;
    } catch (e) {
        return undefined;
    }
}

/**
 * Builds an undici ProxyAgent dispatcher from proxy options, to be passed to the
 * (Node-only) `dispatcher` option of the global fetch(). In a real browser, proxying
 * cannot be applied (proxy routing belongs to the browser/OS); returns undefined with
 * a warning. Under Node.js, where the caller's proxy_options are expected to be
 * honored, failure to construct the dispatcher (undici unavailable) is an error
 * rather than a silent direct connection.
 * @internal
 */
function make_proxy_dispatcher(proxy_options: HttpProxyOptions): any {
    if (!is_nodejs()) {
        console.warn(
            'aws-crt: HttpClientConnection proxy_options were provided, but proxying is only ' +
            'supported when the browser implementation runs under Node.js. In a real browser, ' +
            'proxy routing is controlled by the browser/OS network settings and these options ' +
            'have no effect.'
        );
        return undefined;
    }

    const ProxyAgent = load_proxy_agent();
    if (!ProxyAgent) {
        throw new CrtError(
            'HttpClientConnection proxy_options were provided, but the "undici" package could ' +
            'not be loaded, so the proxy settings cannot be applied. Ensure undici is installed ' +
            'to use HTTP proxy support in the browser implementation under Node.js.'
        );
    }

    // Native-only capabilities (TLS to the proxy itself, forwarding mode) cannot be
    // expressed through undici's ProxyAgent, which always speaks plaintext HTTP to the
    // proxy and tunnels via CONNECT.
    const native_only = proxy_options as { tls_opts?: unknown, connection_type?: number };
    if (native_only.tls_opts || native_only.connection_type === 1 /* Forwarding */) {
        console.warn(
            'aws-crt: HttpClientConnection proxy_options include settings (tls_opts and/or a ' +
            'forwarding connection_type) that are not supported by the browser implementation; ' +
            'the proxy will be reached over plaintext HTTP using a tunneling (CONNECT) connection.'
        );
    }

    const options: { uri: string, token?: string } = {
        uri: `http://${format_url_host(proxy_options.host_name)}:${proxy_options.port}`,
    };

    if (proxy_options.auth_method == HttpProxyAuthenticationType.Basic) {
        const credentials = `${proxy_options.auth_username || ""}:${proxy_options.auth_password || ""}`;
        options.token = `Basic ${Buffer.from(credentials).toString('base64')}`;
    }

    return new ProxyAgent(options);
}

/**
 * A collection of HTTP headers
 *
 * @category HTTP
 */
export class HttpHeaders implements CommonHttpHeaders {
    // Map from "header": [["HeAdEr", "value1"], ["HEADER", "value2"], ["header", "value3"]]
    private headers: { [index: string]: [HttpHeader] } = {};

    /** Construct from a collection of [name, value] pairs
     *
     * @param headers list of HttpHeader values to seat in this object
     */
    constructor(headers: HttpHeader[] = []) {
        for (const header of headers) {
            this.add(header[0], header[1]);
        }
    }

    /**
     * Fetches the total length of all headers
     *
     * @returns the total length of all headers
     */
    get length(): number {
        let length = 0;
        for (let key in this.headers) {
            length += this.headers[key].length;
        }
        return length;
    }

    /**
     * Add a name/value pair
     * @param name The header name
     * @param value The header value
    */
    add(name: string, value: string) {
        let values = this.headers[name.toLowerCase()];
        if (values) {
            values.push([name, value]);
        } else {
            this.headers[name.toLowerCase()] = [[name, value]];
        }
    }

    /**
     * Set a name/value pair, replacing any existing values for the name
     * @param name - The header name
     * @param value - The header value
    */
    set(name: string, value: string) {
        this.headers[name.toLowerCase()] = [[name, value]];
    }

    /**
     * Get the list of values for the given name
     * @param name - The header name to look for
     * @return List of values, or empty list if none exist
     */
    get_values(name: string) {
        const values = [];
        const values_list = this.headers[name.toLowerCase()] || [];
        for (const entry of values_list) {
            values.push(entry[1]);
        }
        return values;
    }

    /**
     * Gets the first value for the given name, ignoring any additional values
     * @param name - The header name to look for
     * @param default_value - Value returned if no values are found for the given name
     * @return The first header value, or default if no values exist
     */
    get(name: string, default_value: string = "") {
        const values = this.headers[name.toLowerCase()];
        if (!values) {
            return default_value;
        }
        return values[0][1] || default_value;
    }

    /**
     * Removes all values for the given name
     * @param name - The header to remove all values for
     */
    remove(name: string) {
        delete this.headers[name.toLowerCase()];
    }

    /**
     * Removes a specific name/value pair
     * @param name - The header name to remove
     * @param value - The header value to remove
     */
    remove_value(name: string, value: string) {
        const key = name.toLowerCase();

        let values = this.headers[key];
        for (let idx = 0; idx < values.length; ++idx) {
            const entry = values[idx];
            if (entry[1] === value) {
                if (values.length === 1) {
                    delete this.headers[key];
                } else {
                    delete values[idx];
                }
                return;
            }
        }
    }

    /** Clears the entire header set */
    clear() {
        this.headers = {};
    }

    /**
     * Iterator. Allows for:
     * let headers = new HttpHeaders();
     * ...
     * for (const header of headers) { }
    */
    *[Symbol.iterator]() {
        for (const key in this.headers) {
            const values = this.headers[key];
            for (let entry of values) {
                yield entry;
            }
        }
    }

    /** @internal */
    _flatten(): HttpHeader[] {
        let flattened = [];
        for (const pair of this) {
            flattened.push(pair);
        }
        return flattened;
    }
}

/**
 * Options used when connecting to an HTTP endpoint via a proxy.
 *
 * NOTE: Proxy support in the browser implementation only applies when it runs under Node.js,
 * where requests are routed through undici's ProxyAgent. In a real browser, per-request proxy
 * configuration is not available (proxy routing is controlled by the browser/OS network
 * settings) and these options have no effect; a warning is emitted at runtime in that case.
 *
 * @category HTTP
 */
export class HttpProxyOptions extends CommonHttpProxyOptions {
}

/**
 * Represents a request to a web server from a client
 *
 * @category HTTP
 */
export class HttpRequest {

    /**
     * Constructor for the HttpRequest class
     *
     * @param method The verb to use for the request (i.e. GET, POST, PUT, DELETE, HEAD)
     * @param path The URI of the request
     * @param headers Additional custom headers to send to the server
     * @param body The request body, in the case of a POST or PUT request
     */
    constructor(
        public method: string,
        public path: string,
        public headers = new HttpHeaders(),
        public body?: InputStream) {
    }
}

/**
 * Represents an HTTP connection from a client to a server
 *
 * @category HTTP
 */
export class HttpClientConnection extends BufferedEventEmitter {
    public _baseURL: string;
    /** @internal undici ProxyAgent dispatcher, when proxying is active (Node.js only) */
    public _dispatcher: any;
    protected bootstrap: ClientBootstrap | undefined;
    protected socket_options?: SocketOptions;
    protected tls_options?: TlsConnectionOptions;
    protected proxy_options?: HttpProxyOptions;

    /**
     * Http connection constructor, signature synced to native version for compatibility
     *
     * @param bootstrap - (native only) leave undefined
     * @param host_name - endpoint to connection with
     * @param port - port to connect to
     * @param socketOptions - (native only) leave undefined
     * @param tlsOptions - instantiate for TLS, but actual value is unused in browse implementation
     * @param proxyOptions - options to control proxy usage when establishing the connection.
     *
     * NOTE: When the browser implementation runs under Node.js, proxyOptions are applied by
     * routing requests through undici's ProxyAgent. In a real browser, per-request proxy
     * configuration is not available and proxyOptions have no effect (proxy routing is
     * controlled by the browser/OS network settings); a warning is emitted in that case.
     */
    constructor(
        bootstrap: ClientBootstrap | undefined,
        host_name: string,
        port: number,
        socketOptions?: SocketOptions,
        tlsOptions?: TlsConnectionOptions,
        proxyOptions?: HttpProxyOptions,
    ) {
        super();
        this.cork();

        this.bootstrap = bootstrap;
        this.socket_options = socketOptions;
        this.tls_options = tlsOptions;
        this.proxy_options = proxyOptions;
        const scheme = (this.tls_options || port === 443) ? 'https' : 'http'

        this._baseURL = `${scheme}://${format_url_host(host_name)}:${port}/`;

        try {
            if (this.proxy_options) {
                this._dispatcher = make_proxy_dispatcher(this.proxy_options);
            }
        } catch (error) {
            // Surface construction failures (e.g. an unparseable proxy host) through the
            // error event rather than throwing from the constructor, which callers like
            // HttpClientConnectionManager do not expect. Uncork so the buffered error
            // reaches listeners even if no 'connect' listener is ever attached.
            setTimeout(() => {
                this.uncork();
                this.emit('error', new CrtError(error as any));
            }, 0);
            return;
        }

        setTimeout(() => {
            this.emit('connect');
        }, 0);
    }

    /**
     * Emitted when the connection is connected and ready to start streams
     *
     * @event
     */
    static CONNECT = 'connect';

    /**
     * Emitted when an error occurs on the connection
     *
     * @event
     */
    static ERROR = 'error';

    /**
     * Emitted when the connection has completed
     *
     * @event
     */
    static CLOSE = 'close';

    on(event: 'connect', listener: HttpClientConnectionConnected): this;

    on(event: 'error', listener: HttpClientConnectionError): this;

    on(event: 'close', listener: HttpClientConnectionClosed): this;

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

    /**
     * Ends the connection
     */
    close() {
        this.emit('close');
        this._baseURL = "";
        if (this._dispatcher) {
            // Release keep-alive sockets held by the proxy agent
            this._dispatcher.close();
            this._dispatcher = undefined;
        }
    }
}

function stream_request(connection: HttpClientConnection, request: HttpRequest) {
    if (request == null || request == undefined) {
        throw new CrtError("HttpClientConnection stream_request: request not defined");
    }

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
    let body: BodyInit | undefined = undefined;
    if (request.body) {
        if (['GET', 'HEAD'].includes(request.method.toUpperCase())) {
            // fetch() throws a TypeError for GET/HEAD requests with a body
            console.warn(
                `aws-crt: HttpClientConnection request bodies are not supported for ` +
                `${request.method.toUpperCase()} requests in the browser implementation; the body will not be sent.`
            );
        } else {
            const data = (request.body as InputStream).data;
            if (typeof data === 'object' && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)
                && !(typeof Blob !== 'undefined' && data instanceof Blob)) {
                // Plain objects would be coerced to "[object Object]" by fetch; serialize as JSON
                body = JSON.stringify(data);
                if (request.headers.get('content-type') === "") {
                    request.headers.set('content-type', 'application/json');
                }
            } else {
                body = data as BodyInit;
            }
        }
    }
    let stream = HttpClientStream._create(connection);
    // Join base and path textually (as the previous axios implementation did) rather than
    // via new URL(path, base): relative-URL resolution would let a path starting with "//"
    // override the connection's host, sending the request (and its auth headers) elsewhere.
    const url = connection._baseURL + request.path.replace(/^\/+/, '');
    // `dispatcher` is a Node/undici-only extension to RequestInit that routes the request
    // through the proxy agent; it is ignored by the fetch() implementation in a real browser.
    const init: RequestInit & { dispatcher?: any } = {
        method: request.method,
        headers: _to_object(request.headers),
        body: body
    };
    if (connection._dispatcher) {
        init.dispatcher = connection._dispatcher;
    }
    fetch(url, init).then(async (response: Response) => {
        const data = await response.arrayBuffer();
        if (!response.ok) {
            stream._on_error_response(response.status, response.headers, data);
        } else {
            stream._on_response(response.status, response.headers, data);
        }
    }).catch((error: any) => {
        stream._on_error(error);
    });
    return stream;
}


/**
 * Listener signature for event emitted from an {@link HttpClientStream} when the http response headers have arrived.
 *
 * @param status_code http response status code
 * @param headers the response's set of headers
 *
 * @category HTTP
 */
export type HttpStreamResponse = (status_code: number, headers: HttpHeaders) => void;

/**
 * Represents a single http message exchange (request/response) in HTTP.
 *
 * NOTE: Binding either the ready or response event will uncork any buffered events and start
 * event delivery
 *
 * @category HTTP
 */
export class HttpClientStream extends BufferedEventEmitter {
    private response_status_code?: number;

    private constructor(readonly connection: HttpClientConnection) {
        super();
        this.cork();
    }

    /**
     * HTTP status code returned from the server.
     * @return Either the status code, or undefined if the server response has not arrived yet.
     */
    status_code() {
        return this.response_status_code;
    }

    /**
     * Begin sending the request.
     *
     * The stream does nothing until this is called. Call activate() when you
     * are ready for its callbacks and events to fire.
     */
    activate() {
        setTimeout(() => {
            this.uncork();
        }, 0);
    }

    /**
     * Emitted when the http response headers have arrived.
     *
     * @event
     */
    static RESPONSE = 'response';

    /**
     * Emitted when http response data is available.
     *
     * @event
     */
    static DATA = 'data';

    /**
     * Emitted when an error occurs in stream processing
     *
     * @event
     */
    static ERROR = 'error';

    /**
     * Emitted when the stream has completed
     *
     * @event
     */
    static END = 'end';

    on(event: 'response', listener: HttpStreamResponse): this;

    on(event: 'data', listener: HttpStreamData): this;

    on(event: 'error', listener: HttpStreamError): this;

    on(event: 'end', listener: HttpStreamComplete): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    // Private helpers for stream_request()
    /** @internal */
    static _create(connection: HttpClientConnection) {
        return new HttpClientStream(connection);
    }

    // Convert fetch response into a series of events
    /** @internal */
    _on_response(status_code: number, responseHeaders: Headers, data: ArrayBuffer) {
        this.response_status_code = status_code;
        let headers = new HttpHeaders();
        responseHeaders.forEach((value: string, key: string) => {
            headers.add(key, value);
        });
        this.emit('response', this.response_status_code, headers);
        this.emit('data', data);
        this.emit('end');
    }

    // Handle HTTP error responses (non-2xx status codes)
    /** @internal */
    _on_error_response(status_code: number, responseHeaders: Headers, data: ArrayBuffer) {
        this.response_status_code = status_code;
        let info = `status_code=${status_code}`;
        const headersObj: { [key: string]: string } = {};
        responseHeaders.forEach((value, key) => { headersObj[key] = value; });
        info += ` headers=${JSON.stringify(headersObj)}`;
        if (data.byteLength > 0) {
            info += ` data=${new TextDecoder().decode(data)}`;
        }
        this.connection.close();
        this.emit('error', new Error(`msg=Request failed with status ${status_code}, connection=${JSON.stringify(this.connection)}, info=${info}`));
    }

    // Handle network errors from fetch
    /** @internal */
    _on_error(error: any) {
        this.connection.close();
        this.emit('error', new Error(`msg=${error.message}, connection=${JSON.stringify(this.connection)}`));
    }
}

interface PendingRequest {
    resolve: (connection: HttpClientConnection) => void;
    reject: (error: CrtError) => void;
}

/**
 * Creates, manages, and vends connections to a given host/port endpoint
 *
 * @category HTTP
 */
export class HttpClientConnectionManager {
    private pending_connections = new Set<HttpClientConnection>();
    private live_connections = new Set<HttpClientConnection>();
    private free_connections: HttpClientConnection[] = [];
    private pending_requests: PendingRequest[] = [];


    /**
     * Constructor for the HttpClientConnectionManager class.  Signature stays in sync with native implementation
     * for compatibility purposes (leads to some useless params)
     *
     * @param bootstrap - (native only) leave undefined
     * @param host - endpoint to pool connections for
     * @param port - port to connect to
     * @param max_connections - maximum allowed connection count
     * @param initial_window_size - (native only) leave as zero
     * @param socket_options - (native only) leave null
     * @param tls_opts - if not null TLS will be used, otherwise plain http will be used
     * @param proxy_options - configuration for establishing connections through a proxy
     */
    constructor(
        readonly bootstrap: ClientBootstrap | undefined,
        readonly host: string,
        readonly port: number,
        readonly max_connections: number,
        readonly initial_window_size: number,
        readonly socket_options?: SocketOptions,
        readonly tls_opts?: TlsConnectionOptions,
        readonly proxy_options?: HttpProxyOptions
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
        let connection = new HttpClientConnection(
            new ClientBootstrap(),
            this.host,
            this.port,
            this.socket_options,
            this.tls_opts,
            this.proxy_options);
        this.pending_connections.add(connection);
        const on_connect = () => {
            this.pending_connections.delete(connection);
            this.live_connections.add(connection);
            this.free_connections.push(connection);
            this.resolve(connection);
        }
        const on_error = (error: any) => {
            if (this.pending_connections.has(connection)) {
                // Connection never connected, error it out. Remove it and pump so the
                // failed slot doesn't permanently count against max_connections.
                this.remove(connection);
                this.reject(new CrtError(error));
                return this.pump();
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
