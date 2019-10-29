/*
 * Copyright 2010-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { NativeResource, NativeResourceMixin } from "./native_resource";
import { BufferedEventEmitter } from '../common/event';
import { CrtError } from './error';
import * as io from "./io";
import { TextEncoder } from 'util';
import { HttpProxyOptions } from './http';
export { HttpProxyOptions } from './http';

import { QoS, Payload, MqttRequest, MqttSubscribeRequest, MqttWill } from "../common/mqtt";
export { QoS, Payload, MqttRequest, MqttSubscribeRequest, MqttWill } from "../common/mqtt";

export class MqttClient extends NativeResource {
    constructor(readonly bootstrap: io.ClientBootstrap) {
        super(crt_native.mqtt_client_new(bootstrap.native_handle()));
    }

    new_connection(
        config: MqttConnectionConfig) {
        return new MqttClientConnection(this, config);
    }
}

export interface MqttConnectionConfig {
    client_id: string;
    host_name: string;
    port: number;
    socket_options: io.SocketOptions;
    use_websocket?: boolean;
    clean_session?: boolean;
    keep_alive?: number;
    timeout?: number;
    will?: MqttWill;
    username?: string;
    password?: string;
    tls_ctx?: io.ClientTlsContext;
    proxy_options?: HttpProxyOptions;
}

const normalize_encoder = new TextEncoder();
function normalize_payload(payload: Payload) {
    let payload_data: DataView;
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
            payload_data = new DataView(normalize_encoder.encode(payload).buffer);
        } else {
            throw new TypeError("payload parameter must be a string, object, or DataView.");
        }
    }
    return payload_data;
}

export class MqttClientConnection extends NativeResourceMixin(BufferedEventEmitter) {
    readonly tls_ctx?: io.ClientTlsContext; // this keeps the tls_ctx alive beyond the life of the connection

    constructor(readonly client: MqttClient, private config: MqttConnectionConfig) {
        super();
        this._super(crt_native.mqtt_client_connection_new(
            client.native_handle(),
            (error_code: number) => { this._on_connection_interrupted(error_code); },
            (return_code: number, session_present: boolean) => { this._on_connection_resumed(return_code, session_present); })
        );
        this.tls_ctx = config.tls_ctx;
    }

    private close() {
        crt_native.mqtt_client_connection_close(this.native_handle());
    }

    /** Emitted when the connection is ready and is about to start sending response data */
    on(event: 'connect', listener: (session_present: boolean) => void): this;

    /** Emitted when connection has disconnected sucessfully. */
    on(event: 'disconnect', listener: () => void): this;

    /**
     * Emitted when an error occurs
     * @param error - A CrtError containing the error that occurred
     */
    on(event: 'error', listener: (error: CrtError) => void): this;

    /**
     * Emitted when the connection is dropped unexpectedly. The error will contain the error
     * code and message.
     */
    on(event: 'interrupt', listener: (error: CrtError) => void): this;

    /**
     * Emitted when the connection reconnects. Only triggers on connections after the initial one.
     */
    on(event: 'resume', listener: (return_code: number, session_present: boolean) => void): this;


    // Override to allow uncorking on ready
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        if (event == 'connect') {
            process.nextTick(() => {
                this.uncork();
            })
        }
        return this;
    }

    async connect() {
        return new Promise<boolean>((resolve, reject) => {
            reject = this._reject(reject);

            const on_connect = (error_code: number, return_code: number, session_present: boolean) => {
                if (error_code == 0 && return_code == 0) {
                    resolve(session_present);
                    this.emit('connect', session_present);
                } else if (error_code != 0) {
                    reject("Failed to connect: " + io.error_code_to_string(error_code));
                } else {
                    reject("Server rejected connection.");
                }
            }

            // If there is a will, ensure that its payload is normalized to a DataView
            const will = this.config.will ?
                new MqttWill(
                    this.config.will.topic,
                    this.config.will.qos,
                    normalize_payload(this.config.will.payload),
                    this.config.will.retain)
                : undefined;
            try {
                crt_native.mqtt_client_connection_connect(
                    this.native_handle(),
                    this.config.client_id,
                    this.config.host_name,
                    this.config.port,
                    this.config.tls_ctx ? this.config.tls_ctx.native_handle() : null,
                    this.config.socket_options.native_handle(),
                    this.config.keep_alive,
                    this.config.timeout,
                    will,
                    this.config.username,
                    this.config.password,
                    this.config.use_websocket,
                    this.config.proxy_options ? this.config.proxy_options.create_native_handle() : undefined,
                    this.config.clean_session,
                    on_connect,
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    async reconnect() {
        return new Promise<boolean>((resolve, reject) => {
            reject = this._reject(reject);

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
            reject = this._reject(reject);

            let payload_data = normalize_payload(payload);
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
            reject = this._reject(reject);

            function on_suback(packet_id: number, topic: string, qos: QoS, error_code: number) {
                if (error_code == 0) {
                    resolve({ packet_id, topic, qos, error_code });
                } else {
                    reject("Failed to subscribe: " + io.error_code_to_string(error_code));
                }
            }

            try {
                crt_native.mqtt_client_connection_subscribe(this.native_handle(), topic, qos, on_message, on_suback);
            } catch (e) {
                reject(e);
            }
        });
    }

    async unsubscribe(topic: string) {
        return new Promise<MqttRequest>((resolve, reject) => {
            reject = this._reject(reject);

            function on_unsuback(packet_id: number, error_code: number) {
                if (error_code == 0) {
                    resolve({ packet_id });
                } else {
                    reject("Failed to unsubscribe: " + io.error_code_to_string(error_code));
                }
            }

            try {
                crt_native.mqtt_client_connection_unsubscribe(this.native_handle(), topic, on_unsuback);
            } catch (e) {
                reject(e);
            }
        });
    }

    async disconnect() {
        return new Promise<void>((resolve, reject) => {
            reject = this._reject(reject);

            const on_disconnect = () => {
                resolve();
                this.emit('disconnect');
                this.close();
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

    // Wrap a promise rejection with a function that will also emit the error as an event
    private _reject(reject: (reason: any) => void) {
        return (reason: any) => {
            reject(reason);
            this.emit('error', new CrtError(reason));
        };
    }

    private _on_connection_interrupted(error_code: number) {
        this.emit('interrupt', new CrtError(error_code));
    }

    private _on_connection_resumed(return_code: number, session_present: boolean) {
        this.emit('resume', return_code, session_present);
    }
}
