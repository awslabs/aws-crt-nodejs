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

import { InputStream } from "./io";
import { AwsSigningAlgorithm } from "./auth";
import { HttpHeader, HttpHeaders as CommonHttpHeaders } from "../common/http";

/** 
 * Type used to store pointers to CRT native resources 
 * @internal
 */
type NativeHandle = any;
type StringLike = string | ArrayBuffer | DataView;

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
): NativeHandle;
    
/** @internal */
export function mqtt_client_connection_connect(
    connection: NativeHandle,
    client_id: StringLike,
    server_name: StringLike,
    port: number,
    tls_ctx?: NativeHandle,
    socket_options?: NativeHandle,
    keep_alive_time?: number,
    timeout?: number,
    will?: { topic: StringLike, payload: String | Object | DataView, qos: number, retain: boolean },
    username?: StringLike,
    password?: StringLike,
    use_websocket?: boolean,
    proxy_options?: NativeHandle,
    clean_session?: boolean,
    on_connect?: mqtt_on_connect,
    websocket_handshake_transform?: (request: any, done: (error_code?: number) => void) => void,
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
    on_publish?: (topic: string, payload: ArrayBuffer) => void,
    on_suback?: (packet_id: number, topic: string, qos: any, error_code: number) => void,
): void;

/** @internal */
export function mqtt_client_connection_on_message(
    connection: NativeHandle,
    on_publish?: (topic: string, payload: Buffer) => void
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

/** @internal */
export class HttpHeaders implements CommonHttpHeaders {
    constructor(headers?: HttpHeader[]);

    public readonly length: number;

    public get(key: string): string;
    public get_values(key: string): string[];
    public get_index(index: number): HttpHeader;

    public [Symbol.iterator](): Iterator<HttpHeader>;

    public add(key: string, value: string): void;
    public set(key: string, value: string): void;

    public remove(key: string): void;
    public remove_value(key: string, value: string): void;
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

/** Body signing config enumeration */
export enum AwsBodySigningConfigType {
    /**
     * No attempts will be made to sign the payload, and no "x-amz-content-sha256"
     * header will be added to the request.
     */
    AWS_BODY_SIGNING_OFF = 0,
    /** 
     * The body will be signed and "x-amz-content-sha256" will contain
     * the value of the signature. 
     */
    AWS_BODY_SIGNING_ON = 1,
    /**
     * The body will not be signed, but "x-amz-content-sha256" will contain
     * the value "UNSIGNED-PAYLOAD". This value is currently only used for Amazon S3.
     */
    AWS_BODY_SIGNING_UNSIGNED_PAYLOAD = 2,
}

/**
 * Configuration for use in AWS-related signing.
 * AwsSigningConfig is immutable.
 * It is good practice to use a new config for each signature, or the date might get too old.
 */
export interface AwsSigningConfig {
    /** Which signing process to invoke */
    algorithm: AwsSigningAlgorithm;
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
     * Parameters to skip when signing. 
     * 
     * Skipping auth-required params will result in an unusable signature.
     * Headers injected by the signing process are not skippable.
     * This function does not override the internal check function
     * (x-amzn-trace-id, user-agent), but rather supplements it.
     * In particular, a header will get signed if and only if it returns
     * true to both the internal check (skips x-amzn-trace-id, user-agent)
     * and is found in this list (if defined)
     */
    param_blacklist?: string[];
    /**
     * Set true to double-encode the resource path when constructing the 
     * canonical request. By default, all services except S3 use double encoding.
     */
    use_double_uri_encode?: boolean;
    /**
     * Whether the resource paths are normalized when building the canonical request.
     */
    should_normalize_uri_path?: boolean;
    /** Controls how the payload will be signed. */
    body_signing_type?: AwsBodySigningConfigType;
}

export function aws_sign_request(
    request: HttpRequest,
    config: AwsSigningConfig,
    on_complete: (error_code: number) => void
): void;
