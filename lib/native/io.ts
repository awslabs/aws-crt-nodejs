/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import crt_native from './binding';
import { NativeResource } from "./native_resource";
import { TlsVersion, SocketType, SocketDomain } from '../common/io';
import { Readable } from 'stream';
export { TlsVersion, SocketType, SocketDomain } from '../common/io';

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

/**
 * Convert a native error code into a human-readable identifier
 * @param error_code - An error code returned from a native API call, or delivered
 * via callback.
 * @see CrtError
 *
 * nodejs only.
 */
export function error_code_to_name(error_code: number): string {
    return crt_native.error_code_to_name(error_code);
}

/**
 * The amount of detail that will be logged
 * @module aws-crt
 * @category Logging
 */
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
 * @param level - The logging level to filter to. It is not possible to log less than WARN.
 *
 * nodejs only.
 * @module aws-crt
 * @category Logging
 */
export function enable_logging(level: LogLevel) {
    crt_native.io_logging_enable(level);
}

/**
 * Returns true if ALPN is available on this platform natively
 * @return true if ALPN is supported natively, false otherwise
 *
 * nodejs only.
 * @module aws-crt
 * @category TLS
*/
export function is_alpn_available(): boolean {
    return crt_native.is_alpn_available();
}

/**
 * Wraps a ```Readable``` for reading by native code, used to stream
 *  data into the AWS CRT libraries.
 *
 * nodejs only.
 * @module aws-crt
 * @category I/O
 */
export class InputStream extends NativeResource {
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
 * @module aws-crt
 * @category I/O
 */
export class ClientBootstrap extends NativeResource {
    constructor() {
        super(crt_native.io_client_bootstrap_new());
    }
}

/**
 * Standard Berkeley socket style options.
 *
 * nodejs only.
 * @module aws-crt
 * @category I/O
*/
export class SocketOptions extends NativeResource {
    constructor(
        type = SocketType.STREAM,
        domain = SocketDomain.IPV6,
        connect_timeout_ms = 5000,
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
 * @module aws-crt
 * @category TLS
 */
export class TlsContextOptions {
    /** Minimum version of TLS to support. Uses OS/system default if unspecified. */
    public min_tls_version: TlsVersion = TlsVersion.Default;
    /** Path to a single file with all trust anchors in it, in PEM format */
    public ca_filepath?: string;
    /** Path to directory containing trust anchors. Only used on Unix-style systems. */
    public ca_dirpath?: string;
    /** String with all trust anchors in it, in PEM format */
    public certificate_authority?: string;
    /** List of ALPN protocols to be used on platforms which support ALPN */
    public alpn_list: string[] = [];
    /** Path to certificate, in PEM format */
    public certificate_filepath?: string;
    /** Certificate, in PEM format */
    public certificate?: string;
    /** Path to private key, in PEM format */
    public private_key_filepath?: string;
    /** Private key, in PEM format */
    public private_key?: string;
    /** Path to certificate, in PKCS#12 format. Currently, only supported on OSX */
    public pkcs12_filepath?: string;
    /** Password for PKCS#12. Currently, only supported on OSX. */
    public pkcs12_password?: string;
    /**
     * In client mode, this turns off x.509 validation. Don't do this unless you are testing.
     * It is much better to just override the default trust store and pass the self-signed
     * certificate as the ca_file argument.
     *
     * In server mode, this defaults to false. If you want to enforce mutual TLS on the server,
     * set this to true.
     */
    public verify_peer: boolean = false;

    /**
     * Overrides the default system trust store.
     * @param ca_dirpath - Only used on Unix-style systems where all trust anchors are
     * stored in a directory (e.g. /etc/ssl/certs).
     * @param ca_filepath - Single file containing all trust CAs, in PEM format
     */
    override_default_trust_store_from_path(ca_dirpath?: string, ca_filepath?: string) {
        this.ca_dirpath = ca_dirpath;
        this.ca_filepath = ca_filepath;
    }

    /**
     * Overrides the default system trust store.
     * @param certificate_authority - String containing all trust CAs, in PEM format
     */
    override_default_trust_store(certificate_authority: string) {
        this.certificate_authority = certificate_authority;
    }

    /**
     * Creates a client with secure-by-default options, along with a client cert and private key
     * @param certificate - Client certificate, in PEM format
     * @param private_key - Client private key, in PEM format
     */
    static create_client_with_mtls(certificate: string, private_key: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.certificate = certificate;
        opt.private_key = private_key;
        opt.verify_peer = true;
        return opt;
    }

    /**
     * Creates a client with secure-by-default options, along with a client cert and private key
     * @param certificate_filepath - Path to client certificate, in PEM format
     * @param private_key_filepath - Path to private key, in PEM format
     */
    static create_client_with_mtls_from_path(certificate_filepath: string, private_key_filepath: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.certificate_filepath = certificate_filepath;
        opt.private_key_filepath = private_key_filepath;
        opt.verify_peer = true;
        return opt;
    }

    /**
     * Creates a TLS context with secure-by-default options, along with a client cert and password
     * @param pkcs12_filepath - Path to client certificate in PKCS#12 format
     * @param pkcs12_password - PKCS#12 password
    */
    static create_client_with_mtls_pkcs_from_path(pkcs12_filepath: string, pkcs12_password: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.pkcs12_filepath = pkcs12_filepath;
        opt.pkcs12_password = pkcs12_password;
        opt.verify_peer = true;
        return opt;
    }

    /**
     * Creates TLS context with peer verification disabled, along with a certificate and private key
     * @param certificate_filepath - Path to certificate, in PEM format
     * @param private_key_filepath - Path to private key, in PEM format
     *
     */
    static create_server_with_mtls_from_path(certificate_filepath: string, private_key_filepath: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.certificate_filepath = certificate_filepath;
        opt.private_key_filepath = private_key_filepath;
        opt.verify_peer = false;
        return opt;
    }

    /**
     * Creates TLS context with peer verification disabled, along with a certificate and private key
     * in PKCS#12 format
     * @param pkcs12_filepath - Path to certificate, in PKCS#12 format
     * @param pkcs12_password - PKCS#12 Password
     *
     */
    static create_server_with_mtls_pkcs_from_path(pkcs12_filepath: string, pkcs12_password: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.pkcs12_filepath = pkcs12_filepath;
        opt.pkcs12_password = pkcs12_password;
        opt.verify_peer = false;
        return opt;
    }
}

/**
 * TLS context used for client/server TLS communications over sockets.
 *
 * @see ClientTlsContext
 * @see ServerTlsContext
 *
 * nodejs only.
 * @module aws-crt
 * @category TLS
 */
export abstract class TlsContext extends NativeResource {
    constructor(ctx_opt: TlsContextOptions) {
        super(crt_native.io_tls_ctx_new(
            ctx_opt.min_tls_version,
            ctx_opt.ca_filepath,
            ctx_opt.ca_dirpath,
            ctx_opt.certificate_authority,
            (ctx_opt.alpn_list && ctx_opt.alpn_list.length > 0) ? ctx_opt.alpn_list.join(';') : undefined,
            ctx_opt.certificate_filepath,
            ctx_opt.certificate,
            ctx_opt.private_key_filepath,
            ctx_opt.private_key,
            ctx_opt.pkcs12_filepath,
            ctx_opt.pkcs12_password,
            ctx_opt.verify_peer));
    }
}

/**
 * TLS context used for client TLS communications over sockets. If no
 * options are supplied, the context will default to enabling peer verification
 * only.
 *
 * nodejs only.
 * @module aws-crt
 * @category TLS
 */
export class ClientTlsContext extends TlsContext {
    constructor(ctx_opt?: TlsContextOptions) {
        if (!ctx_opt) {
            ctx_opt = new TlsContextOptions()
            ctx_opt.verify_peer = true;
        }
        super(ctx_opt);
    }
}

/**
 * TLS context used for server TLS communications over sockets. If no
 * options are supplied, the context will default to disabling peer verification
 * only.
 *
 * nodejs only.
 * @module aws-crt
 * @category TLS
 */
export class ServerTlsContext extends TlsContext {
    constructor(ctx_opt?: TlsContextOptions) {
        if (!ctx_opt) {
            ctx_opt = new TlsContextOptions();
            ctx_opt.verify_peer = false;
        }
        super(ctx_opt);
    }
}

/**
 * TLS options that are unique to a given connection using a shared TlsContext.
 *
 * nodejs only.
 * @module aws-crt
 * @category TLS
 */
export class TlsConnectionOptions extends NativeResource {
    constructor(readonly tls_ctx: TlsContext, readonly server_name?: string, readonly alpn_list: string[] = []) {
        super(crt_native.io_tls_connection_options_new(
            tls_ctx.native_handle(),
            server_name,
            (alpn_list && alpn_list.length > 0) ? alpn_list.join(';') : undefined
        ));
    }
}
