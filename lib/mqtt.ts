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
    public tls_ctx?: io.ClientTlsContext;

    private client_handle: any;

    constructor(bootstrap: io.ClientBootstrap, tls_ctx?: io.ClientTlsContext) {
        this.bootstrap = bootstrap;
        this.tls_ctx = tls_ctx;

        this.client_handle = crt_native.mqtt_client_new(bootstrap.native_handle())
    }

    native_handle(): any {
        return this.client_handle;
    }
}

export interface ConnectionConnectParams {
    client_id: string;
    host_name: string;
    port: number;
    use_websocket?: boolean;
    clean_session?: boolean;
    keep_alive?: number;
    will?: any;
    username?: string;
    password?: string;
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

export class Connection implements ResourceSafety.ResourceSafe {
    public client: Client;
    private connection_handle: any;
    private encoder: TextEncoder;

    constructor(client: Client, on_connection_interrupted?: (error_code: number) => void, on_connection_resumed?: (return_code: number, session_present: boolean) => void) {
        this.client = client;
        this.connection_handle = crt_native.mqtt_client_connection_new(client.native_handle(), on_connection_interrupted, on_connection_resumed);
        this.encoder = new TextEncoder();
    }

    close() {
        crt_native.mqtt_client_connection_close(this.native_handle())
    }

    async connect(args: ConnectionConnectParams) {
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
                    args.client_id,
                    args.host_name,
                    args.port,
                    this.client.tls_ctx ? this.client.tls_ctx.native_handle() : null,
                    args.keep_alive,
                    args.will,
                    args.username,
                    args.password,
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
