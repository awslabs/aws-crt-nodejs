/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { InputStream } from "./io";
import { AwsSigningAlgorithm, AwsSignatureType, AwsSignedBodyValue, AwsSignedBodyHeaderType } from "./auth";
import { HttpHeader, HttpHeaders as CommonHttpHeaders } from "../common/http";
import { OnMessageCallback, QoS } from "lib/common/mqtt";

/**
 * Type used to store pointers to CRT native resources
 * @internal
 */
type NativeHandle = any;

/** @category System */
type StringLike = string | ArrayBuffer | ArrayBufferView;

/* common */
/** @internal */
export function native_memory(): number;
/** @internal */
export function native_memory_dump(): void;
/** @internal */
export function error_code_to_string(error_code: number): string;
/** @internal */
export function error_code_to_name(error_code: number): string;

/* IO */
/** @internal */
export function io_logging_enable(log_level: number): void;
/** @internal */
export function is_alpn_available(): boolean;
/* wraps aws_client_bootstrap #TODO: Wrap with ClassBinder */
/** @internal */
export function io_client_bootstrap_new(): NativeHandle;
/* wraps aws_tls_context #TODO: Wrap with ClassBinder */
/** @internal */
export function io_tls_ctx_new(
    min_tls_version: number,
    ca_filepath?: StringLike,
    ca_dirpath?: StringLike,
    certificate_authority?: StringLike,
    alpn_list?: StringLike,
    certificate_filepath?: StringLike,
    certificate?: StringLike,
    private_key_filepath?: StringLike,
    private_key?: StringLike,
    pkcs12_filepath?: StringLike,
    pkcs12_password?: StringLike,
    verify_peer?: boolean,
): NativeHandle;
/* wraps aws_tls_connection_options #TODO: Wrap with ClassBinder */
/** @internal */
export function io_tls_connection_options_new(
    tls_ctx: NativeHandle,
    server_name?: StringLike,
    alpn_list?: StringLike
): NativeHandle;
/* wraps aws_socket_options #TODO: Wrap with ClassBinder */
/** @internal */
export function io_socket_options_new(
    type: number,
    domain: number,
    connect_timeout_ms: number,
    keep_alive_interval_sec: number,
    keep_alive_timeout_sec: number,
    keep_alive_max_failed_probes: number,
    keepalive: boolean
): NativeHandle;

/* wraps aws_input_stream #TODO: Wrap with ClassBinder */
/** @internal */
export function io_input_stream_new(capacity: number): NativeHandle;
/** @internal */
export function io_input_stream_append(stream: NativeHandle, data?: Buffer): void;

/* Crypto */
/* wraps aws_hash structures #TODO: Wrap with ClassBinder */
/** @internal */
export function hash_md5_new(): void;
/** @internal */
export function hash_sha256_new(): void;
/** @internal */
export function hash_update(handle: NativeHandle, data: StringLike): void;
/** @internal */
export function hash_digest(handle: NativeHandle, truncate_to?: number): DataView;

/** @internal */
export function hash_md5_compute(data: StringLike, truncate_to?: number): DataView;
/** @internal */
export function hash_sha256_compute(data: StringLike, truncate_to?: number): DataView;

/** @internal */
export function hmac_md5_new(secret: StringLike): void;
/** @internal */
export function hmac_sha256_new(secret: StringLike): void;
/** @internal */
export function hmac_update(handle: NativeHandle, data: StringLike): void;
/** @internal */
export function hmac_digest(handle: NativeHandle, truncate_to?: number): DataView;

/** @internal */
export function hmac_md5_compute(secret: StringLike, data: StringLike, truncate_to?: number): DataView;
/** @internal */
export function hmac_sha256_compute(secret: StringLike, data: StringLike, truncate_to?: number): DataView;

/* MQTT Client */
/** @internal */
export function mqtt_client_new(client_bootstrap: NativeHandle): NativeHandle;

/* MQTT Client Connection #TODO: Wrap with ClassBinder */
/** @internal */
export type mqtt_on_connect = (error_code: number, return_code: number, session_present: boolean) => void;

/** @internal */
export function mqtt_client_connection_new(
    client: NativeHandle,
    on_interrupted?: (error_code: number) => void,
    on_resumed?: (return_code: number, session_present: boolean) => void,
    tls_ctx?: NativeHandle,
    will?: { topic: StringLike, payload: StringLike, qos: number, retain: boolean },
    username?: StringLike,
    password?: StringLike,
    use_websocket?: boolean,
    proxy_options?: NativeHandle,
    websocket_handshake_transform?: (request: HttpRequest, done: (error_code?: number) => void) => void,
): NativeHandle;

/** @internal */
export function mqtt_client_connection_connect(
    connection: NativeHandle,
    client_id: StringLike,
    server_name: StringLike,
    port: number,
    socket_options?: NativeHandle,
    keep_alive_time?: number,
    timeout?: number,
    clean_session?: boolean,
    on_connect?: mqtt_on_connect,
): void;

/** @internal */
export function mqtt_client_connection_reconnect(connection: NativeHandle, on_connect: mqtt_on_connect): void;

/** @internal */
export function mqtt_client_connection_publish(
    connection: NativeHandle,
    topic: StringLike,
    payload: StringLike,
    qos: number,
    retain: boolean,
    on_publish?: (packet_id: number, error_code: number) => void,
): void;


/** @internal */
export function mqtt_client_connection_subscribe(
    connection: NativeHandle,
    topic: StringLike,
    qos: number,
    on_publish?: OnMessageCallback,
    on_suback?: (packet_id: number, topic: string, qos: QoS, error_code: number) => void,
): void;

/** @internal */
export function mqtt_client_connection_on_message(
    connection: NativeHandle,
    on_publish?: OnMessageCallback
): void;

/** @internal */
export function mqtt_client_connection_unsubscribe(
    connection: NativeHandle,
    topic: StringLike,
    on_unsuback?: (packet_id: number, error_code: number) => void,
): void;

/** @internal */
export function mqtt_client_connection_disconnect(connection: NativeHandle, on_disconnect?: () => void): void;

/** @internal */
export function mqtt_client_connection_close(connection: NativeHandle): void;

/* HTTP */
/* wraps aws_http_proxy_options #TODO: Wrap with ClassBinder */
/** @internal */
export function http_proxy_options_new(
    host_name: StringLike,
    port: number,
    auth_method?: number,
    username?: StringLike,
    password?: StringLike,
    tls_options?: NativeHandle,
): NativeHandle;

/* wraps aws_http_connection #TODO: Wrap with ClassBinder */
/** @internal */
export function http_connection_new(
    bootstrap: NativeHandle,
    on_setup: (handle: any, error_code: number) => void,
    on_shutdown: (handle: any, error_code: number) => void,
    host_name: StringLike,
    port: number,
    socket_options?: NativeHandle,
    tls_options?: NativeHandle,
    proxy_options?: NativeHandle,
): NativeHandle;

/** @internal */
export function http_connection_close(connection: NativeHandle): void;

/* wraps aws_http_stream #TODO: Wrap with ClassBinder */
/** @internal */
export function http_stream_new(
    stream: NativeHandle,
    request: HttpRequest,
    on_complete: (error_code: Number) => void,
    on_response: (status_code: Number, headers: HttpHeader[]) => void,
    on_body: (data: ArrayBuffer) => void,
): NativeHandle;

/** @internal */
export function http_stream_activate(stream: NativeHandle): void;

/** @internal */
export function http_stream_close(stream: NativeHandle): void;

/* wraps aws_http_connection_manager #TODO: Wrap with ClassBinder */
/** @internal */
export function http_connection_manager_new(
    bootstrap: NativeHandle,
    host: StringLike,
    port: number,
    max_connections: number,
    window_size: number,
    socket_options?: NativeHandle,
    tls_options?: NativeHandle,
    proxy_options?: NativeHandle,
    on_shutdown?: () => void,
): NativeHandle;

/** @internal */
export function http_connection_manager_close(manager: NativeHandle): void;

/** @internal */
export function http_connection_manager_acquire(
    manager: NativeHandle,
    on_acquired: (handle: any, error_code: number) => void,
): void;

/** @internal */
export function http_connection_manager_release(manager: NativeHandle, connection: NativeHandle): void;

/**
 * A collection of HTTP headers
 *
 * @module aws-crt
 * @category HTTP
 */
export class HttpHeaders implements CommonHttpHeaders {
    /** Construct from a collection of [name, value] pairs */
    constructor(headers?: HttpHeader[]);

    public readonly length: number;

    /**
     * Gets the first value for the given name, ignoring any additional values
     * @param name - The header name to look for
     * @param default_value - Value returned if no values are found for the given name
     * @return The first header value, or default if no values exist
     */
    public get(key: string): string;
    /**
     * Get the list of values for the given name
     * @param name - The header name to look for
     * @return List of values, or empty list if none exist
     */
    public get_values(key: string): string[];

    /** @internal */
    public get_index(index: number): HttpHeader;

    /**
     * Iterator. Allows for:
     * let headers = new HttpHeaders();
     * ...
     * for (const header of headers) { }
    */
    public [Symbol.iterator](): Iterator<HttpHeader>;

    /**
     * Add a name/value pair
     * @param name - The header name
     * @param value - The header value
    */
    public add(key: string, value: string): void;

    /**
     * Set a name/value pair, replacing any existing values for the name
     * @param name - The header name
     * @param value - The header value
    */
    public set(key: string, value: string): void;

    /**
     * Removes all values for the given name
     * @param name - The header to remove all values for
     */
    public remove(key: string): void;

    /**
     * Removes a specific name/value pair
     * @param name - The header name to remove
     * @param value - The header value to remove
     */
    public remove_value(key: string, value: string): void;

    /** Clears the entire header set */
    public clear(): void;

    /** @internal */
    public _flatten(): HttpHeader[];
}

/**
 * Definition for an outgoing HTTP request.
 *
 * The request may be transformed (ex: signing the request) before its data is eventually sent.
 */
export class HttpRequest {
    constructor(method: string, path: string, headers?: HttpHeaders, body?: InputStream);

    /** HTTP request method (verb). Default value is "GET". */
    public method: string;
    /** HTTP path-and-query value. Default value is "/". */
    public path: string;
    /** Optional headers. */
    public readonly headers: HttpHeaders;
    /** Optional body as a stream */
    public body: InputStream;
}

/** @internal */
export class AwsCredentialsProvider {
    protected constructor();

    static newDefault(bootstrap: NativeHandle): AwsCredentialsProvider;
    static newStatic(access_key: StringLike, secret_key: StringLike, session_token?: StringLike): AwsCredentialsProvider;
}

/**
 * Configuration for use in AWS-related signing.
 * AwsSigningConfig is immutable.
 * It is good practice to use a new config for each signature, or the date might get too old.
 */
export interface AwsSigningConfig {
    /** Which signing process to invoke */
    algorithm: AwsSigningAlgorithm;
    /** What kind of signature to compute */
    signature_type: AwsSignatureType;
    /** Credentials provider to fetch signing credentials with */
    provider: AwsCredentialsProvider;
    /** The region to sign against */
    region: string;
    /** Name of service to sign a request for */
    service?: string;
    /**
     * Date and time to use during the signing process. If not provided then
     * the current time in UTC is used. Naive dates (lacking timezone info)
     * are assumed to be in local time
     */
    date?: Date;
    /**
     * Headers to skip when signing.
     *
     * Skipping auth-required headers will result in an unusable signature.
     * Headers injected by the signing process are not skippable.
     * This function does not override the internal check function
     * (x-amzn-trace-id, user-agent), but rather supplements it.
     * In particular, a header will get signed if and only if it returns
     * true to both the internal check (skips x-amzn-trace-id, user-agent)
     * and is found in this list (if defined)
     */
    header_blacklist?: string[];
    /**
     * Set true to double-encode the resource path when constructing the
     * canonical request. By default, all services except S3 use double encoding.
     */
    use_double_uri_encode?: boolean;
    /**
     * Whether the resource paths are normalized when building the canonical request.
     */
    should_normalize_uri_path?: boolean;
    /**
     * Should the session token be omitted from the signing process?  This should only be
     * true when making a websocket handshake with IoT Core.
     */
    omit_session_token?: boolean;
    /**
     * Value to use as the canonical request's body value.
     *
     * Typically, this is the SHA-256 of the payload, written as lowercase hex.
     * If this has been precalculated, it can be set here.
     * Special values used by certain services can also be set (see {@link AwsSignedBodyValue}).
     * If undefined (the default), the typical value will be calculated from the payload during signing.
     */
    signed_body_value?: string;
    /** Controls what header, if any, should be added to the request, containing the body value */
    signed_body_header?: AwsSignedBodyHeaderType;
    /** Query param signing only: how long the pre-signed URL is valid for */
    expiration_in_seconds?: number;
}

/** @internal */
export function aws_sign_request(
    request: HttpRequest,
    config: AwsSigningConfig,
    on_complete: (error_code: number) => void
): void;
