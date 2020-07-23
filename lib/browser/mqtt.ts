/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt from "mqtt";
import * as WebsocketUtils from "./ws";
import { Trie, TrieOp, Node as TrieNode } from "./trie";

import { BufferedEventEmitter } from "../common/event";
import { CrtError } from "../browser";
import { ClientBootstrap, SocketOptions } from "./io";
import { QoS, Payload, MqttRequest, MqttSubscribeRequest, MqttWill } from "../common/mqtt";
export { QoS, Payload, MqttRequest, MqttSubscribeRequest, MqttWill } from "../common/mqtt";

/** @category MQTT */
export type WebsocketOptions = WebsocketUtils.WebsocketOptions;
/** @category MQTT */
export type AWSCredentials = WebsocketUtils.AWSCredentials;

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
    /** Socket options, ignored in browser */
    socket_options: SocketOptions;
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
    /** Options for the underlying websocket connection */
    websocket?: WebsocketOptions;
    /** AWS credentials, which will be used to sign the websocket request */
    credentials?: AWSCredentials;
}

/**
 * MQTT client
 *
 * @module aws-crt
 * @category MQTT
 */
export class MqttClient {
    constructor(bootstrap?: ClientBootstrap) {

    }
    /**
     * Creates a new {@link MqttClientConnection}
     * @param config Configuration for the connection
     * @returns A new connection
     */
    new_connection(config: MqttConnectionConfig) {
        return new MqttClientConnection(this, config);
    }
}

/**
 * @module aws-crt
 * @category MQTT
 */
type SubscriptionCallback = (topic: string, payload: ArrayBuffer) => void;

/** @internal */
class TopicTrie extends Trie<SubscriptionCallback | undefined> {
    constructor() {
        super('/');
    }

    protected find_node(key: string, op: TrieOp) {
        const parts = this.split_key(key);
        let current = this.root;
        let parent = undefined;
        for (const part of parts) {
            let child = current.children.get(part);
            if (!child) {
                child = current.children.get('#');
                if (child) {
                    return child;
                }

                child = current.children.get('+');
            }
            if (!child) {
                if (op == TrieOp.Insert) {
                    current.children.set(part, child = new TrieNode(part));
                }
                else {
                    return undefined;
                }
            }
            parent = current;
            current = child;
        }
        if (parent && op == TrieOp.Delete) {
            parent.children.delete(current.key!);
        }
        return current;
    }
}

/**
 * Converts payload to a string regardless of the supplied type
 * @param payload The payload to convert
 * @internal
 */
function normalize_payload(payload: Payload): string {
    let payload_data: string = payload.toString();
    if (payload instanceof DataView) {
        payload_data = new TextDecoder('utf8').decode(payload as DataView);
    } else if (payload instanceof Object) {
        // Convert payload to JSON string
        payload_data = JSON.stringify(payload);
    }
    return payload_data;
}

/**
 * MQTT client connection
 *
 * @module aws-crt
 * @category MQTT
 */
export class MqttClientConnection extends BufferedEventEmitter {
    private connection: mqtt.MqttClient;
    private subscriptions = new TopicTrie();
    private connection_count = 0;

    /**
     * @param client The client that owns this connection
     * @param config The configuration for this connection
     */
    constructor(
        readonly client: MqttClient,
        private config: MqttConnectionConfig) {
        super();

        const create_websocket_stream = (client: mqtt.MqttClient) => WebsocketUtils.create_websocket_stream(this.config);
        const transform_websocket_url = (url: string, options: mqtt.IClientOptions, client: mqtt.MqttClient) => WebsocketUtils.create_websocket_url(this.config);

        const will = this.config.will ? {
            topic: this.config.will.topic,
            payload: normalize_payload(this.config.will.payload),
            qos: this.config.will.qos,
            retain: this.config.will.retain,
        } : undefined;

        const websocketXform = (config.websocket || {}).protocol != 'wss-custom-auth' ? transform_websocket_url : undefined;

        this.connection = new mqtt.MqttClient(
            create_websocket_stream,
            {
                // service default is 1200 seconds
                keepalive: this.config.keep_alive ? this.config.keep_alive : 1200,
                clientId: this.config.client_id,
                connectTimeout: this.config.timeout ? this.config.timeout : 30,
                clean: this.config.clean_session,
                username: this.config.username,
                password: this.config.password,
                reconnectPeriod: 0,
                will: will,
                transformWsUrl: websocketXform,
            }
        );

        this.connection.on('connect', this.on_connect);
        this.connection.on('error', this.on_error);
        this.connection.on('message', this.on_message);
        this.connection.on('offline', this.on_offline);
        this.connection.on('end', this.on_disconnected);
    }

    /** Emitted when the connection is ready and is about to start sending response data */
    on(event: 'connect', listener: (session_present: boolean) => void): this;

    /** Emitted when connection has closed sucessfully. */
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
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    private on_connect = (connack: mqtt.IConnackPacket) => {
        this.on_online(connack.sessionPresent);
    }

    private on_online = (session_present: boolean) => {
        if (++this.connection_count == 1) {
            this.emit('connect', session_present);
        } else {
            this.emit('resume', 0, session_present);
        }
    }

    private on_offline = () => {
        this.emit('interrupt', -1);
    }

    private on_disconnected = () => {
        this.emit('disconnect');
    }

    private on_error = (error: Error) => {
        this.emit('error', new CrtError(error))
    }

    private on_message = (topic: string, payload: Buffer, packet: any) => {
        const callback = this.subscriptions.find(topic);
        if (callback) {
            callback(topic, payload);
        }
        this.emit('message', topic, payload);
    }

    /**
     * Open the actual connection to the server (async).
     * @returns A Promise which completes whether the connection succeeds or fails.
     *          If connection fails, the Promise will reject with an exception.
     *          If connection succeeds, the Promise will return a boolean that is
     *          true for resuming an existing session, or false if the session is new
     */
    async connect() {
        setTimeout(() => { this.uncork() }, 0);
        return new Promise<boolean>((resolve, reject) => {
            const on_connect_error = (error: Error) => {
                reject(new CrtError(error));
            };
            this.connection.once('connect', (connack: mqtt.IConnackPacket) => {
                this.connection.removeListener('error', on_connect_error);
                resolve(connack.sessionPresent);
            });
            this.connection.once('error', on_connect_error);
        });
    }

    /**
     * The connection will automatically reconnect. To cease reconnection attempts, call {@link disconnect}.
     * To resume the connection, call {@link connect}.
     * @deprecated
     */
    async reconnect() {
        return this.connect();
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
    async publish(topic: string, payload: Payload, qos: QoS, retain: boolean = false): Promise<MqttRequest> {
        let payload_data = normalize_payload(payload);
        return new Promise((resolve, reject) => {
            this.connection.publish(topic, payload_data, { qos: qos, retain: retain }, (error, packet) => {
                if (error) {
                    reject(new CrtError(error));
                    return this.on_error(error);
                }
                resolve({ packet_id: (packet as mqtt.IPublishPacket).messageId })
            });
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
    async subscribe(topic: string, qos: QoS, on_message?: (topic: string, payload: ArrayBuffer) => void): Promise<MqttSubscribeRequest> {
        this.subscriptions.insert(topic, on_message);
        return new Promise((resolve, reject) => {
            this.connection.subscribe(topic, { qos: qos }, (error, packet) => {
                if (error) {
                    reject(new CrtError(error))
                    return this.on_error(error);
                }
                const sub = (packet as mqtt.ISubscriptionGrant[])[0];
                resolve({ topic: sub.topic, qos: sub.qos });
            });
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
    async unsubscribe(topic: string): Promise<MqttRequest> {
        this.subscriptions.remove(topic);
        return new Promise((resolve, reject) => {
            this.connection.unsubscribe(topic, undefined, (error, packet) => {
                if (error) {
                    reject(new CrtError(error));
                    return this.on_error(error);
                }
                resolve({ packet_id: (packet as mqtt.IUnsubackPacket).messageId });
            });

        });
    }

    /**
     * Close the connection (async).
     * @returns Promise which completes when the connection is closed.
    */
    async disconnect() {
        return new Promise((resolve) => {
            this.connection.end(undefined, undefined, () => {
                resolve();
            })
        });
    }
}
