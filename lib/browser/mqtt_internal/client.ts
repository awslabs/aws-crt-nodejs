/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from "../../common/mqtt5_packet"
import * as mqtt5 from "../../common/mqtt5"
import * as protocol from "./protocol"
import * as mod from "./mod"
import * as model from "./model"
import * as mqtt_shared from "../../common/mqtt_shared";
import * as promise from "../../common/promise"
import * as ws from "../ws"
import * as utils from "./utils"

import {CrtError} from "../error";
import {BufferedEventEmitter} from "../../common/event";


export interface ConnectingEvent {
}

export type ConnectingEventListener = (eventData: ConnectingEvent) => void;

export interface ConnectionSuccessEvent {
    connack: mqtt5_packet.ConnackPacket,
}

export type ConnectionSuccessEventListener = (eventData: ConnectionSuccessEvent) => void;

export interface ConnectionFailureEvent {
    error: CrtError,
    connack?: mqtt5_packet.ConnackPacket
}

export type ConnectionFailureEventListener = (eventData: ConnectionFailureEvent) => void;

export interface DisconnectionEvent {
    error: CrtError,
    disconnect?: mqtt5_packet.DisconnectPacket
}

export type DisconnectionEventListener = (eventData: DisconnectionEvent) => void;

export interface StoppedEvent {
}

export type StoppedEventListener = (eventData: StoppedEvent) => void;

export interface PublishReceivedEvent {
    publish: mqtt5_packet.PublishPacket
}

export type PublishReceivedEventListener = (eventData: PublishReceivedEvent) => void;

export interface ClientConfig {
    protocolVersion : model.ProtocolMode,
    offlineQueuePolicy : mod.OfflineQueuePolicy,
    connectOptions : mod.ConnectOptions,
    pingTimeoutMillis? : number,

    connectionFactory : () => Promise<ws.WsStream>,
    connectTimeoutMillis : number,

    retryJitterMode?: mqtt5.RetryJitterType,
    minReconnectDelayMs? : number,
    maxReconnectDelayMs? : number,
    resetConnectionFailureCountMillis? : number
}

enum ClientState {
    Stopped,
    Connecting,
    Connected,
    PendingReconnect
}

interface ConnectionCallbackState {
    connack?: mqtt5_packet.ConnackPacket,
    disconnect?: mqtt5_packet.DisconnectPacket,
    crtError?: CrtError,
}

const DEFAULT_RESET_CONNECTION_FAILURE_COUNT_MILLIS : number = 30 * 1000;

export class Client extends BufferedEventEmitter {

    private protocolState: protocol.ProtocolState;

    private desiredState: ClientState = ClientState.Stopped;
    private currentState: ClientState = ClientState.Stopped;

    private creationTime: number = new Date().getTime();

    private connection? : ws.WsStream = undefined;
    private connectionId : number = 0;
    private pendingConnectionTimeout? : number = undefined;
    private nextConnectionId : number = 1;

    private reconnectTimepoint? : number = undefined;
    private lastReconnectDelay? : number = undefined;
    private connectionFailureCount : number = 0;
    private resetConnectionFailuresTimepoint? : number = undefined;

    private nextServiceTimepoint? : number = undefined;
    private serviceTask? : number = undefined;
    private inService : boolean = false;

    private socketWriteBuffer : ArrayBuffer = new ArrayBuffer(4096);

    private onConnectionClosedCallback : () => void;
    private onConnectionDataCallback : (data: any) => void;

    private connectionCallbackState : ConnectionCallbackState = {};

    constructor(private config: ClientConfig) {
        super();

        this.protocolState = new protocol.ProtocolState({
            protocolVersion : config.protocolVersion,
            offlineQueuePolicy : config.offlineQueuePolicy,
            connectOptions : config.connectOptions,
            baseElapsedMillis : this.creationTime,
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

    start() {
        if (this.desiredState == ClientState.Stopped) {
            this.desiredState = ClientState.Connected;
            if (this.currentState == ClientState.Stopped) {
                this.transitionToState(ClientState.Connecting);
            }
        }
    }

    stop(disconnect?: mqtt5_packet.DisconnectPacket) {
        if (this.desiredState == ClientState.Connected) {
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

    async publish(publish: mqtt5_packet.PublishPacket, options?: mod.PublishOptions) : Promise<mod.PublishResult> {
        // use lifted promise to guarantee submission is not conditional on an await invocation.  JS may execute
        // async promise bodies synchronously until the first await, but doing it this way keeps us independent of that
        // runtime internal behavior.
        let liftedPublish = promise.newLiftedPromise<mod.PublishResult>();

        try {
            this.protocolState.handleUserEvent({
                type: protocol.UserEventType.Publish,
                context: {
                    packet: model.clonePublishShallow(publish),
                    options: {
                        options: options ?? {},
                        resultHandler: {
                            onCompletionSuccess : (value : mod.PublishResult) => {
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
            liftedPublish.reject(e);
        }

        return liftedPublish.promise;
    }

    async subscribe(subscribe: mqtt5_packet.SubscribePacket, options?: mod.SubscribeOptions) : Promise<mqtt5_packet.SubackPacket> {
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
            liftedSubscribe.reject(e);
        }

        return liftedSubscribe.promise;
    }

    async unsubscribe(unsubscribe: mqtt5_packet.UnsubscribePacket, options?: mod.UnsubscribeOptions) : Promise<mqtt5_packet.UnsubackPacket> {
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

        if (this.pendingConnectionTimeout != undefined && currentTime >= this.pendingConnectionTimeout) {
            if (this.connectionCallbackState.crtError == undefined) {
                this.connectionCallbackState.crtError = new CrtError("Connection establishment timeout");
            }
            this.shutdownConnection();
        }

        if (this.reconnectTimepoint != undefined && currentTime >= this.reconnectTimepoint) {
            this.reconnectTimepoint = undefined;
            if (this.desiredState == ClientState.Connected) {
                this.transitionToState(ClientState.Connecting);
            } else {
                this.transitionToState(ClientState.Stopped);
            }
        }

        if (this.resetConnectionFailuresTimepoint != undefined && currentTime >= this.resetConnectionFailuresTimepoint) {
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
            return;
        }

        if (this.serviceTask != undefined) {
            clearTimeout(this.serviceTask);
            this.serviceTask = undefined;
            this.nextServiceTimepoint = undefined;
        }

        if (serviceTime != undefined) {
            setTimeout(this.service.bind(this), Math.max(0, serviceTime - currentTime));
        }
    }

    private getCurrentTime(): number {
        return new Date().getTime() - this.creationTime;
    }

    private changeState(state: ClientState) {
        this.currentState = state;
    }

    private transitionToState(state : ClientState) {
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

        this.emit(Client.STOPPED, {});

        this.reevaluateService();
    }

    private shutdownConnection() {
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
            this.emit(Client.DISCONNECTION, event);
        } else {
            let event : ConnectionFailureEvent = {
                error: this.connectionCallbackState.crtError ?? new CrtError("Unknown error")
            };
            if (this.connectionCallbackState.connack) {
                event.connack = this.connectionCallbackState.connack;
            }
            this.emit(Client.CONNECTION_FAILURE, event);
        }
    }
}

