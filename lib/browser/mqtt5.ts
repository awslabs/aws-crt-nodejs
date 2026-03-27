/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Browser specific MQTT5 client implementation
 *
 * [MQTT5 Client User Guide](https://www.github.com/awslabs/aws-crt-nodejs/blob/main/MQTT5-UserGuide.md)
 *
 * @packageDocumentation
 * @module mqtt5
 * @mergeTarget
 *
 */

import {BufferedEventEmitter} from "../common/event";
import * as internal_mqtt_client from "./mqtt_internal/client";
import {PublishResultType} from "./mqtt_internal/client";
import * as mqtt5 from "../common/mqtt5";
import * as mqtt5_packet from "../common/mqtt5_packet"
import {CrtError} from "./error";
import * as ws from "./ws";
import * as mqtt_shared from "../common/mqtt_shared";
import * as auth from "./auth";

export * from "../common/mqtt5";
export * from '../common/mqtt5_packet';


/**
 * Factory function that allows the user to completely control the url used to form the websocket handshake
 * request.
 */
export type Mqtt5WebsocketUrlFactory = () => string;

/**
 * Type of url to construct when establishing an MQTT5 connection over websockets
 */
export enum Mqtt5WebsocketUrlFactoryType {

    /**
     * Websocket connection over plain-text with no additional handshake transformation
     */
    Ws = 1,

    /**
     * Websocket connection over TLS with no additional handshake transformation
     */
    Wss = 2,

    /**
     * Websocket connection over TLS with a handshake signed by the Aws Sigv4 signing process
     */
    Sigv4 = 3,

    /**
     * Websocket connection whose url is formed by a user-supplied callback function
     */
    Custom = 4
}

/**
 * Websocket factory options discriminated union variant for untransformed connections over plain-text
 */
export interface Mqtt5WebsocketUrlFactoryWsOptions {
    urlFactory: Mqtt5WebsocketUrlFactoryType.Ws;
};

/**
 * Websocket factory options discriminated union variant for untransformed connections over TLS
 */
export interface Mqtt5WebsocketUrlFactoryWssOptions {
    urlFactory: Mqtt5WebsocketUrlFactoryType.Wss;
};

/**
 * Websocket factory options discriminated union variant for untransformed connections over TLS signed by
 * the AWS Sigv4 signing process.
 */
export interface Mqtt5WebsocketUrlFactorySigv4Options {
    urlFactory : Mqtt5WebsocketUrlFactoryType.Sigv4;

    /**
     * AWS Region to sign against.
     */
    region?: string;

    /**
     * Provider to source AWS credentials from
     */
    credentialsProvider: auth.CredentialsProvider;
}

/**
 * Websocket factory options discriminated union variant for arbitrarily transformed handshake urls.
 */
export interface Mqtt5WebsocketUrlFactoryCustomOptions {
    urlFactory: Mqtt5WebsocketUrlFactoryType.Custom;

    customUrlFactory: Mqtt5WebsocketUrlFactory;
};

/**
 * Union of all websocket factory option possibilities.
 */
export type Mqtt5WebsocketUrlFactoryOptions = Mqtt5WebsocketUrlFactoryWsOptions | Mqtt5WebsocketUrlFactoryWssOptions | Mqtt5WebsocketUrlFactorySigv4Options | Mqtt5WebsocketUrlFactoryCustomOptions;

/**
 * Browser-specific websocket configuration options for connection establishment
 */
export interface Mqtt5WebsocketConfig {

    /**
     * Options determining how the websocket url is created.
     */
    urlFactoryOptions : Mqtt5WebsocketUrlFactoryOptions;

    /**
     * Opaque options set passed through to the underlying websocket implementation regardless of url factory.
     * Use this to control proxy settings amongst other things.
     */
    wsOptions?: any;
}

/**
 * Configuration options for mqtt5 client creation.
 */
export interface Mqtt5ClientConfig {

    /**
     * Host name of the MQTT server to connect to.
     */
    hostName: string;

    /**
     * Network port of the MQTT server to connect to.
     */
    port: number;

    /**
     * Controls how the MQTT5 client should behave with respect to MQTT sessions.
     */
    sessionBehavior? : mqtt5.ClientSessionBehavior;

    /**
     * Controls how the reconnect delay is modified in order to smooth out the distribution of reconnection attempt
     * timepoints for a large set of reconnecting clients.
     */
    retryJitterMode? : mqtt5.RetryJitterType;

    /**
     * Minimum amount of time to wait to reconnect after a disconnect.  Exponential backoff is performed with jitter
     * after each connection failure.
     */
    minReconnectDelayMs? : number;

    /**
     * Maximum amount of time to wait to reconnect after a disconnect.  Exponential backoff is performed with jitter
     * after each connection failure.
     */
    maxReconnectDelayMs? : number;

    /**
     * Amount of time that must elapse with an established connection before the reconnect delay is reset to the minimum.
     * This helps alleviate bandwidth-waste in fast reconnect cycles due to permission failures on operations.
     */
    minConnectedTimeToResetReconnectDelayMs? : number;

    /**
     * All configurable options with respect to the CONNECT packet sent by the client, including the will.  These
     * connect properties will be used for every connection attempt made by the client.
     */
    connectProperties?: mqtt5_packet.ConnectPacket;

    /**
     * Overall time interval to wait to establish an MQTT connection.  If a complete MQTT connection (from socket
     * establishment all the way up to CONNACK receipt) has not been established before this timeout expires,
     * the connection attempt will be considered a failure.
     */
    connectTimeoutMs? : number;

    /**
     * Additional controls for client behavior with respect to topic alias usage.
     *
     * If this setting is left undefined, then topic aliasing behavior will be disabled.
     */
    topicAliasingOptions? : mqtt5.TopicAliasingOptions

    /**
     * Options for the underlying websocket connection
     *
     * @group Browser-only
     */
    websocketOptions?: Mqtt5WebsocketConfig;
}

function convertSessionBehaviorToSessionPolicy(behavior?: mqtt5.ClientSessionBehavior) : internal_mqtt_client.ResumeSessionPolicyType {
    switch (behavior) {
        case mqtt5.ClientSessionBehavior.Default:
        case mqtt5.ClientSessionBehavior.Clean:
            return internal_mqtt_client.ResumeSessionPolicyType.Never;

        case mqtt5.ClientSessionBehavior.RejoinPostSuccess:
            return internal_mqtt_client.ResumeSessionPolicyType.PostSuccess;

        case mqtt5.ClientSessionBehavior.RejoinAlways:
            return internal_mqtt_client.ResumeSessionPolicyType.Always;

        default:
            return internal_mqtt_client.ResumeSessionPolicyType.Default;
    }
}

function applyConnectPacketToInternalConnectOptions(internalConnectOptions : internal_mqtt_client.ConnectOptions, connectProperties?: mqtt5_packet.ConnectPacket) {
    if (!connectProperties) {
        return;
    }

    if (connectProperties.clientId !== undefined) {
        internalConnectOptions.clientId = connectProperties.clientId;
    }

    if (connectProperties.username !== undefined) {
        internalConnectOptions.username = connectProperties.username;
    }

    if (connectProperties.password !== undefined) {
        internalConnectOptions.password = connectProperties.password;
    }

    if (connectProperties.sessionExpiryIntervalSeconds !== undefined) {
        internalConnectOptions.sessionExpiryIntervalSeconds = connectProperties.sessionExpiryIntervalSeconds;
    }

    if (connectProperties.requestResponseInformation !== undefined) {
        internalConnectOptions.requestResponseInformation = connectProperties.requestResponseInformation;
    }

    if (connectProperties.requestProblemInformation !== undefined) {
        internalConnectOptions.requestProblemInformation = connectProperties.requestProblemInformation;
    }

    if (connectProperties.receiveMaximum !== undefined) {
        internalConnectOptions.receiveMaximum = connectProperties.receiveMaximum;
    }

    if (connectProperties.maximumPacketSizeBytes !== undefined) {
        internalConnectOptions.maximumPacketSizeBytes = connectProperties.maximumPacketSizeBytes;
    }

    if (connectProperties.willDelayIntervalSeconds !== undefined) {
        internalConnectOptions.willDelayIntervalSeconds = connectProperties.willDelayIntervalSeconds;
    }

    if (connectProperties.will !== undefined) {
        internalConnectOptions.will = connectProperties.will;
    }

    if (connectProperties.userProperties !== undefined) {
        internalConnectOptions.userProperties = connectProperties.userProperties;
    }
}

const DEFAULT_MQTT_PING_TIMEOUT_MS : number = 30 * 1000;
const DEFAULT_CONNECT_TIMEOUT_MS : number = 10 * 1000;

/**
 * Browser specific MQTT5 client implementation
 *
 * [MQTT5 Client User Guide](https://www.github.com/awslabs/aws-crt-nodejs/blob/main/MQTT5-UserGuide.md)
 */
export class Mqtt5Client extends BufferedEventEmitter implements mqtt5.IMqtt5Client {
    private internalClient: internal_mqtt_client.Client;
    private connected : boolean = false;

    /**
     * Client constructor
     *
     * @param config The configuration for this client
     */
    constructor(private config: Mqtt5ClientConfig) {
        super();

        if (!config) {
            throw new CrtError("Mqtt5Client constructor: config not defined");
        }

        let internalConnectOptions : internal_mqtt_client.ConnectOptions = {
            keepAliveIntervalSeconds: this.config.connectProperties?.keepAliveIntervalSeconds ?? 1200,
            resumeSessionPolicy: convertSessionBehaviorToSessionPolicy(this.config.sessionBehavior),
        };

        applyConnectPacketToInternalConnectOptions(internalConnectOptions, config.connectProperties);

        let provider : auth.CredentialsProvider | undefined = undefined;
        if (this.config.websocketOptions) {
            if (this.config.websocketOptions.urlFactoryOptions.urlFactory == Mqtt5WebsocketUrlFactoryType.Sigv4) {
                let sigv4Options = this.config.websocketOptions.urlFactoryOptions as Mqtt5WebsocketUrlFactorySigv4Options;
                provider = sigv4Options.credentialsProvider;
            }
        }

        let thisConfig = this.config;
        let connectionFactory : () => Promise<ws.WsStream> = function () {
            return new Promise<ws.WsStream>(async (resolve, reject) => {
                if (provider) {
                    await provider.refreshCredentials();
                }

                let conn : ws.WsStream = ws.create_mqtt5_websocket_stream(thisConfig);
                conn.on('error', (err) => {
                    reject(err);
                });
                conn.on('connect', () => {
                    resolve(conn);
                });
            });
        };

        let internalConfig : internal_mqtt_client.ClientConfig = {
            protocolVersion: internal_mqtt_client.ProtocolMode.Mqtt5,
            offlineQueuePolicy: internal_mqtt_client.OfflineQueuePolicy.PreserveQos1PlusPublishes,
            connectOptions: internalConnectOptions,
            pingTimeoutMillis: DEFAULT_MQTT_PING_TIMEOUT_MS,
            connectionFactory: connectionFactory,
            connectTimeoutMillis: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
            retryJitterMode: mqtt5.RetryJitterType.Default,
        };

        if (config.minReconnectDelayMs !== undefined) {
            internalConfig.minReconnectDelayMs = config.minReconnectDelayMs;
        }

        if (config.maxReconnectDelayMs !== undefined) {
            internalConfig.maxReconnectDelayMs = config.maxReconnectDelayMs;
        }

        if (config.minConnectedTimeToResetReconnectDelayMs !== undefined) {
            internalConfig.resetConnectionFailureCountMillis = config.minConnectedTimeToResetReconnectDelayMs;
        }

        this.internalClient = new internal_mqtt_client.Client(internalConfig);

        this.internalClient.on("connectionSuccess", this.on_connection_success.bind(this));
        this.internalClient.on("connectionFailure", this.on_connection_failure.bind(this));
        this.internalClient.on("disconnection", this.on_disconnection.bind(this));
        this.internalClient.on("publishReceived", this.on_publish_received.bind(this));
        this.internalClient.on("stopped", this.on_stopped.bind(this));
        this.internalClient.on("connecting", this.on_connecting.bind(this));
    }

    /**
     * Triggers cleanup of native resources associated with the MQTT5 client.  On the browser, the implementation is
     * an empty function.
     */
    close() {}

    /**
     * Notifies the MQTT5 client that you want it to maintain connectivity to the configured endpoint.
     * The client will attempt to stay connected using the properties of the reconnect-related parameters
     * in the mqtt5 client configuration.
     *
     * This is an asynchronous operation.
     */
    start() {
        this.internalClient.start();
    }

    /**
     * Notifies the MQTT5 client that you want it to end connectivity to the configured endpoint, disconnecting any
     * existing connection and halting reconnection attempts.
     *
     * This is an asynchronous operation.  Once the process completes, no further events will be emitted until the client
     * has {@link start} invoked.  Invoking {@link start start()} after a {@link stop stop()} will always result in
     * a new MQTT session.
     *
     * @param disconnectPacket (optional) properties of a DISCONNECT packet to send as part of the shutdown process
     */
    stop(disconnectPacket?: mqtt5_packet.DisconnectPacket) {
        this.internalClient.stop(disconnectPacket);
    }

    /**
     * Subscribe to one or more topic filters by queuing a SUBSCRIBE packet to be sent to the server.
     *
     * @param packet SUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the SUBACK response
     */
    async subscribe(packet: mqtt5_packet.SubscribePacket) : Promise<mqtt5_packet.SubackPacket> {
        if (!packet) {
            throw new CrtError("Invalid subscribe packet");
        }

        return await this.internalClient.subscribe(packet);
    }

    /**
     * Unsubscribe from one or more topic filters by queuing an UNSUBSCRIBE packet to be sent to the server.
     *
     * @param packet UNSUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the UNSUBACK response
     */
    async unsubscribe(packet: mqtt5_packet.UnsubscribePacket) : Promise<mqtt5_packet.UnsubackPacket> {
        if (!packet) {
            throw new CrtError("Invalid unsubscribe packet");
        }

        return await this.internalClient.unsubscribe(packet);
    }

    /**
     * Send a message to subscribing clients by queuing a PUBLISH packet to be sent to the server.
     *
     * @param packet PUBLISH packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the PUBACK response (QoS 1), or
     * undefined (QoS 0)
     */
    async publish(packet: mqtt5_packet.PublishPacket) : Promise<mqtt5.PublishCompletionResult> {
        if (!packet) {
            throw new CrtError("Invalid publish packet");
        }

        let publishResult = await this.internalClient.publish(packet);
        switch (publishResult.type) {
            case PublishResultType.Qos1:
                return publishResult.packet as mqtt5_packet.PubackPacket;

            default:
                return undefined;
        }
    }

    /**
     * Queries whether the client is currently connected
     *
     * @returns whether the client is currently connected
     */
    isConnected() : boolean {
        return this.connected;
    }

    /**
     * Event emitted when the client encounters a disruptive error condition.  Not currently used.
     *
     * Listener type: {@link ErrorEventListener}
     *
     * @event
     */
    static ERROR : string = 'error';

    /**
     * Event emitted when the client encounters a transient error event that will not disrupt promises based on
     * lifecycle events.  Currently, mqtt-js client error events are relayed to this event.
     *
     * Listener type: {@link ErrorEventListener}
     *
     * @event
     * @group Browser-only
     */
    static INFO : string = 'info';

    /**
     * Event emitted when an MQTT PUBLISH packet is received by the client.
     *
     * Listener type: {@link MessageReceivedEventListener}
     *
     * @event
     */
    static MESSAGE_RECEIVED : string = 'messageReceived';

    /**
     * Event emitted when the client begins a connection attempt.
     *
     * Listener type: {@link AttemptingConnectEventListener}
     *
     * @event
     */
    static ATTEMPTING_CONNECT : string = 'attemptingConnect';

    /**
     * Event emitted when the client successfully establishes an MQTT connection.  Only emitted after
     * an {@link ATTEMPTING_CONNECT attemptingConnect} event.
     *
     * Listener type: {@link ConnectionSuccessEventListener}
     *
     * @event
     */
    static CONNECTION_SUCCESS : string = 'connectionSuccess';

    /**
     * Event emitted when the client fails to establish an MQTT connection.  Only emitted after
     * an {@link ATTEMPTING_CONNECT attemptingConnect} event.
     *
     * Listener type: {@link ConnectionFailureEventListener}
     *
     * @event
     */
    static CONNECTION_FAILURE : string = 'connectionFailure';

    /**
     * Event emitted when the client's current connection is closed for any reason.  Only emitted after
     * a {@link CONNECTION_SUCCESS connectionSuccess} event.
     *
     * Listener type: {@link DisconnectionEventListener}
     *
     * @event
     */
    static DISCONNECTION : string = 'disconnection';

    /**
     * Event emitted when the client finishes shutdown as a result of the user invoking {@link stop}.
     *
     * Listener type: {@link StoppedEventListener}
     *
     * @event
     */
    static STOPPED : string = 'stopped';

    /**
     * Registers a listener for the client's {@link ERROR error} event.  An {@link ERROR error} event is emitted when
     * the client encounters a disruptive error condition.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'error', listener: mqtt5.ErrorEventListener): this;

    /**
     * Registers a listener for the client's {@link INFO info} event.  An {@link INFO info} event is emitted when
     * the client encounters a transient error event that will not disrupt promises based on lifecycle events.
     * Currently, mqtt-js client error events are relayed to this event.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     *
     * @group Browser-only
     */
    on(event: 'info', listener: mqtt5.ErrorEventListener): this;

    /**
     * Registers a listener for the client's {@link MESSAGE_RECEIVED messageReceived} event.  A
     * {@link MESSAGE_RECEIVED messageReceived} event is emitted when an MQTT PUBLISH packet is received by the
     * client.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'messageReceived', listener: mqtt5.MessageReceivedEventListener): this;

    /**
     * Registers a listener for the client's {@link ATTEMPTING_CONNECT attemptingConnect} event.  A
     * {@link ATTEMPTING_CONNECT attemptingConnect} event is emitted every time the client begins a connection attempt.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'attemptingConnect', listener: mqtt5.AttemptingConnectEventListener): this;

    /**
     * Registers a listener for the client's {@link CONNECTION_SUCCESS connectionSuccess} event.  A
     * {@link CONNECTION_SUCCESS connectionSuccess} event is emitted every time the client successfully establishes
     * an MQTT connection.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'connectionSuccess', listener: mqtt5.ConnectionSuccessEventListener): this;

    /**
     * Registers a listener for the client's {@link CONNECTION_FAILURE connectionFailure} event.  A
     * {@link CONNECTION_FAILURE connectionFailure} event is emitted every time the client fails to establish an
     * MQTT connection.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'connectionFailure', listener: mqtt5.ConnectionFailureEventListener): this;

    /**
     * Registers a listener for the client's {@link DISCONNECTION disconnection} event.  A
     * {@link DISCONNECTION disconnection} event is emitted when the client's current MQTT connection is closed
     * for any reason.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'disconnection', listener: mqtt5.DisconnectionEventListener): this;

    /**
     * Registers a listener for the client's {@link STOPPED stopped} event.  A
     * {@link STOPPED stopped} event is emitted when the client finishes shutdown as a
     * result of the user invoking {@link stop}.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'stopped', listener: mqtt5.StoppedEventListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    private on_connecting(event : internal_mqtt_client.ConnectingEvent) {
        let attemptingConnectEvent: mqtt5.AttemptingConnectEvent = {};

        setTimeout(() => {
            this.emit(Mqtt5Client.ATTEMPTING_CONNECT, attemptingConnectEvent);
        }, 0);
    }

    private on_connection_success(event: internal_mqtt_client.ConnectionSuccessEvent) {
        this.connected = true;

        let settings : mqtt5.NegotiatedSettings = create_negotiated_settings(this.config, event.connack);

        let connectionSuccessEvent: mqtt5.ConnectionSuccessEvent = {
            connack: event.connack,
            settings: settings
        };

        setTimeout(() => {
            this.emit(Mqtt5Client.CONNECTION_SUCCESS, connectionSuccessEvent);
        }, 0);
    }

    private on_connection_failure(event : internal_mqtt_client.ConnectionFailureEvent) {
        let connectionFailureEvent: mqtt5.ConnectionFailureEvent = {
            error: event.error
        }

        if (event.connack) {
            connectionFailureEvent.connack = event.connack;
        }

        setTimeout(() => {
            this.emit(Mqtt5Client.CONNECTION_FAILURE, connectionFailureEvent);
        }, 0);
    }

    private on_disconnection(event: internal_mqtt_client.DisconnectionEvent) {
        this.connected = false;

        let disconnectionEvent : mqtt5.DisconnectionEvent = {
            error: event.error
        };

        if (event.disconnect) {
            disconnectionEvent.disconnect = event.disconnect;
        }

        setTimeout(() => {
            this.emit(Mqtt5Client.DISCONNECTION, disconnectionEvent);
        }, 0);
    }

    private on_stopped(event: internal_mqtt_client.StoppedEvent) {
        let stoppedEvent : mqtt5.StoppedEvent = {
        };

        setTimeout(() => {
            this.emit(Mqtt5Client.STOPPED, stoppedEvent);
        }, 0);
    }

    private on_publish_received = (event: internal_mqtt_client.PublishReceivedEvent) => {
        let messageReceivedEvent: mqtt5.MessageReceivedEvent = {
            message: event.publish
        };

        mqtt_shared.queueAcknowledgeableEvent(this, Mqtt5Client.MESSAGE_RECEIVED, messageReceivedEvent, "acknowledgementControl", event.acknowledgementControl);
    }
}

function create_negotiated_settings(config : Mqtt5ClientConfig, connack: mqtt5_packet.ConnackPacket) : mqtt5.NegotiatedSettings {
    if (config == null || config == undefined) {
        throw new CrtError("create_negotiated_settings: config not defined");
    }
    if (connack == null || connack == undefined) {
        throw new CrtError("create_negotiated_settings: connack not defined");
    }

    return {
        maximumQos: Math.min(connack.maximumQos ?? mqtt5_packet.QoS.ExactlyOnce, mqtt5_packet.QoS.AtLeastOnce),
        sessionExpiryInterval: connack.sessionExpiryInterval ?? config.connectProperties?.sessionExpiryIntervalSeconds ?? 0,
        receiveMaximumFromServer: connack.receiveMaximum ?? mqtt_shared.DEFAULT_RECEIVE_MAXIMUM,
        maximumPacketSizeToServer: connack.maximumPacketSize ?? mqtt_shared.MAXIMUM_PACKET_SIZE,
        topicAliasMaximumToServer: Math.min(config.topicAliasingOptions?.outboundCacheMaxSize ?? 0, connack.topicAliasMaximum ?? 0),
        topicAliasMaximumToClient: config.topicAliasingOptions?.inboundCacheMaxSize ?? 0,
        serverKeepAlive: connack.serverKeepAlive ?? config.connectProperties?.keepAliveIntervalSeconds ?? mqtt_shared.DEFAULT_KEEP_ALIVE,
        retainAvailable: connack.retainAvailable ?? true,
        wildcardSubscriptionsAvailable: connack.wildcardSubscriptionsAvailable ?? true,
        subscriptionIdentifiersAvailable: connack.subscriptionIdentifiersAvailable ?? true,
        sharedSubscriptionsAvailable: connack.sharedSubscriptionsAvailable ?? true,
        rejoinedSession: connack.sessionPresent,
        clientId: connack.assignedClientIdentifier ?? config.connectProperties?.clientId ?? ""
    };
}