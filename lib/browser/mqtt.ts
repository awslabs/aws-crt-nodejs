/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt
 */

import * as mqtt from "mqtt";
import * as WebsocketUtils from "./ws";
import * as auth from "./auth";
import { Trie, TrieOp, Node as TrieNode } from "./trie";

import { BufferedEventEmitter } from "../common/event";
import { CrtError } from "../browser";
import { ClientBootstrap, SocketOptions } from "./io";
import {
    QoS,
    Payload,
    MqttRequest,
    MqttSubscribeRequest,
    MqttWill,
    OnMessageCallback,
    MqttConnectionConnected,
    MqttConnectionDisconnected,
    MqttConnectionError,
    MqttConnectionInterrupted,
    MqttConnectionResumed
} from "../common/mqtt";
export { QoS, Payload, MqttRequest, MqttSubscribeRequest, MqttWill } from "../common/mqtt";

/**
 * @category MQTT
 */
export type WebsocketOptions = WebsocketUtils.WebsocketOptions;

/**
 * @category MQTT
 */
export type AWSCredentials = auth.AWSCredentials;

/**
 * Configuration options for an MQTT connection
 *
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
     * This duration must be longer than {@link ping_timeout}.
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
    ping_timeout?: number;

    /**
     * Milliseconds to wait for the response to the operation requires response by protocol.
     * Set to zero to disable timeout. Otherwise, the operation will fail if no response is
     * received within this amount of time after the packet is written to the socket.
     * It applied to PUBLISH (QoS>0) and UNSUBSCRIBE now.
     */
    protocol_operation_timeout?: number;

    /**
     * Minimum seconds to wait between reconnect attempts.
     * Must be <= {@link reconnect_max_sec}.
     * Wait starts at min and doubles with each attempt until max is reached.
     */
    reconnect_min_sec?: number;

    /**
     * Maximum seconds to wait between reconnect attempts.
     * Must be >= {@link reconnect_min_sec}.
     * Wait starts at min and doubles with each attempt until max is reached.
     */
    reconnect_max_sec?: number;

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

    /** Options for the underlying credentianls provider */
    credentials_provider?: auth.CredentialsProvider;
}

/**
 * MQTT client
 *
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

interface SubInfo
{
    callback?: OnMessageCallback,
    qos: QoS
}

/** @internal */
class TopicTrie extends Trie<SubInfo | undefined> {
    constructor() {
        super('/', '/');
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
 * Converts payload to Buffer or string regardless of the supplied type
 * @param payload The payload to convert
 * @internal
 */
function normalize_payload(payload: Payload): Buffer | string {
    if (payload instanceof Buffer) {
        // pass Buffer through
        return payload;
    }
    if (typeof payload === 'string') {
        // pass string through
        return payload;
    }
    if (ArrayBuffer.isView(payload)) {
        // return Buffer with view upon the same bytes (no copy)
        const view = payload as ArrayBufferView;
        return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
    }
    if (payload instanceof ArrayBuffer) {
        // return Buffer with view upon the same bytes (no copy)
        return Buffer.from(payload);
    }
    if (typeof payload === 'object') {
        // Convert Object to JSON string
        return JSON.stringify(payload);
    }
    throw new TypeError("payload parameter must be a string, object, or DataView.");
}

/**
 * MQTT client connection
 *
 * @category MQTT
 */
export class  MqttClientConnection extends BufferedEventEmitter {
    private connection: mqtt.MqttClient;
    private subscriptions = new TopicTrie();
    private connection_count = 0;

    // track number of times in a row that reconnect has been attempted
    // use exponential backoff between subsequent failed attempts
    private reconnect_count = 0;
    private reconnect_min_sec = 1;
    private reconnect_max_sec = 128;

    private connection_shutdown = false;

    /**
     * @param client The client that owns this connection
     * @param config The configuration for this connection
     */
    constructor(
        readonly client: MqttClient,
        private config: MqttConnectionConfig) {
        super();

        if (config.reconnect_min_sec !== undefined) {
            this.reconnect_min_sec = config.reconnect_min_sec;
            // clamp max, in case they only passed in min
            this.reconnect_max_sec = Math.max(this.reconnect_min_sec, this.reconnect_max_sec);
        }

        if (config.reconnect_max_sec !== undefined) {
            this.reconnect_max_sec = config.reconnect_max_sec;
            // clamp min, in case they only passed in max (or passed in min > max)
            this.reconnect_min_sec = Math.min(this.reconnect_min_sec, this.reconnect_max_sec);
        }

        this.reset_reconnect_times();

        this.connection = this.setup_new_connection();
    }

    private setup_new_connection() : mqtt.MqttClient
    {
        const create_websocket_stream = (client: mqtt.MqttClient) => WebsocketUtils.create_websocket_stream(this.config);        
        const transform_websocket_url = (url: string, options: mqtt.IClientOptions, client: mqtt.MqttClient) => WebsocketUtils.create_websocket_url(this.config);
        const will = this.config.will ? {
            topic: this.config.will.topic,
            payload: normalize_payload(this.config.will.payload),
            qos: this.config.will.qos,
            retain: this.config.will.retain,
        } : undefined;

        const websocketXform = (this.config.websocket || {}).protocol != 'wss-custom-auth' ? transform_websocket_url : undefined;

        console.log(`print value of clean session ${this.config.clean_session}`);
        const new_connection = new mqtt.MqttClient(
            create_websocket_stream,
            {
                // service default is 1200 seconds
                keepalive: this.config.keep_alive ? this.config.keep_alive : 1200,
                clientId: this.config.client_id,
                connectTimeout: this.config.ping_timeout ? this.config.ping_timeout : 30 * 1000,
                clean: this.config.clean_session,
                username: this.config.username,
                password: this.config.password,
                //reconnectPeriod: (this.config.reconnect_min_sec ? this.config.reconnect_min_sec : this.reconnect_min_sec) * 1000, // disable mqtt.js reconnect, we'll handle it our custom way
                reconnectPeriod: 0,
                will: will,
                transformWsUrl: websocketXform,
            }
        );

        new_connection.on('connect', this.on_connect);
        new_connection.on('error', this.on_error);
        new_connection.on('message', this.on_message);
        new_connection.on('offline', this.on_offline);
        new_connection.on('end', this.on_disconnected);
        new_connection.on('close', this.on_close);

        return new_connection;
    }


    /**
     * Emitted when the connection successfully establishes itself for the first time
     *
     * @param event the type of event (connect)
     * @param listener the event listener to use
     *
     * @event
     */
    on(event: 'connect', listener: MqttConnectionConnected): this;

    /**
     * Emitted when connection has disconnected sucessfully.
     *
     * @param event the type of event (disconnect)
     * @param listener the event listener to use
     *
     * @event
     */
    on(event: 'disconnect', listener: MqttConnectionDisconnected): this;

    /**
     * Emitted when an error occurs.  The error will contain the error
     * code and message.
     *
     * @param event the type of event (error)
     * @param listener the event listener to use
     *
     * @event
     */
    on(event: 'error', listener: MqttConnectionError): this;

    /**
     * Emitted when the connection is dropped unexpectedly. The error will contain the error
     * code and message.  The underlying mqtt implementation will attempt to reconnect.
     *
     * @param event the type of event (interrupt)
     * @param listener the event listener to use
     *
     * @event
     */
    on(event: 'interrupt', listener: MqttConnectionInterrupted): this;

    /**
     * Emitted when the connection reconnects (after an interrupt). Only triggers on connections after the initial one.
     *
     * @param event the type of event (resume)
     * @param listener the event listener to use
     *
     * @event
     */
    on(event: 'resume', listener: MqttConnectionResumed): this;

    /**
     * Emitted when any MQTT publish message arrives.
     *
     * @param event the type of event (message)
     * @param listener the event listener to use
     *
     * @event
     */
    on(event: 'message', listener: OnMessageCallback): this;

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

            // Resubscribe after reconnect.
            const subfunction = (topic:string, info: SubInfo) => {
                this.connection.subscribe(topic, { qos: info.qos }, (error, packet) => {
                    if (error) {
                        console.log( `Resubscription failed: ${error}`);
                    }
                });
            };
            this.subscriptions.traverseAll(subfunction);
        }
    }

    private on_offline = () => {
        console.log(`disconnected...offline`);
        this.emit('interrupt', -1);
        if ( !this.connection_shutdown)
        {
            console.log(`disconnected...close but not shutdown`);
            this.reconnect();
            //this.connection_shutdown = true;
        }
    }

    private on_disconnected = () => {
            console.log(`disconnected...disconnect`);
            this.emit('disconnect');    
    }

    private on_error = (error: Error) => {
        this.emit('error', new CrtError(error))
    }

    private on_message = (topic: string, payload: Buffer, packet: mqtt.IPublishPacket) => {
        // pass payload as ArrayBuffer
        const array_buffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)

        const callback = this.subscriptions.find(topic);
        if (callback && callback.callback) {
            callback.callback?.(topic, array_buffer, packet.dup, packet.qos, packet.retain);
        }
        this.emit('message', topic, array_buffer, packet.dup, packet.qos, packet.retain);
        
        console.log(`recieved...message`);
    }

    private on_close = () => {
        console.log(`connection....close`);
        if ( !this.connection_shutdown)
        {
            this.reconnect();
        }
    }

    private reset_reconnect_times()
    {
        this.reconnect_count = 0;
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
                console.log("reconnect failed.")
                reject(new CrtError(error));
            };
            this.connection.once('connect', (connack: mqtt.IConnackPacket) => {
                this.connection.removeListener('error', on_connect_error);
                console.log("connecting...")
                this.reset_reconnect_times();
                resolve(connack.sessionPresent);
            });
            this.connection.once('error', on_connect_error);
        });
    }

    /**
     * Returns seconds until next reconnect attempt.
     */
    private get_reconnect_time_sec(): number {
        if (this.reconnect_min_sec == 0 && this.reconnect_max_sec == 0) {
            return 0;
        }

        // Uses "FullJitter" backoff algorithm, described here:
        // https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
        // We slightly vary the algorithm described on the page,
        // which takes (base,cap) and may result in 0.
        // But we take (min,max) as parameters, and don't don't allow results less than min.
        const cap = this.reconnect_max_sec - this.reconnect_min_sec;
        const base = Math.max(this.reconnect_min_sec, 1);
        const sleep = Math.random() * Math.min(cap, base * (2 ** this.reconnect_count));
        return this.reconnect_min_sec + sleep;
    }

    /**
     * The connection will automatically reconnect. To cease reconnection attempts, call {@link disconnect}.
     * To resume the connection, call {@link connect}.
     * @deprecated
     */
    async reconnect() {
        // console.timeEnd(`get reconnection ${this.reconnect_count-1}`);
        // console.time(`get reconnection ${this.reconnect_count}`);
        const waitTime = this.get_reconnect_time_sec();
        console.log(`waiting Time...${waitTime}`);
        //this.connection.options.reconnectPeriod = waitTime;
        setTimeout(() => { this.uncork() }, waitTime * 1000);
        console.log("reconnecting...")
        this.reconnect_count = this.reconnect_count+1;
        this.connection = this.setup_new_connection();
        return new Promise<boolean>((resolve, reject) => {
            const on_connect_error = (error: Error) => {
                console.log("reconnect failed.")
                reject(new CrtError(error));
            };
            this.connection.once('connect', (connack: mqtt.IConnackPacket) => {
                this.connection.removeListener('error', on_connect_error);
                console.log("reconnecting...")
                this.reset_reconnect_times();
                resolve(connack.sessionPresent);
            });
            this.connection.once('error', on_connect_error);
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
    async subscribe(topic: string, qos: QoS, on_message?: OnMessageCallback): Promise<MqttSubscribeRequest> {
        this.subscriptions.insert(topic, {callback: on_message, qos: qos});
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
            this.connection.unsubscribe(topic, undefined, (error?: Error, packet?: mqtt.Packet) => {
                if (error) {
                    reject(new CrtError(error));
                    return this.on_error(error);
                }
                resolve({
                    packet_id: packet
                        ? (packet as mqtt.IUnsubackPacket).messageId
                        : undefined,
                });
            });

        });
    }

    /**
     * Close the connection (async).
     * @returns Promise which completes when the connection is closed.
    */
    async disconnect() {
        this.connection_shutdown = true;
        return new Promise((resolve) => {
            this.connection.end(undefined, resolve)
        });
    }
}
