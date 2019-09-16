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

import crt_native = require('./binding');
import { NativeResource } from "./native_resource";
import { InputStreamBase, TlsVersion } from '../common/io';
import { Readable } from 'stream';
export { TlsVersion } from '../common/io';

/** 
 * Convert a native error code into a human-readable string
 * @param error_code - An error code returned from a native API call, or delivered
 * via callback.
 * @see CrtError
 * 
 * nodejs only.
 */
export function error_code_to_string(error_code: number): string {
    return crt_native.error_code_to_string(error_code);
}

/** The amount of detail that will be logged */
export enum LogLevel {
    /** No logging whatsoever. Equivalent to never calling {@link enable_logging}. */
    NONE = 0,
    /** Only fatals. In practice, this will not do much, as the process will log and then crash (intentionally) if a fatal condition occurs */
    FATAL = 1,
    /** Only errors */
    ERROR = 2,
    /** Only warnings and errors */
    WARN = 3,
    /** Information about connection/stream creation/destruction events */
    INFO = 4,
    /** Enough information to debug the chain of events a given network connection encounters */
    DEBUG = 5,
    /** Everything. Only use this if you really need to know EVERY single call */
    TRACE = 6
}

/** 
 * Enables logging of the native AWS CRT libraries.
 * @param level - The logging level to filter to
 * @param filename - (Optional) The file to log to. If not provided, stderr will be used
 * 
 * nodejs only.
 */
export function enable_logging(level: LogLevel, filename?: string) {
    crt_native.io_logging_enable(level, filename);
}

/** 
 * Returns true if ALPN is available on this platform natively 
 * @return true if ALPN is supported natively, false otherwise
 * nodejs only.
*/
export function is_alpn_available(): boolean {
    return crt_native.is_alpn_available();
}

/** 
 * Wraps a {@link Readable} for reading by native code, used to stream
 *  data into the AWS CRT libraries.
 */
export class InputStream extends NativeResource implements InputStreamBase {
    constructor(private source: Readable) {
        super(crt_native.io_input_stream_new(16 * 1024));
        this.source.on('data', (data) => {
            data = Buffer.isBuffer(data) ? data : new Buffer(data.toString(), 'utf8');
            crt_native.io_input_stream_append(this.native_handle(), data);
        });
        this.source.on('end', () => {
            crt_native.io_input_stream_append(this.native_handle(), undefined);
        })
    }
}

/** 
 * Represents native resources required to bootstrap a client connection
 * Things like a host resolver, event loop group, etc. There should only need
 * to be 1 of these per application, in most cases.
 * 
 * nodejs only.
 */
export class ClientBootstrap extends NativeResource {
    constructor() {
        super(crt_native.io_client_bootstrap_new());
    }
}

export enum SocketType {
    STREAM = 0,
    DGRAM = 1,
}

export enum SocketDomain {
    IPV4 = 0,
    IPV6 = 1,
    LOCAL = 2, /* UNIX domain/named pipes */
}

/** 
 * Standard Berkeley socket style options. 
 * 
 * nodejs only.
*/
export class SocketOptions extends NativeResource {
    constructor(
        type: SocketType,
        domain: SocketDomain,
        connect_timeout_ms: Number,
        keepalive = false,
        keep_alive_interval_sec = 0,
        keep_alive_timeout_sec = 0,
        keep_alive_max_failed_probes = 0) {
        super(crt_native.io_socket_options_new(
            type,
            domain,
            connect_timeout_ms,
            keep_alive_interval_sec,
            keep_alive_timeout_sec,
            keep_alive_max_failed_probes,
            keepalive
        ));
    }
}

/** 
 * Options for creating a {@link ClientTlsContext} or {@link ServerTlsContext}. 
 * 
 * nodejs only.
 */
export class TlsContextOptions {
    /** Minimum version of TLS to support. Uses OS/system default if unspecified. */
    public min_tls_version: TlsVersion = TlsVersion.Default;
    /** Path to a single file with all trust anchors in it, in PEM format */
    public ca_file?: string = undefined;
    /** Path to directory containing trust anchors. Only used on Unix-style systems. */
    public ca_path?: string = undefined;
    /** Semi-colon delimited list of ALPN protocols to be used on platforms which support ALPN */
    public alpn_list?: string = undefined;
    /** Path to certificate, in PEM format */
    public certificate_path?: string = undefined;
    /** Path to private key, in PEM format */
    public private_key_path?: string = undefined;
    /** Path to certificate, in PKCS#12 format. Currently, only supported on OSX */
    public pkcs12_path?: string = undefined;
    /** Password for PKCS#12. Currently, only supported on OSX. */
    public pkcs12_password?: string = undefined;
    /** 
     * In client mode, this turns off x.509 validation. Don't do this unless you are testing.
     * It is much better to just override the default trust store and pass the self-signed
     * certificate as the ca_file argument.
     * 
     * In server mode, this defaults to false. If you want to enforce mutual TLS on the server,
     * set this to true.
     */
    public verify_peer: boolean = false;

    /** overrides the default system trust store. 
     * @param ca_path - Only used on Unix-style systems where all trust anchors are 
     * stored in a directory (e.g. /etc/ssl/certs). 
     * @param ca_file - Single file containing all trust CAs, in PEM format
     */
    override_default_trust_store(ca_path?: string, ca_file?: string): void {
        this.ca_path = ca_path;
        this.ca_file = ca_file;
    }

    /** 
     * Creates a client with secure-by-default options, along with a client cert and private key
     * @param certificate_path - Path to client certificate, in PEM format
     * @param private_key_path - Path to private key, in PEM format
     */
    static create_client_with_mtls(certificate_path: string, private_key_path: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.certificate_path = certificate_path;
        opt.private_key_path = private_key_path;
        opt.verify_peer = true;
        return opt;
    }

    /** 
     * Creates a TLS context with secure-by-default options, along with a client cert and password
     * @param pkcs12_path - Path to client certificate in PKCS#12 format
     * @param pkcs12_password - PKCS#12 password
    */
    static create_client_with_mtls_pkcs(pkcs12_path: string, pkcs12_password: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.pkcs12_path = pkcs12_path;
        opt.pkcs12_password = pkcs12_password;
        opt.verify_peer = true;
        return opt;
    }

    /** 
     * Creates TLS context with peer verification disabled, along with a certificate and private key
     * @param certificate_path - Path to certificate, in PEM format
     * @param private_key_path - Path to private key, in PEM format 
     *      
     */
    static create_server_with_mtls(certificate_path: string, private_key_path: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.certificate_path = certificate_path;
        opt.private_key_path = private_key_path;
        opt.verify_peer = false;
        return opt;
    }

    /**
     * Creates TLS context with peer verification disabled, along with a certificate and private key
     * in PKCS#12 format
     * @param pkcs12_path - Path to certificate, in PKCS#12 format
     * @param pkcs12_password - PKCS#12 Password
     *
     */
    static create_server_with_mtls_pkcs(pkcs12_path: string, pkcs12_password: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.pkcs12_path = pkcs12_path;
        opt.pkcs12_password = pkcs12_password;
        opt.verify_peer = false;
        return opt;
    }
}

/** 
 * TLS context used for client TLS communications over sockets. If no 
 * options are supplied, the context will default to enabling peer verification
 * only. 
 * 
 * nodejs only.
 */
export class ClientTlsContext extends NativeResource {
    constructor(ctx_opt?: TlsContextOptions) {
        if (!ctx_opt) {
            ctx_opt = new TlsContextOptions()
            ctx_opt.verify_peer = true;
        }
        super(crt_native.io_client_tls_ctx_new(
            ctx_opt.min_tls_version,
            ctx_opt.ca_file,
            ctx_opt.ca_path,
            ctx_opt.alpn_list,
            ctx_opt.certificate_path,
            ctx_opt.private_key_path,
            ctx_opt.pkcs12_path,
            ctx_opt.pkcs12_password,
            ctx_opt.verify_peer));
    }
}

/** 
 * TLS context used for server TLS communications over sockets. If no
 * options are supplied, the context will default to disabling peer verification
 * only. 
 * 
 * nodejs only.
 */
export class ServerTlsContext extends NativeResource {
    constructor(ctx_opt?: TlsContextOptions) {
        if (!ctx_opt) {
            ctx_opt = new TlsContextOptions();
            ctx_opt.verify_peer = false;
        }
        super(crt_native.io_client_tls_ctx_new(
            ctx_opt.min_tls_version,
            ctx_opt.ca_file,
            ctx_opt.ca_path,
            ctx_opt.alpn_list,
            ctx_opt.certificate_path,
            ctx_opt.private_key_path,
            ctx_opt.pkcs12_path,
            ctx_opt.pkcs12_password,
            ctx_opt.verify_peer));
    }
}
