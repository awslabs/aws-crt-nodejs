/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 *
 * A module containing support for mqtt connection establishment and operations.
 *
 * @packageDocumentation
 * @module mqtt
 * @mergeTarget
 */

import * as internal_mqtt_client from "./mqtt_internal/client";
import * as mqtt5 from "../common/mqtt5";
import * as ws from "./ws"
import * as auth from "./auth";
import * as promise from "../common/promise";
import * as model from "./mqtt_internal/model";
import * as mqtt_shared from "../common/mqtt_shared";
import * as mqtt_shared_browser from "./mqtt_shared_browser";

import {Node as TrieNode, Trie, TrieOp} from "./trie";

import {BufferedEventEmitter} from "../common/event";
import {CrtError} from "./error";
import {ClientBootstrap, SocketOptions} from "./io";
import {
    MqttConnectionConnected,
    MqttConnectionDisconnected,
    MqttConnectionResumed,
    MqttRequest,
    MqttSubscribeRequest,
    MqttWill,
    OnConnectionClosedResult,
    OnConnectionFailedResult,
    OnConnectionSuccessResult,
    OnMessageCallback,
    Payload,
    QoS
} from "../common/mqtt";
import {once} from "events";

export {
    QoS, Payload, MqttRequest, MqttSubscribeRequest, MqttWill, OnMessageCallback, MqttConnectionConnected, MqttConnectionDisconnected,
    MqttConnectionResumed, OnConnectionSuccessResult, OnConnectionFailedResult, OnConnectionClosedResult
} from "../common/mqtt";

/**
 * Listener signature for event emitted from an {@link MqttClientConnection} when an error occurs
 *
 * @param error the error that occurred
 *
 * @category MQTT
 */
export type MqttConnectionError = (error: CrtError) => void;

/**
 * Listener signature for event emitted from an {@link MqttClientConnection} when the connection has been
 * interrupted unexpectedly.
 *
 * @param error description of the error that occurred
 *
 * @category MQTT
 */
export type MqttConnectionInterrupted = (error: CrtError) => void;

/**
 * Listener signature for event emitted from an {@link MqttClientConnection} when the connection has been
 * connected successfully.
 *
 * This listener is invoked for every successful connect and every successful reconnect.
 *
 * @param callback_data Data returned containing information about the successful connection.
 *
 * @category MQTT
 */
export type MqttConnectionSuccess = (callback_data: OnConnectionSuccessResult) => void;

/**
 * Listener signature for event emitted from an {@link MqttClientConnection} when the connection has failed
 * to connect.
 *
 * This listener is invoked for every failed connect and every failed reconnect.
 *
 * @param callback_data Data returned containing information about the failed connection.
 *
 * @category MQTT
 */
export type MqttConnectionFailure = (callback_data: OnConnectionFailedResult) => void;

/**
 * Listener signature for event emitted from an {@link MqttClientConnection} when the connection has been
 * disconnected and shutdown successfully.
 *
 * @param callback_data Data returned containing information about the closed/disconnected connection.
 *                      Currently empty, but may contain data in the future.
 *
 * @category MQTT
 */
export type MqttConnectionClosed = (callback_data: OnConnectionClosedResult) => void;

/**
 * @category MQTT
 */
export type WebsocketOptions = ws.WebsocketOptions;

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
     * and sends messages (with QoS1 or higher) that were published while the client was offline.
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

    /** AWS credentials, which will be used to sign the websocket request */
    credentials?: AWSCredentials;

    /** Options for the underlying credentials provider */
    credentials_provider?: auth.CredentialsProvider;

    /** Optional metrics configuration to be applied to the username and sent with the CONNECT packet */
    sdkMetrics?: mqtt_shared.AwsIoTDeviceSDKMetrics;
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

/**
 * @internal
 */
enum MqttBrowserClientState {
    Connected,
    Stopped
};


/** @internal */
class TopicTrie extends Trie<OnMessageCallback | undefined> {
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

interface OneTimeConnectListeners {
    connectionSuccess?: (event: internal_mqtt_client.ConnectionSuccessEvent) => void;
    connectionFailure?: (event: internal_mqtt_client.ConnectionFailureEvent) => void;
}

/**
 * MQTT client connection
 *
 * @category MQTT
 */
export class MqttClientConnection extends BufferedEventEmitter {
    //private connection: mqtt.MqttClient;
    private internalClient: internal_mqtt_client.Client;

    private subscriptions = new TopicTrie();
    private connection_count = 0;

    private connectPromise?: promise.LiftedPromise<boolean> = undefined;
    private isSessionPresent: boolean = false;

    private currentState: MqttBrowserClientState = MqttBrowserClientState.Stopped;
    private desiredState: MqttBrowserClientState = MqttBrowserClientState.Stopped;

    /**
     * @param client The client that owns this connection
     * @param config The configuration for this connection
     */
    constructor(
        readonly client: MqttClient,
        private config: MqttConnectionConfig) {
        super();

        if (!config) {
            throw new CrtError("MqttClientConnection constructor: config not defined");
        }

        let internalConnectOptions : internal_mqtt_client.ConnectOptions = {
            keepAliveIntervalSeconds: this.config.keep_alive ? this.config.keep_alive : 1200,
            resumeSessionPolicy: this.config.clean_session ? internal_mqtt_client.ResumeSessionPolicyType.Never : internal_mqtt_client.ResumeSessionPolicyType.Always,
        };

        if (this.config.client_id) {
            internalConnectOptions.clientId = this.config.client_id;
        }

        internalConnectOptions.username = mqtt_shared_browser.buildFinalUsernameFromMetrics(this.config.sdkMetrics ?? new mqtt_shared.AwsIoTDeviceSDKMetrics(), this.config.username);

        if (this.config.password) {
            internalConnectOptions.password = mqtt_shared_browser.normalize_payload_to_buffer(this.config.password);
        }

        if (this.config.will) {
            internalConnectOptions.will = {
                topicName: this.config.will.topic,
                payload: mqtt_shared_browser.normalize_payload_to_buffer(this.config.will.payload),
                qos: this.config.will.qos,
                retain: this.config.will.retain,
            };
        }

        // If the credentials are set but no the credentials_provider
        if (this.config.credentials_provider == undefined &&
            this.config.credentials != undefined) {
            const provider = new auth.StaticCredentialProvider(
                { aws_region: this.config.credentials.aws_region,
                    aws_access_id: this.config.credentials.aws_access_id,
                    aws_secret_key: this.config.credentials.aws_secret_key,
                    aws_sts_token: this.config.credentials.aws_sts_token});
            this.config.credentials_provider = provider;
        }

        let thisConfig = this.config;

        let connectionFactory : () => Promise<ws.WsStream> = function () {
            return new Promise<ws.WsStream>(async (resolve, reject) => {
                if (thisConfig.credentials_provider) {
                    await thisConfig.credentials_provider.refreshCredentials();
                }

                let conn : ws.WsStream = ws.create_websocket_stream(thisConfig);
                conn.on('error', (err) => {
                    reject(err);
                });
                conn.on('connect', () => {
                    resolve(conn);
                });
            });
        }

        let internalConfig : internal_mqtt_client.ClientConfig = {
            protocolVersion: internal_mqtt_client.ProtocolMode.Mqtt311,
            offlineQueuePolicy: internal_mqtt_client.OfflineQueuePolicy.PreserveQos1PlusPublishes,
            connectOptions: internalConnectOptions,
            pingTimeoutMillis: this.config.ping_timeout ? this.config.ping_timeout : 30 * 1000,
            connectionFactory: connectionFactory,
            // yes this is wrong, but this is how the old client was configured
            // ideally, we'd use the socket options timeout value here
            connectTimeoutMillis: this.config.ping_timeout ? this.config.ping_timeout : 30 * 1000,
            retryJitterMode: mqtt5.RetryJitterType.Default,
            // this was how the previous mqtt-js integration behaved
            resubscribeMode: internal_mqtt_client.ResubscribeModeType.EnabledAlways
        };

        if (config.reconnect_min_sec !== undefined) {
            internalConfig.minReconnectDelayMs = config.reconnect_min_sec * 1000;
        }

        if (config.reconnect_max_sec !== undefined) {
            internalConfig.maxReconnectDelayMs = config.reconnect_max_sec * 1000;
        }

        // we never implemented a reset delay in the browser client, so reset immediately after connecting
        internalConfig.resetConnectionFailureCountMillis = 0;

        this.internalClient = new internal_mqtt_client.Client(internalConfig);

        this.internalClient.on("connectionSuccess", this.on_connection_success);
        this.internalClient.on("connectionFailure", this.on_connection_failure);
        this.internalClient.on("disconnection", this.on_disconnection);
        this.internalClient.on("publishReceived", this.on_publish_received);
        this.internalClient.on("stopped", this.on_stopped);
    }

    /**
     * Emitted when the connection successfully establishes itself for the first time
     *
     * @event
     */
    static CONNECT = 'connect';

    /**
     * Emitted when connection has disconnected successfully.
     *
     * @event
     */
    static DISCONNECT = 'disconnect';

    /**
     * Emitted when an error occurs.  The error will contain the error
     * code and message.
     *
     * @event
     */
    static ERROR = 'error';

    /**
     * Emitted when the connection is dropped unexpectedly. The error will contain the error
     * code and message.  The underlying mqtt implementation will attempt to reconnect.
     *
     * @event
     */
    static INTERRUPT = 'interrupt';

    /**
     * Emitted when the connection reconnects (after an interrupt). Only triggers on connections after the initial one.
     *
     * @event
     */
    static RESUME = 'resume';

    /**
     * Emitted when any MQTT publish message arrives.
     *
     * @event
     */
    static MESSAGE = 'message';

    /**
     * Emitted on every successful connect and reconnect.
     * Will contain a boolean indicating whether the connection resumed a session.
     *
     * @event
     */
    static CONNECTION_SUCCESS = 'connection_success';

    /**
     * Emitted on an unsuccessful connect and reconnect.
     * Will contain an error code indicating the reason for the unsuccessful connection.
     *
     * @event
     */
    static CONNECTION_FAILURE = 'connection_failure';

    /**
     * Emitted when the MQTT connection was disconnected and shutdown successfully.
     *
     * @event
     */
    static CLOSED = 'closed'

    on(event: 'connect', listener: MqttConnectionConnected): this;

    on(event: 'disconnect', listener: MqttConnectionDisconnected): this;

    on(event: 'error', listener: MqttConnectionError): this;

    on(event: 'interrupt', listener: MqttConnectionInterrupted): this;

    on(event: 'connection_success', listener: MqttConnectionSuccess): this;

    on(event: 'connection_failure', listener: MqttConnectionFailure): this;

    on(event: 'closed', listener: MqttConnectionClosed): this;

    on(event: 'resume', listener: MqttConnectionResumed): this;

    on(event: 'message', listener: OnMessageCallback): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Open the actual connection to the server (async).
     * @returns A Promise which completes whether the connection succeeds or fails.
     *          If connection fails, the Promise will reject with an exception.
     *          If connection succeeds, the Promise will return a boolean that is
     *          true for resuming an existing session, or false if the session is new
     */
    async connect() {
        let client = this;
        let internalClient = this.internalClient;

        let isStarted : boolean = client.desiredState == MqttBrowserClientState.Connected;
        this.desiredState = MqttBrowserClientState.Connected;

        setTimeout(() => { this.uncork() }, 0);

        if (this.currentState == MqttBrowserClientState.Connected && isStarted) {
            return new Promise<boolean>((resolve, reject) => {
                resolve(client.isSessionPresent);
            });
        }

        if (!this.connectPromise) {
            this.connectPromise = promise.newLiftedPromise<boolean>();
            let listeners: OneTimeConnectListeners = {};

            listeners.connectionSuccess = function (event: internal_mqtt_client.ConnectionSuccessEvent) {
                if (client.connectPromise) {
                    client.connectPromise.resolve(event.connack.sessionPresent);
                    client.connectPromise = undefined;
                }
                if (listeners.connectionFailure) {
                    internalClient.removeListener("connectionFailure", listeners.connectionFailure);
                }
            };

            listeners.connectionFailure = function (event: internal_mqtt_client.ConnectionFailureEvent) {
                if (client.connectPromise) {
                    client.connectPromise.reject(event.error);
                    client.connectPromise = undefined;
                }
                if (listeners.connectionSuccess) {
                    internalClient.removeListener("connectionSuccess", listeners.connectionSuccess);
                }
            };

            internalClient.once("connectionSuccess", listeners.connectionSuccess);
            internalClient.once("connectionFailure", listeners.connectionFailure);
        }

        if (!isStarted) {
            internalClient.start();
        }

        return this.connectPromise.promise;
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
        let payload_data = mqtt_shared.normalize_payload(payload);

        let options : internal_mqtt_client.PublishOptions = {};
        if (this.config.protocol_operation_timeout) {
            options.timeoutInMillis = this.config.protocol_operation_timeout;
        }

        let publishResult = await this.internalClient.publish({
            topicName: topic,
            qos: qos,
            payload: payload_data,
            retain: retain
        }, options);

        let id = undefined;
        if (qos == QoS.AtLeastOnce) {
            id = (publishResult.packet as model.PubackPacketInternal).packetId;
        }

        return {packet_id: id};
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
        if (typeof(topic) !== 'string') {
            return Promise.reject("topic is not a string");
        }
        if (typeof(qos) !== 'number') {
            return Promise.reject("qos is not a number");
        }

        this.subscriptions.insert(topic, on_message);

        let options : internal_mqtt_client.SubscribeOptions = {};
        if (this.config.protocol_operation_timeout) {
            options.timeoutInMillis = this.config.protocol_operation_timeout;
        }

        let suback = await this.internalClient.subscribe({
            subscriptions: [
                {
                    topicFilter: topic,
                    qos: qos
                }
            ]
        }, options);

        return {
            topic: topic,
            /*
             * 128 is not modeled in QoS, either on our side nor mqtt-js's side.
             * We have always passed this 128 to the user and it is not reasonable to extend
             * our output type with 128 since it's also our input type and we don't want anyone
             * to pass 128 to us.
             *
             * The 5 client solves this by making the output type a completely separate enum.
             *
             * By doing this cast, we make the type checker ignore this edge case.
             */
            qos: (suback.reasonCodes[0] as number) as QoS
        }
    }

    /**
     * Unsubscribe from a topic filter (async).
     * The client sends an UNSUBSCRIBE packet, and the server responds with an UNSUBACK.
     * @param topic The topic filter to unsubscribe from. May contain wildcards.
     * @returns Promise which returns a {@link MqttRequest} which will contain the packet id
     *          of the UNSUBSCRIBE packet being acknowledged. Promise is resolved when an
     *          UNSUBACK is received from the server or is rejected when an exception occurs.
     */
    async unsubscribe(topic: string): Promise<MqttRequest> {
        if (typeof(topic) !== 'string') {
            return Promise.reject("topic is not a string");
        }

        this.subscriptions.remove(topic);

        let options : internal_mqtt_client.UnsubscribeOptions = {};
        if (this.config.protocol_operation_timeout) {
            options.timeoutInMillis = this.config.protocol_operation_timeout;
        }

        let unsuback = await this.internalClient.unsubscribe({
            topicFilters: [
                topic
            ]
        }, options);

        return {
            packet_id: (unsuback as model.UnsubackPacketInternal).packetId
        };
    }

    /**
     * Close the connection (async).
     * @returns Promise which completes when the connection is closed.
     */
    async disconnect() {
        const isStarted = this.desiredState == MqttBrowserClientState.Connected;
        this.desiredState = MqttBrowserClientState.Stopped;

        if (!isStarted && this.currentState == MqttBrowserClientState.Stopped) {
            return Promise.resolve();
        }

        let stopped = once(this.internalClient, "stopped");

        if (isStarted) {
            this.internalClient.stop();
        }

        return stopped;
    }

    /**
     * Queries whether the client is currently connected
     *
     * @returns whether the client is currently connected
     */
    is_connected() : boolean {
        return this.currentState == MqttBrowserClientState.Connected;
    }

    private on_connection_success = (event: internal_mqtt_client.ConnectionSuccessEvent) => {
        this.on_online(event.connack.sessionPresent);
    }

    private on_online = (session_present: boolean) => {
        this.isSessionPresent = session_present;
        this.currentState = MqttBrowserClientState.Connected;

        if (++this.connection_count == 1) {
            this.emit('connect', session_present);
        } else {
            /** Reset reconnect times after reconnect succeed. */
            this.emit('resume', 0, session_present);
        }

        // Call connection success every time we connect, whether it is a first connect or a reconnect
        let successCallbackData = { session_present: session_present } as OnConnectionSuccessResult;
        this.emit('connection_success', successCallbackData);
    }

    private on_connection_failure = (event: internal_mqtt_client.ConnectionFailureEvent) => {
        let failureCallbackData = { error: event.error } as OnConnectionFailedResult;
        this.emit('connection_failure', failureCallbackData);
    }

    private on_disconnection = (event : internal_mqtt_client.DisconnectionEvent)=> {
        this.currentState = MqttBrowserClientState.Stopped;
        this.emit('interrupt', -1);
    }

    private on_stopped = (event : internal_mqtt_client.StoppedEvent) => {
        this.emit("closed");
        this.emit("disconnect");
    }

    private on_publish_received = (event : internal_mqtt_client.PublishReceivedEvent) => {

        let packet = event.publish as model.PublishPacketInternal;
        let topic = packet.topicName;
        let payload = packet.payload;
        let retain = packet.retain ?? false;

        const array_buffer = payload ? model.payloadToArrayBuffer(payload) : new ArrayBuffer(0);

        const callback = this.subscriptions.find(topic);
        if (callback) {
            callback(topic, array_buffer, packet.duplicate, packet.qos, retain);
        }
        this.emit('message', topic, array_buffer, packet.duplicate, packet.qos, retain);
    }
}
