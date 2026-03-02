/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from "../../common/mqtt5_packet"
import * as mqtt5 from "../../common/mqtt5"
import * as protocol from "./protocol"
import * as model from "./model"
import * as mqtt_shared from "../../common/mqtt_shared";
import * as promise from "../../common/promise"
import * as ws from "../ws"
import * as utils from "./utils"
import {flogError, flogDebug, flogInfo, logDebug, logInfo} from "../../common/io";
import * as log from "../../common/log";

import {CrtError} from "../error";
import {BufferedEventEmitter} from "../../common/event";

import {OfflineQueuePolicy, ConnectOptions, PublishOptions, PublishResult, PublishResultType, ResumeSessionPolicyType, SubscribeOptions, UnsubscribeOptions} from "./protocol";
export {OfflineQueuePolicy, ConnectOptions, PublishOptions, PublishResult, PublishResultType, ResumeSessionPolicyType, SubscribeOptions, UnsubscribeOptions};

/**
 * Emitted when the client begins a connection attempt
 */
export interface ConnectingEvent {
}

/**
 * Type signature for a function that handles ConnectingEvent events
 */
export type ConnectingEventListener = (eventData: ConnectingEvent) => void;

/**
 * Emitted when the client successfully establishes an MQTT connection to the remote endpoint
 */
export interface ConnectionSuccessEvent {
    connack: mqtt5_packet.ConnackPacket,
}

/**
 * Type signature for a function that handles ConnectionSuccessEvent events
 */
export type ConnectionSuccessEventListener = (eventData: ConnectionSuccessEvent) => void;

/**
 * Emitted when the client fails to establish an MQTT connection to the remote endpoint
 */
export interface ConnectionFailureEvent {
    error: CrtError,
    connack?: mqtt5_packet.ConnackPacket
}

/**
 * Type signature for a function that handles ConnectionFailureEvent events
 */
export type ConnectionFailureEventListener = (eventData: ConnectionFailureEvent) => void;

/**
 * Emitted when a successfully-established MQTT connection is interrupted for any reason.  Can only follow
 * a ConnectionSuccessEvent.
 */
export interface DisconnectionEvent {
    error: CrtError,
    disconnect?: mqtt5_packet.DisconnectPacket
}

/**
 * Type signature for a function that handles DisconnectionEvent events
 */
export type DisconnectionEventListener = (eventData: DisconnectionEvent) => void;

/**
 * Emitted when the client enters the stopped state (no connection attempts will be made until restarted)
 */
export interface StoppedEvent {
}

/**
 * Type signature for a function that handles StoppedEvent events
 */
export type StoppedEventListener = (eventData: StoppedEvent) => void;

/**
 * Emitted whenever the client receives a publish packet from the MQTT broker
 */
export interface PublishReceivedEvent {
    publish: mqtt5_packet.PublishPacket
}

/**
 * Type signature for a function that handles PublishReceivedEvent events
 */
export type PublishReceivedEventListener = (eventData: PublishReceivedEvent) => void;

/**
 * Client-relevant configuration options
 */
export interface ClientConfig {

    /**
     * What version of MQTT to use.
     */
    protocolVersion : model.ProtocolMode,

    /**
     * How should queued packets be treated when the client is not connected?
     */
    offlineQueuePolicy : OfflineQueuePolicy,

    /**
     * Configuration for the initial CONNECT packet sent by the client once the transport is established
     */
    connectOptions : ConnectOptions,

    /**
     * Timeout, in milliseconds, to wait for a Pingresp after a Pingreq has been sent.  If the timeout is breached,
     * the connection will be closed.
     */
    pingTimeoutMillis? : number,

    /**
     * Function that creates a Websocket connection to the remote broker
     */
    connectionFactory : () => Promise<ws.WsStream>,

    /**
     * Overarching timeout for MQTT connection establishment.  Failure to establish an MQTT connection by this timeout
     * results in
     */
    connectTimeoutMillis : number,

    /**
     * How should the reconnection delay be randomized, if at all?
     */
    retryJitterMode?: mqtt5.RetryJitterType,

    /**
     * Minimum amount of time, in milliseconds, to wait between reconnection attempts
     */
    minReconnectDelayMs? : number,

    /**
     * Maximum amount of time, in milliseconds, to wait between reconnection attempts
     */
    maxReconnectDelayMs? : number,

    /**
     * The length of time a successful connection must persist before we clear the reconnect attempts state.
     * This allows the client to persist its reconnect delay when connections are getting terminated shortly after
     * establishment.
     */
    resetConnectionFailureCountMillis? : number
}

function buildConnectOptionsLogString(prefix: string, options: ConnectOptions) : string {
    let result = `${prefix}ConnectOptions: {\n`;

    result = log.appendNumericPropertyLine(result, prefix, "KeepAliveIntervalSeconds", options.keepAliveIntervalSeconds);
    result = log.appendOptionalEnumPropertyLine(result, prefix, "ResumeSessionPolicy", (val) => ResumeSessionPolicyType[val], options.resumeSessionPolicy);
    result = log.appendOptionalStringPropertyLine(result, prefix, "ClientId", options.clientId);
    // keep username opaque intentionally; there can be authentication-sensitive data in it
    result = log.appendOptionalBytesPropertyLine(result, prefix, "Username", options.username);
    result = log.appendOptionalBytesPropertyLine(result, prefix, "Password", options.password);
    result = log.appendOptionalNumericPropertyLine(result, prefix, "SessionExpiryIntervalSeconds", options.sessionExpiryIntervalSeconds);
    result = log.appendOptionalBooleanPropertyLine(result, prefix, "RequestResponseInformation", options.requestResponseInformation);
    result = log.appendOptionalBooleanPropertyLine(result, prefix, "RequestProblemInformation", options.requestProblemInformation);
    result = log.appendOptionalNumericPropertyLine(result, prefix, "ReceiveMaximum", options.receiveMaximum);
    result = log.appendOptionalNumericPropertyLine(result, prefix, "MaximumPacketSizeBytes", options.maximumPacketSizeBytes);
    result = log.appendOptionalNumericPropertyLine(result, prefix, "willDelayIntervalSeconds", options.willDelayIntervalSeconds);

    if (options.will) {
        result += `${prefix}  Will: {\n`;
        result += model.publishPacketToLogString(options.will as model.PublishPacketInternal, prefix + "    ");
        result += `${prefix}  }\n`;
    }

    result = model.appendUserProperties(result, prefix, options.userProperties);

    result += `${prefix}}\n`;

    return result;
}

function buildClientConfigLogString(prefix: string, config: ClientConfig) : string {
    let result = `${prefix}ClientConfig: {\n`;

    result = log.appendEnumPropertyLine(result, prefix, "ProtocolVersion", (val) => model.ProtocolMode[val], config.protocolVersion);
    result = log.appendEnumPropertyLine(result, prefix, "OfflineQueuePolicy", (val) => OfflineQueuePolicy[val], config.offlineQueuePolicy);
    result += buildConnectOptionsLogString(prefix + "  ", config.connectOptions);
    result = log.appendOptionalNumericPropertyLine(result, prefix, "PingTimeoutMillis", config.pingTimeoutMillis);
    result = log.appendNumericPropertyLine(result, prefix, "ConnectTimeoutMillis", config.connectTimeoutMillis);
    result = log.appendOptionalEnumPropertyLine(result, prefix, "RetryJitterMode", (val) => mqtt5.RetryJitterType[val], config.retryJitterMode);
    result = log.appendOptionalNumericPropertyLine(result, prefix, "MinReconnectDelayMs", config.minReconnectDelayMs);
    result = log.appendOptionalNumericPropertyLine(result, prefix, "MaxReconnectDelayMs", config.maxReconnectDelayMs);
    result = log.appendOptionalNumericPropertyLine(result, prefix, "ResetConnectionFailureCountMillis", config.resetConnectionFailureCountMillis);

    result += `${prefix}}\n`;

    return result;
}

/**
 * The states that the client can be in
 */
enum ClientState {

    /**
     * The client is stopped and will not make any connection attempts
     */
    Stopped,

    /**
     * The client is attempting to establish an MQTT connection.  This state includes socket connection, websocket
     * connection, and MQTT Connect<->Connack exchange.
     */
    Connecting,

    /**
     * The client has a successfully-established MQTT connection with the remote broker.
     */
    Connected,

    /**
     * The client is waiting to reconnect to the remote broker.
     */
    PendingReconnect
}

/*
 * State related to auxiliary data for the ConnectionFailed, ConnectionSucceeded, Disconnected events
 *
 * Sometimes we need to hold these values beyond when they are initially known
 */
interface ConnectionCallbackState {
    connack?: mqtt5_packet.ConnackPacket,
    disconnect?: mqtt5_packet.DisconnectPacket,
    crtError?: CrtError,
}

/*
 * If not overridden in the client config, this is the length of time a successful connection must persist before
 * we clear the reconnect attempts state.  This allows the client to persist its reconnect delay when connections
 * are getting terminated shortly after establishment (like when "poisoned" packets are resubmitted on
 * connection success).
 */
const DEFAULT_RESET_CONNECTION_FAILURE_COUNT_MILLIS : number = 30 * 1000;

const CLIENT_LOG_SUBJECT : string = "InternalMqttClient";

/**
 * Internal MQTT client implementation that supports both 311 and 5.  Restricted to match IoT Core's
 * feature set (no QoS 2 support).
 */
export class Client extends BufferedEventEmitter {

    private protocolState: protocol.ProtocolState;

    private desiredState: ClientState = ClientState.Stopped;
    private currentState: ClientState = ClientState.Stopped;

    private creationTime: number = new Date().getTime();

    /*
     * connectionId and nextConnectionId are used to ensure that async connection completion callbacks are for
     * the "current" connection attempt.  They keep scenarios like the following from confusing the client:
     *
     * 1. Kick off connection attempt #1
     * 2. User timeout kicks in causing a connection failure event, client enters reconnecting state
     * 3. Reconnection delay completes
     * 4. Kick off connection attempt #2
     * 5. Connection attempt #1 completes with a socket level timeout, client incorrectly thinks attempt #2 failed
     *
     * We fix this by lambda capturing the current connectionId in the connection attempt function and then comparing
     * the captured value and the current value on connection attempt completion.
     */
    private connection? : ws.WsStream = undefined;
    private connectionId : number = 0;
    private pendingConnectionTimeout? : number = undefined;
    private nextConnectionId : number = 1;

    /*
     * Reconnect state
     */
    private reconnectTimepoint? : number = undefined;
    private lastReconnectDelay? : number = undefined;
    private connectionFailureCount : number = 0;
    private resetConnectionFailuresTimepoint? : number = undefined;

    private nextServiceTimepoint? : number = undefined;
    private serviceTask? : number = undefined;
    private inService : boolean = false;

    private socketWriteBuffer : ArrayBuffer = new ArrayBuffer(4096);

    /*
     * Callbacks for the websocket stream
     */
    private onConnectionClosedCallback : () => void;
    private onConnectionDataCallback : (data: any) => void;

    private connectionCallbackState : ConnectionCallbackState = {};

    constructor(private config: ClientConfig) {
        super();

        logInfo(CLIENT_LOG_SUBJECT, "Creating MQTT client with configuration:");
        flogInfo(CLIENT_LOG_SUBJECT, () => { return buildClientConfigLogString("", config); });

        this.protocolState = new protocol.ProtocolState({
            protocolVersion : config.protocolVersion,
            offlineQueuePolicy : config.offlineQueuePolicy,
            connectOptions : config.connectOptions,
            baseElapsedMillis : 0,
            pingTimeoutMillis : config.pingTimeoutMillis
        });

        this.protocolState.addListener("halted", (event : protocol.HaltedEvent) => {
            queueMicrotask(() => this.onProtocolStateHalted(event));
        });
        this.protocolState.addListener("connackReceived", (event : protocol.ConnackReceivedEvent) => {
            queueMicrotask(() => this.onConnackReceivedEvent(event));
        });
        this.protocolState.addListener("publishReceived", (event : protocol.PublishReceivedEvent) => {
            queueMicrotask(() => this.onPublishReceivedEvent(event));
        });
        this.protocolState.addListener("disconnectReceived", (event : protocol.DisconnectReceivedEvent) => {
            queueMicrotask(() => this.onDisconnectReceivedEvent(event));
        });

        this.onConnectionClosedCallback = () => { queueMicrotask(() => this.onConnectionClosed())};
        this.onConnectionDataCallback = (data : any) => { queueMicrotask(() => this.onConnectionData(data))};
    }

    /**
     * Initiates the transition to a connected state if appropriate
     */
    start() {
        if (this.desiredState == ClientState.Stopped) {
            logInfo(CLIENT_LOG_SUBJECT, "Starting MQTT client" );
            this.desiredState = ClientState.Connected;
            if (this.currentState == ClientState.Stopped) {
                this.transitionToState(ClientState.Connecting);
            }
        }
    }

    /**
     * Initiates the transition to a stopped state if appropriate.
     *
     * If a disconnect packet is passed in and the client is currently connected, the client will delay connection
     * close until the packet can be flushed.
     *
     * @param disconnect - optional disconnect packet to send before closing an active connection
     */
    stop(disconnect?: mqtt5_packet.DisconnectPacket) {
        if (this.desiredState == ClientState.Connected) {
            logInfo(CLIENT_LOG_SUBJECT, "Stopping MQTT client" );
            this.desiredState = ClientState.Stopped;
            if (this.connectionCallbackState.crtError == undefined) {
                this.connectionCallbackState.crtError = new CrtError("Client stopped by user request");
            }

            switch (this.currentState) {
                case ClientState.Connecting:
                    this.shutdownConnection();
                    break;

                case ClientState.Connected: {
                    if (disconnect) {
                        let client : Client = this;
                        this.protocolState.handleUserEvent({
                            type: protocol.UserEventType.Disconnect,
                            elapsedMillis: this.getCurrentTime(),
                            context: {
                                packet: model.cloneDisconnectShallow(disconnect),
                                resultHandler: {
                                    onCompletionSuccess: () => { client.shutdownConnection(); },
                                    onCompletionFailure: () => { client.shutdownConnection(); },
                                }
                            }
                        });
                    } else {
                        this.shutdownConnection();
                    }
                    break;
                }

                case ClientState.PendingReconnect:
                    this.transitionToState(ClientState.Stopped);
                    break;

                default:
                    break;
            }

            this.reevaluateService();
        }
    }

    /**
     * Queues a publish packet to be sent to the remote broker.  If successfully queued, the packet will be sent
     * as soon as it reaches the head of the queue while the client is connected.
     *
     * @param publish publish packet to send
     * @param options additional configuration options
     */
    async publish(publish: mqtt5_packet.PublishPacket, options?: PublishOptions) : Promise<PublishResult> {
        logInfo(CLIENT_LOG_SUBJECT, "publish called" );

        // use lifted promise to guarantee submission is not conditional on an await invocation.  JS may execute
        // async promise bodies synchronously until the first await, but doing it this way keeps us independent of that
        // runtime internal behavior.
        let liftedPublish = promise.newLiftedPromise<PublishResult>();

        try {
            this.protocolState.handleUserEvent({
                type: protocol.UserEventType.Publish,
                context: {
                    packet: model.clonePublishShallow(publish),
                    options: {
                        options: options ?? {},
                        resultHandler: {
                            onCompletionSuccess : (value : PublishResult) => {
                                liftedPublish.resolve(value);
                                },
                            onCompletionFailure : (error : CrtError) => { liftedPublish.reject(error); }
                        }
                    }
                },
                elapsedMillis: this.getCurrentTime()
            });

            this.reevaluateService();
        } catch (e) {
            flogError(CLIENT_LOG_SUBJECT, () => { return `Failed to submit publish operation: ${e}`; });

            liftedPublish.reject(e);
        }

        return liftedPublish.promise;
    }

    /**
     * Queues a subscribe packet to be sent to the remote broker.  If successfully queued, the packet will be sent
     * as soon as it reaches the head of the queue while the client is connected.
     *
     * @param subscribe subscribe packet to send
     * @param options additional configuration options
     */
    async subscribe(subscribe: mqtt5_packet.SubscribePacket, options?: SubscribeOptions) : Promise<mqtt5_packet.SubackPacket> {
        logInfo(CLIENT_LOG_SUBJECT, "subscribe called" );

        // use lifted promise to guarantee submission is not conditional on an await invocation.  JS may execute
        // async promise bodies synchronously until the first await, but doing it this way keeps us independent of that
        // runtime internal behavior.
        let liftedSubscribe = promise.newLiftedPromise<mqtt5_packet.SubackPacket>();

        try {
            this.protocolState.handleUserEvent({
                type: protocol.UserEventType.Subscribe,
                context: {
                    packet: model.cloneSubscribeShallow(subscribe),
                    options: {
                        options: options ?? {},
                        resultHandler: {
                            onCompletionSuccess : (value : mqtt5_packet.SubackPacket) => { liftedSubscribe.resolve(value); },
                            onCompletionFailure : (error : CrtError) => { liftedSubscribe.reject(error); }
                        }
                    }
                },
                elapsedMillis: this.getCurrentTime()
            });

            this.reevaluateService();
        } catch (e) {
            flogError(CLIENT_LOG_SUBJECT, () => { return `Failed to submit subscribe operation: ${e}`; });

            liftedSubscribe.reject(e);
        }

        return liftedSubscribe.promise;
    }

    /**
     * Queues an unsubscribe packet to be sent to the remote broker.  If successfully queued, the packet will be sent
     * as soon as it reaches the head of the queue while the client is connected.
     *
     * @param unsubscribe unsubscribe packet to send
     * @param options additional configuration options
     */
    async unsubscribe(unsubscribe: mqtt5_packet.UnsubscribePacket, options?: UnsubscribeOptions) : Promise<mqtt5_packet.UnsubackPacket> {
        logInfo(CLIENT_LOG_SUBJECT, "unsubscribe called" );

        // use lifted promise to guarantee submission is not conditional on an await invocation.  JS may execute
        // async promise bodies synchronously until the first await, but doing it this way keeps us independent of that
        // runtime internal behavior.
        let liftedUnsubscribe = promise.newLiftedPromise<mqtt5_packet.UnsubackPacket>();

        try {
            this.protocolState.handleUserEvent({
                type: protocol.UserEventType.Unsubscribe,
                context: {
                    packet: model.cloneUnsubscribeShallow(unsubscribe),
                    options: {
                        options: options ?? {},
                        resultHandler: {
                            onCompletionSuccess : (value : mqtt5_packet.UnsubackPacket) => { liftedUnsubscribe.resolve(value); },
                            onCompletionFailure : (error : CrtError) => { liftedUnsubscribe.reject(error); }
                        }
                    }
                },
                elapsedMillis: this.getCurrentTime()
            });

            this.reevaluateService();
        } catch (e) {
            flogError(CLIENT_LOG_SUBJECT, () => { return `Failed to submit unsubscribe operation: ${e}`; });

            liftedUnsubscribe.reject(e);
        }

        return liftedUnsubscribe.promise;
    }

    /**
     * Event emitted when the client begins a connection attempt
     *
     * Listener type: {@link ConnectingEventListener}
     *
     * @event
     */
    static CONNECTING : string = 'connecting';

    /**
     * Event emitted when the client has successfully connected to the remote broker
     *
     * Listener type: {@link ConnectionSuccessEventListener}
     *
     * @event
     */
    static CONNECTION_SUCCESS : string = 'connectionSuccess';

    /**
     * Event emitted when the client has failed to connect to the remote broker
     *
     * Listener type: {@link ConnectionFailureEventListener}
     *
     * @event
     */
    static CONNECTION_FAILURE : string = 'connectionFailure';

    /**
     * Event emitted when the client's connection has been closed
     *
     * Listener type: {@link DisconnectionEventListener}
     *
     * @event
     */
    static DISCONNECTION : string = 'disconnection';

    /**
     * Event emitted when the client enters the stopped state
     *
     * Listener type: {@link StoppedEventListener}
     *
     * @event
     */
    static STOPPED : string = 'stopped';

    /**
     * Event emitted when the client receives a publish message from the broker
     *
     * Listener type: {@link PublishReceivedEventListener}
     *
     * @event
     */
    static PUBLISH_RECEIVED : string = 'publishReceived';

    /**
     * Registers a listener for the client's {@link ConnectingEvent} event.  A
     * {@link ConnectingEvent} event is emitted when the client initiates a connection attempt with
     * a remote broker.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'connecting', listener: ConnectingEventListener): this;

    /**
     * Registers a listener for the client's {@link ConnectionSuccessEvent} event.  A
     * {@link ConnectionSuccessEvent} event is emitted when a successful CONNACK packet is received from the
     * broker at the conclusion of a connection attempt.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'connectionSuccess', listener: ConnectionSuccessEventListener): this;

    /**
     * Registers a listener for the client's {@link ConnectionFailureEvent} event.  A
     * {@link ConnectionFailureEvent} event is emitted when a connection attempt fails.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'connectionFailure', listener: ConnectionFailureEventListener): this;

    /**
     * Registers a listener for the client's {@link DisconnectionEvent} event.  A
     * {@link DisconnectionEvent} event is emitted when a successfully established connection is closed.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'disconnection', listener: DisconnectionEventListener): this;

    /**
     * Registers a listener for the client's {@link StoppedEvent} event.  A
     * {@link StoppedEvent} event is emitted when the client enters the stopped state.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'stopped', listener: StoppedEventListener): this;

    /**
     * Registers a listener for the client's {@link PublishReceivedEvent} event.  A
     * {@link PublishReceivedEvent} event is emitted every time the client receives a publish packet from the
     * broker.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'publishReceived', listener: PublishReceivedEventListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    private onSocketWrite(error: Error | null | undefined) {
        if (error) {
            logDebug(CLIENT_LOG_SUBJECT, `onSocketWrite called with error: ${error.toString()}`);
        } else {
            logDebug(CLIENT_LOG_SUBJECT, "onSocketWrite called");
        }

        if (this.currentState != ClientState.Connected) {
            return;
        }

        if (!error) {
            this.protocolState.handleNetworkEvent({
                type: protocol.NetworkEventType.WriteCompletion,
                elapsedMillis: this.getCurrentTime()
            });
        } else {
            this.connection?.socket.close();
        }

        this.reevaluateService();
    }

    private service() {
        this.inService = true;
        this.serviceTask = undefined;
        this.nextServiceTimepoint = undefined;
        let currentTime = this.getCurrentTime();

        logDebug(CLIENT_LOG_SUBJECT, "begin servicing client");

        if (this.pendingConnectionTimeout != undefined && currentTime >= this.pendingConnectionTimeout) {
            logInfo(CLIENT_LOG_SUBJECT, "pending connection timeout exceeded");

            if (this.connectionCallbackState.crtError == undefined) {
                this.connectionCallbackState.crtError = new CrtError("Connection establishment timeout");
            }
            this.shutdownConnection();
        }

        if (this.reconnectTimepoint != undefined && currentTime >= this.reconnectTimepoint) {
            logInfo(CLIENT_LOG_SUBJECT, "reconnect interval exceeded, reconnecting");

            this.reconnectTimepoint = undefined;
            if (this.desiredState == ClientState.Connected) {
                this.transitionToState(ClientState.Connecting);
            } else {
                this.transitionToState(ClientState.Stopped);
            }
        }

        if (this.resetConnectionFailuresTimepoint != undefined && currentTime >= this.resetConnectionFailuresTimepoint) {
            logInfo(CLIENT_LOG_SUBJECT, "reset connection failures interval exceeded, resetting failure count to zero");

            if (this.currentState == ClientState.Connected) {
                this.connectionFailureCount = 0;
            }
            this.resetConnectionFailuresTimepoint = undefined;
        }

        if (this.connection) {
            let serviceResult = this.protocolState.service({
                elapsedMillis: currentTime,
                socketBuffer: this.socketWriteBuffer,

            });

            let toSocketView = serviceResult.toSocket;
            if (toSocketView != undefined && toSocketView.byteLength > 0) {
                // @ts-ignore
                flogDebug(CLIENT_LOG_SUBJECT, () => { return `writing ${toSocketView.byteLength} bytes to socket`; });

                const dataAsUint8Array = new Uint8Array(
                    toSocketView.buffer,
                    toSocketView.byteOffset,
                    toSocketView.byteLength
                );

                this.connection.write(dataAsUint8Array, this.onSocketWrite.bind(this));
            }
        }

        this.inService = false;

        this.reevaluateService();

        logDebug(CLIENT_LOG_SUBJECT, "end servicing client");
    }

    private reevaluateService() {
        if (this.inService) {
            return;
        }

        let currentTime = this.getCurrentTime();

        let serviceTime = this.pendingConnectionTimeout;
        serviceTime = utils.foldTimeMin(serviceTime, this.reconnectTimepoint);
        if (this.currentState == ClientState.Connected) {
            serviceTime = utils.foldTimeMin(serviceTime, this.protocolState.getNextServiceTimepoint(currentTime));
            serviceTime = utils.foldTimeMin(serviceTime, this.resetConnectionFailuresTimepoint);
        }

        if (serviceTime != undefined && this.nextServiceTimepoint != undefined && serviceTime >= this.nextServiceTimepoint) {
            logDebug(CLIENT_LOG_SUBJECT, "next service time already covered by existing scheduled task");
            return;
        }

        if (this.serviceTask != undefined) {
            logDebug(CLIENT_LOG_SUBJECT, "clearing scheduled service task");
            clearTimeout(this.serviceTask);
            this.serviceTask = undefined;
            this.nextServiceTimepoint = undefined;
        }

        if (serviceTime != undefined) {
            let futureMillis = serviceTime - currentTime;
            flogDebug(CLIENT_LOG_SUBJECT, () => { return `scheduling next service for ${futureMillis} millis from now`; });
            setTimeout(this.service.bind(this), Math.max(0, futureMillis));
            this.nextServiceTimepoint = serviceTime;
        }
    }

    private getCurrentTime(): number {
        return new Date().getTime() - this.creationTime;
    }

    private changeState(state: ClientState) {
        if (state != this.currentState) {
            flogInfo(CLIENT_LOG_SUBJECT, () => { return `changing client state from ${ClientState[this.currentState]} to ${ClientState[state]}`; });
            this.currentState = state;
        }
    }

    private transitionToState(state : ClientState) {
        flogInfo(CLIENT_LOG_SUBJECT, () => { return `transitioning client state from ${ClientState[this.currentState]} to ${ClientState[state]}`; });

        switch (state) {
            case ClientState.Connecting:
                this.transitionToStateConnecting();
                break;

            case ClientState.Connected:
                this.transitionToStateConnected();
                break;

            case ClientState.PendingReconnect:
                this.transitionToStatePendingReconnect();
                break;

            case ClientState.Stopped:
                this.transitionToStateStopped();
                break;
        }
    }

    private transitionToStateConnecting() {
        this.changeState(ClientState.Connecting);
        let expectedConnectionId = this.nextConnectionId;
        this.connectionId = expectedConnectionId;
        this.pendingConnectionTimeout = this.getCurrentTime() + this.config.connectTimeoutMillis;
        this.nextConnectionId++;
        this.clearConnectionCallbackState();

        this.emit(Client.CONNECTING, {});

        logDebug(CLIENT_LOG_SUBJECT, "queuing connection attempt");

        let client : Client = this;
        queueMicrotask(async () => {
            try {
                let connectionPromise = client.config.connectionFactory();
                let stream = await connectionPromise;
                if (client.connectionId == expectedConnectionId && client.desiredState == ClientState.Connected && client.currentState == ClientState.Connecting) {
                    client.connection = stream;
                    client.transitionToState(ClientState.Connected);
                } else {
                    stream.socket.close();
                }
            } catch (e) {
                if (client.connectionCallbackState.crtError == undefined) {
                    let err = e as Error;
                    client.connectionCallbackState.crtError = new CrtError(err.toString());
                }

                client.shutdownConnection();
            }

            client.reevaluateService();
        });

        this.reevaluateService();
    }

    private transitionToStateConnected() {
        this.changeState(ClientState.Connected);
        this.linkToConnection();
        let currentTime = this.getCurrentTime();
        this.resetConnectionFailuresTimepoint = currentTime + (this.config.resetConnectionFailureCountMillis ?? DEFAULT_RESET_CONNECTION_FAILURE_COUNT_MILLIS);

        let connackTimeout = this.pendingConnectionTimeout ?? this.creationTime;
        this.protocolState.handleNetworkEvent({
            type: protocol.NetworkEventType.ConnectionOpened,
            context: {
                establishmentTimeoutMillis : connackTimeout
            },
            elapsedMillis: currentTime
        });

        this.reevaluateService();
    }

    private transitionToStatePendingReconnect() {
        this.changeState(ClientState.PendingReconnect);

        let reconnectContext = {
            retryJitterMode: this.config.retryJitterMode,
            minReconnectDelayMs : this.config.minReconnectDelayMs,
            maxReconnectDelayMs : this.config.maxReconnectDelayMs,
            lastReconnectDelay : this.lastReconnectDelay,
            connectionFailureCount : this.connectionFailureCount,
        };
        let nextDelay : number = mqtt_shared.calculateNextReconnectDelay(reconnectContext);

        this.lastReconnectDelay = nextDelay;
        this.connectionFailureCount += 1;

        flogInfo(CLIENT_LOG_SUBJECT, () => { return `Waiting ${nextDelay} millis to reconnect`; });

        this.reconnectTimepoint = this.getCurrentTime() + nextDelay;
        this.reevaluateService();
    }

    private transitionToStateStopped() {
        this.pendingConnectionTimeout = undefined;
        this.reconnectTimepoint = undefined;
        this.resetConnectionFailuresTimepoint = undefined;
        this.lastReconnectDelay = undefined;
        this.connectionFailureCount = 0;

        this.changeState(ClientState.Stopped);
        this.reevaluateService();

        this.emit(Client.STOPPED, {});
    }

    private shutdownConnection() {
        logInfo(CLIENT_LOG_SUBJECT, "Shutting down connection");

        this.pendingConnectionTimeout = undefined;
        this.unlinkFromConnection();
        if (this.currentState == ClientState.Connected) {
            this.protocolState.handleNetworkEvent({
                type: protocol.NetworkEventType.ConnectionClosed,
                elapsedMillis: this.getCurrentTime()
            });
        }

        this.emitConnectionTerminationEvent();
        this.resetConnectionFailuresTimepoint = undefined;
        if (this.desiredState == ClientState.Connected) {
            this.transitionToState(ClientState.PendingReconnect);
        } else {
            this.transitionToState(ClientState.Stopped);
        }
    }

    private onConnackReceivedEvent(event : protocol.ConnackReceivedEvent) {
        if (this.connectionCallbackState.connack == undefined) {
            this.connectionCallbackState.connack = event.packet;
        }

        this.pendingConnectionTimeout = undefined;
        if (event.packet.reasonCode == mqtt5_packet.ConnectReasonCode.Success) {
            this.emit(Client.CONNECTION_SUCCESS, {
                connack: event.packet
            });
        }

        this.reevaluateService();
    }

    private onPublishReceivedEvent(event : protocol.PublishReceivedEvent) {
        this.emit(Client.PUBLISH_RECEIVED, {
            publish: event.packet
        });
    }

    private onDisconnectReceivedEvent(event : protocol.DisconnectReceivedEvent) {
        if (this.connectionCallbackState.disconnect == undefined) {
            this.connectionCallbackState.disconnect = event.packet;
        }
    }

    private onProtocolStateHalted(event : protocol.HaltedEvent) {
        if (this.connectionCallbackState.crtError == undefined) {
            this.connectionCallbackState.crtError = event.reason;
        }

        this.shutdownConnection();
    }

    private onConnectionClosed() {
        if (this.connectionCallbackState.crtError == undefined) {
            this.connectionCallbackState.crtError = new CrtError("Socket closed");
        }

        this.shutdownConnection();
    }

    private onConnectionData(chunk : any) {
        if (this.currentState == ClientState.Connected) {
            let buffer = chunk as Buffer;
            let context : protocol.NetworkEventContext = {
                type: protocol.NetworkEventType.IncomingData,
                elapsedMillis: this.getCurrentTime(),
                context: {
                    data: new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
                }
            };

            this.protocolState.handleNetworkEvent(context);

            this.reevaluateService();
        }
    }

    private linkToConnection() {
        if (this.connection) {
            this.connection.addListener("close", this.onConnectionClosedCallback);
            this.connection.addListener("data", this.onConnectionDataCallback);
        }
    }

    private unlinkFromConnection() {
        if (this.connection) {
            let connection = this.connection;
            this.connection = undefined;

            connection.removeListener("close", this.onConnectionClosedCallback);
            connection.removeListener("data", this.onConnectionDataCallback);
            connection.socket.close();
        }
    }

    private clearConnectionCallbackState() {
        this.connectionCallbackState.connack = undefined;
        this.connectionCallbackState.disconnect = undefined;
        this.connectionCallbackState.crtError = undefined;
    }

    private emitConnectionTerminationEvent() {
        if (this.connectionCallbackState.connack && mqtt5_packet.isSuccessfulConnectReasonCode(this.connectionCallbackState.connack.reasonCode)) {
            let event : DisconnectionEvent = {
                error: this.connectionCallbackState.crtError ?? new CrtError("Unknown error"),
            };
            if (this.connectionCallbackState.disconnect) {
                event.disconnect = this.connectionCallbackState.disconnect;
            }
            logInfo(CLIENT_LOG_SUBJECT, "Emitting disconnection event");
            flogDebug(CLIENT_LOG_SUBJECT, () => buildDisconnectionEventLogString(event, ""));

            this.emit(Client.DISCONNECTION, event);
        } else {
            let event : ConnectionFailureEvent = {
                error: this.connectionCallbackState.crtError ?? new CrtError("Unknown error")
            };
            if (this.connectionCallbackState.connack) {
                event.connack = this.connectionCallbackState.connack;
            }

            logInfo(CLIENT_LOG_SUBJECT, "Emitting connection failure event");
            flogDebug(CLIENT_LOG_SUBJECT, () => buildConnectionFailureEventLogString(event, ""));

            this.emit(Client.CONNECTION_FAILURE, event);
        }
    }
}

function buildDisconnectionEventLogString(event: DisconnectionEvent, prefix: string) : string {
    let result = `${prefix}DisconnectionEvent: {\n`;

    result += `${prefix}  error: "${event.error.toString()}"\n`;
    if (event.disconnect) {
        result += `${prefix}  disconnect: ${model.disconnectPacketToLogString(event.disconnect as model.DisconnectPacketInternal, prefix + "  ")}`;
    }

    result += `${prefix}}`

    return result;
}

function buildConnectionFailureEventLogString(event: ConnectionFailureEvent, prefix: string) : string {
    let result = `${prefix}ConnectionFailureEvent: {\n`;

    result += `${prefix}  error: "${event.error.toString()}\n"`;
    if (event.connack) {
        result += `${prefix}  connack: ${model.connackPacketToLogString(event.connack as model.ConnackPacketInternal, prefix + "  ")}`;
    }

    result += `${prefix}}`

    return result;
}
