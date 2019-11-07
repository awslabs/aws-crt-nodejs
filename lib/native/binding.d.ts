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

type NativeHandle = any;
type StringLike = string | ArrayBuffer | DataView;

/* IO */
export declare function error_code_to_string(error_code: number): string;
export declare function error_code_to_name(error_code: number): string;
export declare function io_logging_enable(log_level: number): void;
export declare function is_alpn_available(): boolean;
export declare function io_client_bootstrap_new(): NativeHandle;
export declare function io_tls_ctx_new(
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
export declare function io_tls_connection_options_new(
    tls_ctx: NativeHandle,
    server_name?: StringLike,
    alpn_list?: StringLike
): NativeHandle;
export declare function io_socket_options_new(
    type: number,
    domain: number,
    connect_timeout_ms: number,
    keep_alive_interval_sec: number,
    keep_alive_timeout_sec: number,
    keep_alive_max_failed_probes: number,
    keepalive: boolean
): NativeHandle;
export declare function io_input_stream_new(capacity: number): NativeHandle;
export declare function io_input_stream_append(stream: NativeHandle, data?: Buffer): void;

/* Crypto */
export declare function hash_md5_new(): void;
export declare function hash_sha256_new(): void;
export declare function hash_update(handle: NativeHandle, data: StringLike): void;
export declare function hash_digest(handle: NativeHandle, truncate_to?: number): DataView;

export declare function hash_md5_compute(data: StringLike, truncate_to?: number): DataView;
export declare function hash_sha256_compute(data: StringLike, truncate_to?: number): DataView;

export declare function hmac_md5_new(secret: StringLike): void;
export declare function hmac_sha256_new(secret: StringLike): void;
export declare function hmac_update(handle: NativeHandle, data: StringLike): void;
export declare function hmac_digest(handle: NativeHandle, truncate_to?: number): DataView;

export declare function hmac_md5_compute(secret: StringLike, data: StringLike, truncate_to?: number): DataView;
export declare function hmac_sha256_compute(secret: StringLike, data: StringLike, truncate_to?: number): DataView;

/* MQTT Client */
export declare function mqtt_client_new(client_bootstrap: NativeHandle): NativeHandle;

/* MQTT Client Connection */
export type mqtt_on_connect = (error_code: number, return_code: number, session_present: boolean) => void;
export declare function mqtt_client_connection_new(
    client: NativeHandle,
    on_interrupted?: (error_code: number) => void,
    on_resumed?: (return_code: number, session_present: boolean) => void,
    ): NativeHandle;
export declare function mqtt_client_connection_connect(
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
    ): void;
export declare function mqtt_client_connection_reconnect(connection: NativeHandle, on_connect: mqtt_on_connect): void;
export declare function mqtt_client_connection_publish(
    connection: NativeHandle,
    topic: StringLike,
    payload: StringLike,
    qos: number,
    retain: boolean,
    on_publish?: (packet_id: number, error_code: number) => void,
    ): void;
export declare function mqtt_client_connection_subscribe(
    connection: NativeHandle,
    topic: StringLike,
    qos: number,
    on_publish?: (topic: string, payload: ArrayBuffer) => void,
    on_suback?: (packet_id: number, topic: string, qos: any, error_code: number) => void,
    ): void;
export declare function mqtt_client_connection_unsubscribe(
    connection: NativeHandle,
    topic: StringLike,
    on_unsuback?: (packet_id: number, error_code: number) => void,
    ): void;
export declare function mqtt_client_connection_disconnect(connection: NativeHandle, on_disconnect?: () => void): void;
export declare function mqtt_client_connection_close(connection: NativeHandle): void;

/* HTTP */
export declare function http_proxy_options_new(
    host_name: StringLike,
    port: number,
    auth_method?: number,
    username?: StringLike,
    password?: StringLike,
    tls_options?: NativeHandle,
): NativeHandle;
export declare function http_connection_new(
    bootstrap: NativeHandle,
    on_setup: (handle: any, error_code: number) => void,
    on_shutdown: (handle: any, error_code: number) => void,
    host_name: StringLike,
    port: number,
    socket_options?: NativeHandle,
    tls_options?: NativeHandle,
    proxy_options?: NativeHandle,
): NativeHandle;
export declare function http_connection_close(connection: NativeHandle): void;
export declare function http_stream_new(
    stream: NativeHandle,
    method: StringLike,
    path: StringLike,
    body: NativeHandle | undefined,
    headers: [string, string][],
    on_complete: (error_code: Number) => void,
    on_response: (status_code: Number, headers: [string, string][]) => void,
    on_body: (data: ArrayBuffer) => void,
): NativeHandle;
export declare function http_stream_close(stream: NativeHandle): void;
export declare function http_connection_manager_new(
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
export declare function http_connection_manager_close(manager: NativeHandle): void;
export declare function http_connection_manager_acquire(
    manager: NativeHandle,
    on_acquired: (handle: any, error_code: number) => void,
): void;
export declare function http_connection_manager_release(manager: NativeHandle, connection: NativeHandle): void;
