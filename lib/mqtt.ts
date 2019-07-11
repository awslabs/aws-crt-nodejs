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

import * as io from "./io";
import { TextEncoder } from 'util';
import ResourceSafety = require('./resource_safety')

export enum QoS {
    AtMostOnce = 0,
    AtLeastOnce = 1,
    ExactlyOnce = 2,
}

export class Client {
    public bootstrap: io.ClientBootstrap;

    private client_handle: any;

    constructor(bootstrap: io.ClientBootstrap, tls_ctx?: io.ClientTlsContext) {
        this.bootstrap = bootstrap;
        this.client_handle = crt_native.mqtt_client_new(bootstrap.native_handle())
    }

    new_connection(config: ConnectionConfig) {
        return new Connection(this, config)
    }

    native_handle(): any {
        return this.client_handle;
    }
}

export interface ConnectionConfig {
    client_id: string;
    host_name: string;
    port: number;
    use_websocket?: boolean;
    clean_session?: boolean;
    keep_alive?: number;
    timeout?: number;
    will?: string;
    username?: string;
    password?: string;
    tls_ctx?: io.ClientTlsContext;
}

export interface MqttRequest {
    packet_id: number;
}

export interface MqttSubscribeRequest extends MqttRequest {
    topic: string;
    qos: QoS;
    error_code: number;
}

type Payload = string | Object | DataView;

export class AwsIotMqttConnectionConfigBuilder {
    params: ConnectionConfig   
    tls_ctx_options?: io.TlsContextOptions

    private constructor() {
        this.params = {
            client_id: '', 
            host_name: '', 
            port: io.is_alpn_available() ? 443 : 8883,
            use_websocket: false,
            clean_session: false,
            keep_alive: undefined,
            will: undefined,
            username: '?SDK=NodeJSv2&Version=0.1.0',
            password: undefined,
            tls_ctx: undefined,
        };
    }

    static new_mtls_builder_from_path(cert_path: string, key_path: string) {
        let builder = new AwsIotMqttConnectionConfigBuilder();
        builder.tls_ctx_options = io.TlsContextOptions.create_client_with_mtls(cert_path, key_path);
        
        if (io.is_alpn_available()) {
            builder.tls_ctx_options.alpn_list = 'x-amzn-mqtt-ca';
        }   
        
        return builder;
    }  

    with_certificate_authority_from_path(ca_path?: string, ca_file?: string) {
        if (this.tls_ctx_options !== undefined) {
            this.tls_ctx_options.override_default_trust_store(ca_path, ca_file);
        }

        return this;
    }

    with_endpoint(endpoint: string) {
        this.params.host_name = endpoint;
        return this;
    }

    with_client_id(client_id: string) {
        this.params.client_id = client_id;
        return this;
    }

    with_clean_session(clean_session: boolean) {
        this.params.clean_session = clean_session;
        return this;
    }

    with_use_websockets() {
        this.params.use_websocket = true;

        if (this.tls_ctx_options !== undefined) {
            this.tls_ctx_options.alpn_list = undefined;
            this.params.port = 443;
        }

        return this;
    }

    with_keep_alive_seconds(keep_alive: number) {
        this.params.keep_alive = keep_alive;
        return this;
    }

    with_timeout_ms(timeout_ms: number) {
        this.params.timeout = timeout_ms;
        return this;
    }

    with_will(will: string) {
        this.params.will = will;
        return this;
    }

    build() {
        if (this.params.client_id === undefined || this.params.host_name === undefined) {
            throw 'client_id and endpoint are required';
        }

        if (this.tls_ctx_options === undefined) {
            throw 'tls options have to be specified'
        }

        this.params.tls_ctx = new io.ClientTlsContext(this.tls_ctx_options);       
        return this.params;       
    }
}

export class Connection implements ResourceSafety.ResourceSafe {
    public client: Client;
    private connection_handle: any;
    private encoder: TextEncoder;
    private config: ConnectionConfig

    constructor(client: Client, config: ConnectionConfig, on_connection_interrupted?: (error_code: number) => void, on_connection_resumed?: (return_code: number, session_present: boolean) => void) {
        this.client = client;
        this.config = config;
        this.connection_handle = crt_native.mqtt_client_connection_new(client.native_handle(), on_connection_interrupted, on_connection_resumed);
        this.encoder = new TextEncoder();
    }

    close() {
        crt_native.mqtt_client_connection_close(this.native_handle())
    }

    async connect() {
        return new Promise<boolean>((resolve, reject) => {

            function on_connect(error_code: number, return_code: number, session_present: boolean) {
                console.log("on_connect ec:", error_code);
                if (error_code == 0 && return_code == 0) {
                    resolve(session_present);
                } else if (error_code != 0) {
                    reject("Failed to connect: " + io.error_code_to_string(error_code));
                } else {
                    reject("Server rejected connection.");
                }
            }

            try {
                crt_native.mqtt_client_connection_connect(
                    this.native_handle(),
                    this.config.client_id,
                    this.config.host_name,
                    this.config.port,
                    this.config.tls_ctx ? this.config.tls_ctx.native_handle() : null,
                    this.config.keep_alive,
                    this.config.will,
                    this.config.username,
                    this.config.password,
                    on_connect,
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    async reconnect() {
        return new Promise<boolean>((resolve, reject) => {

            function on_connect(error_code: number, return_code: number, session_present: boolean) {
                if (error_code == 0 && return_code == 0) {
                    resolve(session_present);
                } else if (error_code != 0) {
                    reject("Failed to connect: " + io.error_code_to_string(error_code));
                } else {
                    reject("Server rejected connection.");
                }
            }

            try {
                crt_native.mqtt_client_connection_reconnect(this.native_handle(), on_connect);
            } catch (e) {
                reject(e);
            }
        });
    }

    async publish(topic: string, payload: Payload, qos: QoS, retain: boolean = false) {
        return new Promise<MqttRequest>((resolve, reject) => {

            let payload_data: DataView | undefined = undefined;
            if (payload instanceof DataView) {
                // If payload is already dataview, just use it
                payload_data = payload;
            } else {
                if (typeof payload === 'object') {
                    // Convert payload to JSON string, next if block will turn it into a DataView.
                    payload = JSON.stringify(payload);
                }

                if (typeof payload === 'string') {
                    // Encode the string as UTF-8
                    payload_data = new DataView(this.encoder.encode(payload).buffer);
                } else {
                    return reject(new TypeError("payload parameter must be a string, object, or DataView."));
                }
            }

            function on_publish(packet_id: number, error_code: number) {
                if (error_code == 0) {
                    resolve({ packet_id });
                } else {
                    reject("Failed to publish: " + io.error_code_to_string(error_code));
                }
            }

            try {
                crt_native.mqtt_client_connection_publish(this.native_handle(), topic, payload_data, qos, retain, on_publish);
            } catch (e) {
                reject(e);
            }
        });
    }

    async subscribe(topic: string, qos: QoS, on_message: (topic: string, payload: ArrayBuffer) => void) {
        return new Promise<MqttSubscribeRequest>((resolve, reject) => {

            function on_suback(packet_id: number, topic: string, qos: QoS, error_code: number) {
                if (error_code == 0) {
                    resolve({ packet_id, topic, qos, error_code });
                } else {
                    reject("Failed to subscribe: " + io.error_code_to_string(error_code));
                }
            }

            try {
                crt_native.mqtt_client_connection_subscribe(this.native_handle(), topic, qos, on_message, on_suback);
            } catch(e) {
                reject(e);
            }
        });
    }

    async unsubscribe(topic: string) {
        return new Promise<MqttRequest>((resolve, reject) => {

            function on_unsuback(packet_id: number, error_code: number) {
                if (error_code == 0) {
                    resolve({ packet_id });
                } else {
                    reject("Failed to unsubscribe: " + io.error_code_to_string(error_code));
                }
            }

            try {
                crt_native.mqtt_client_connection_unsubscribe(this.native_handle(), topic, on_unsuback);
            } catch(e) {
                reject(e);
            }
        });
    }

    async disconnect() {
        return new Promise<void>((resolve, reject) => {

            function on_disconnect() {
                resolve();
            }

            try {
                crt_native.mqtt_client_connection_disconnect(
                    this.native_handle(),
                    on_disconnect,
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    native_handle(): any {
        return this.connection_handle;
    }
}
