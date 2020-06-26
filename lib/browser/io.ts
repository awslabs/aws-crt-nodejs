/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

export { TlsVersion, SocketType, SocketDomain } from "../common/io";
import { SocketType, SocketDomain } from "../common/io";

/**
 * @return false, as ALPN is not configurable from the browser
 *
 * @module aws-crt
 * @category TLS
*/
export function is_alpn_available(): boolean {
    return false;
}

type BodyData = string | object | ArrayBuffer | ArrayBufferView | Blob | File;

/**
 * Wrapper for any sort of body data in requests. As the browser does not implement streaming,
 * this is merely an interface wrapper around a memory buffer.
 *
 * @module aws-crt
 * @category I/O
 */
export class InputStream {
    constructor(public data: BodyData) {

    }
}

/**
 * Represents resources required to bootstrap a client connection, provided as
 * a stub for the browser API
 *
 * @module aws-crt
 * @category I/O
 */
export class ClientBootstrap { };

/**
 * Options for creating a {@link ClientTlsContext}. Provided as a stub for
 * browser API.
 *
 * @module aws-crt
 * @category TLS
 */
export type TlsContextOptions = any;

/**
 * TLS options that are unique to a given connection using a shared TlsContext.
 * Provided as a stub for browser API.
 *
 * @module aws-crt
 * @category TLS
 */
export class TlsConnectionOptions {
    constructor(readonly tls_ctx: TlsContext, readonly server_name?: string, readonly alpn_list: string[] = []) {

    }
};

/**
 * TLS context used for TLS communications over sockets. Provided as a
 * stub for the browser API
 *
 * @module aws-crt
 * @category TLS
 */
export abstract class TlsContext {

};

/**
 * TLS context used for client TLS communications over sockets. Provided as a
 * stub for the browser API
 *
 * @module aws-crt
 * @category TLS
 */
export class ClientTlsContext extends TlsContext {
    constructor(options?: TlsContextOptions) {
        super();
    }
};

/**
 * Standard Berkeley socket style options.
 *
 * Provided for compatibility with nodejs, but this version is largely unused.
 * @module aws-crt
 * @category I/O
*/
export class SocketOptions {
    constructor(
        public type = SocketType.STREAM,
        public domain = SocketDomain.IPV6,
        public connect_timeout_ms = 5000,
        public keepalive = false,
        public keep_alive_interval_sec = 0,
        public keep_alive_timeout_sec = 0,
        public keep_alive_max_failed_probes = 0) {
    }
}
