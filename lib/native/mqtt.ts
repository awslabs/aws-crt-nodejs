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

import crt_native from './binding';
import { NativeResource, NativeResourceMixin } from "./native_resource";
import { BufferedEventEmitter } from '../common/event';
import { CrtError } from './error';
import * as io from "./io";
import { TextEncoder } from 'util';
import { HttpProxyOptions, HttpRequest } from './http';
export { HttpProxyOptions } from './http';

import { QoS, Payload, MqttRequest, MqttSubscribeRequest, MqttWill } from "../common/mqtt";

/** @category MQTT */
export { QoS, Payload, MqttRequest, MqttSubscribeRequest, MqttWill } from "../common/mqtt";

/**
 * MQTT client
 *
 * @module aws-crt
 * @category MQTT
 */
export class MqttClient extends NativeResource {
    /**
     * @param bootstrap The {@link ClientBootstrap} to use for socket connections
     */
    constructor(readonly bootstrap: io.ClientBootstrap) {
        super(crt_native.mqtt_client_new(bootstrap.native_handle()));
    }

    /**
     * Creates a new {@link MqttClientConnection}
     * @param config Configuration for the connection
     * @returns A new connection
     */
    new_connection(
        config: MqttConnectionConfig) {
        return new MqttClientConnection(this, config);
    }
}

/**
 * Configuration options for an MQTT connection
 *
 * @module aws-crt
 * @category MQTT
 */
export interface MqttConnectionConfig {
    /**
     * ID to place in CONNECT packet. Must be unique across all devices/clients.
     * If an ID is already in use, the other client will be disconnected.
     */
    client_id: string;
    /** Server name to connect to */
    host_name: string;
    /** Server port to connect to */
    port: number;
    /** Optional socket options */
    socket_options: io.SocketOptions;
    /** If true, connect to MQTT over websockets */
    use_websocket?: boolean;
    /**
     * Whether or not to start a clean session with each reconnect.
     * If True, the server will forget all subscriptions with each reconnect.
     * Set False to request that the server resume an existing session
     * or start a new session that may be resumed after a connection loss.
     * The `session_present` bool in the connection callback informs
     * whether an existing session was successfully resumed.
     * If an existing session is resumed, the server remembers previous subscriptions
     * and sends mesages (with QoS1 or higher) that were published while the client was offline.
     */
    clean_session?: boolean;
    /**
     * The keep alive value, in seconds, to send in CONNECT packet.
     * A PING will automatically be sent at this interval.
     * The server will assume the connection is lost if no PING is received after 1.5X this value.
     * This duration must be longer than {@link timeout}.
     */
    keep_alive?: number;
    /**
     * Milliseconds to wait for ping response before client assumes
     * the connection is invalid and attempts to reconnect.
     * This duration must be shorter than keep_alive_secs.
     * Alternatively, TCP keep-alive via :attr:`SocketOptions.keep_alive`
     * may accomplish this in a more efficient (low-power) scenario,
     * but keep-alive options may not work the same way on every platform and OS version.
     */
    timeout?: number;
    /**
     * Will to send with CONNECT packet. The will is
     * published by the server when its connection to the client is unexpectedly lost.
     */
    will?: MqttWill;
    /** Username to connect with */
    username?: string;
    /** Password to connect with */
    password?: string;
    /**
     * TLS context for secure socket connections.
     * If None is provided, then an unencrypted connection is used.
     */
    tls_ctx?: io.ClientTlsContext;
    /** Optional proxy options */
    proxy_options?: HttpProxyOptions;
    /**
     * Optional function to transform websocket handshake request.
     * If provided, function is called each time a websocket connection is attempted.
     * The function may modify the HTTP request before it is sent to the server.
     */
    websocket_handshake_transform?: (request: HttpRequest, done: (error_code?: number) => void) => void;
}

/** @internal */
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

/**
 * MQTT client connection
 *
 * @module aws-crt
 * @category MQTT
 */
export class MqttClientConnection extends NativeResourceMixin(BufferedEventEmitter) {
    readonly tls_ctx?: io.ClientTlsContext; // this reference keeps the tls_ctx alive beyond the life of the connection

    /**
     * @param client The client that owns this connection
     * @param config The configuration for this connection
     */
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

    /**
     * Emitted when any MQTT publish message arrives.
     */
    on(event: 'message', listener: (topic: string, payload: Buffer) => void): this;

    /** @internal */
    // Overridden to allow uncorking on ready
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        if (event == 'connect') {
            process.nextTick(() => {
                this.uncork();
            })
        }
        return this;
    }

    /**
     * Open the actual connection to the server (async).
     * @returns A Promise which completes whether the connection succeeds or fails.
     *          If connection fails, the Promise will reject with an exception.
     *          If connection succeeds, the Promise will return a boolean that is
     *          true for resuming an existing session, or false if the session is new
     */
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
                crt_native.mqtt_client_connection_on_message(this.native_handle(), this._on_any_publish.bind(this));
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
                    this.config.websocket_handshake_transform,
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * The connection will automatically reconnect. To cease reconnection attempts, call {@link disconnect}.
     * To resume the connection, call {@link connect}.
     * @deprecated
     */
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

    /**
     * Publish message (async).
     * If the device is offline, the PUBLISH packet will be sent once the connection resumes.
     *
     * @param topic Topic name
     * @param payload Contents of message
     * @param qos Quality of Service for delivering this message
     * @param retain If true, the server will store the message and its QoS so that it can be
     *               delivered to future subscribers whose subscriptions match the topic name
     * @returns Promise which returns a {@link MqttRequest} which will contain the packet id of
     *          the PUBLISH packet.
     *
     * * For QoS 0, completes as soon as the packet is sent.
     * * For QoS 1, completes when PUBACK is received.
     * * For QoS 2, completes when PUBCOMP is received.
     */
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

    /**
     * Subscribe to a topic filter (async).
     * The client sends a SUBSCRIBE packet and the server responds with a SUBACK.
     *
     * subscribe() may be called while the device is offline, though the async
     * operation cannot complete successfully until the connection resumes.
     *
     * Once subscribed, `callback` is invoked each time a message matching
     * the `topic` is received. It is possible for such messages to arrive before
     * the SUBACK is received.
     *
     * @param topic Subscribe to this topic filter, which may include wildcards
     * @param qos Maximum requested QoS that server may use when sending messages to the client.
     *            The server may grant a lower QoS in the SUBACK
     * @param on_message Optional callback invoked when message received.
     * @returns Promise which returns a {@link MqttSubscribeRequest} which will contain the
     *          result of the SUBSCRIBE. The Promise resolves when a SUBACK is returned
     *          from the server or is rejected when an exception occurs.
     */
    async subscribe(topic: string, qos: QoS, on_message?: (topic: string, payload: ArrayBuffer) => void) {
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

    /**
     * Unsubscribe from a topic filter (async).
     * The client sends an UNSUBSCRIBE packet, and the server responds with an UNSUBACK.
     * @param topic The topic filter to unsubscribe from. May contain wildcards.
     * @returns Promise wihch returns a {@link MqttRequest} which will contain the packet id
     *          of the UNSUBSCRIBE packet being acknowledged. Promise is resolved when an
     *          UNSUBACK is received from the server or is rejected when an exception occurs.
     */
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

    /**
     * Close the connection (async).
     * @returns Promise which completes when the connection is closed.
    */
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

    private _on_any_publish(topic: string, payload: Buffer) {
        this.emit('message', topic, payload);
    }
}
