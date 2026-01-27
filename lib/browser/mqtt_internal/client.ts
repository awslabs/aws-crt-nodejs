/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from "../../common/mqtt5_packet"
import * as mqtt5 from "../../common/mqtt5"
import * as protocol from "./protocol"
import * as mod from "./mod"
import * as model from "./model"
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
    settings: mqtt5.NegotiatedSettings
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
    connectTimeoutMillis : number
}

enum ClientState {
    Stopped,
    Connecting,
    Connected,
    PendingReconnect
}

export class Client extends BufferedEventEmitter {

    private protocolState: protocol.ProtocolState;

    private desiredState: ClientState = ClientState.Stopped;
    private currentState: ClientState = ClientState.Stopped;

    private creationTime: number = new Date().getTime();

    private connection? : ws.WsStream = undefined;
    private pendingConnectionId? : number = undefined;
    private pendingConnectionTimeout? : number = undefined;
    private nextConnectionId : number = 1;

    private reconnectTimepoint? : number = undefined;

    private nextServiceTimepoint? : number = undefined;
    private serviceTask? : number = undefined;

    private socketWriteBuffer : ArrayBuffer = new ArrayBuffer(4096);


    constructor(private config: ClientConfig) {
        super();

        this.protocolState = new protocol.ProtocolState({
            protocolVersion : config.protocolVersion,
            offlineQueuePolicy : config.offlineQueuePolicy,
            connectOptions : config.connectOptions,
            baseElapsedMillis : this.creationTime,
            pingTimeoutMillis : config.pingTimeoutMillis
        });

        this.protocolState.on("halted", (event : protocol.HaltedEvent) => {
            this.onProtocolStateHalted(event);
        });
    }

    start() {
        if (this.desiredState == ClientState.Stopped) {
            this.desiredState = ClientState.Connected;
            if (this.currentState == ClientState.Stopped) {
                this.beginConnect();
            }
        }
    }

    stop(disconnect?: mqtt5_packet.DisconnectPacket) {
        if (this.desiredState == ClientState.Connected) {
            this.desiredState = ClientState.Stopped;
            switch (this.currentState) {
                case ClientState.Connecting:
                    break;

                case ClientState.Connected:
                    break;

                case ClientState.PendingReconnect:
                    break;

                default:
                    break;
            }
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
                    packet: publish,
                    options: {
                        options: options ?? {},
                        resultHandler: {
                            onCompletionSuccess : (value : mod.PublishResult) => { liftedPublish.resolve(value); },
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
                    packet: subscribe,
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
                    packet: unsubscribe,
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
        let currentTime = this.getCurrentTime();

        if (this.pendingConnectionTimeout != undefined && currentTime >= this.pendingConnectionTimeout) {
            this.pendingConnectionId = undefined;
            this.pendingConnectionTimeout = undefined;

            this.doConnectionFailureStateTransition();
        }

        if (this.reconnectTimepoint != undefined && currentTime >= this.reconnectTimepoint) {
            this.reconnectTimepoint = undefined;
            if (this.desiredState == ClientState.Connected) {
                this.beginConnect();
            } else {
                this.changeState(ClientState.Stopped);
            }
        }

        if (this.connection) {
            let serviceResult = this.protocolState.service({
                elapsedMillis: currentTime,
                socketBuffer: this.socketWriteBuffer,
            });

            if (serviceResult.toSocket) {
                this.connection.write(serviceResult.toSocket, this.onSocketWrite);
            }
        }

        this.reevaluateService();
    }

    private reevaluateService() {
        let currentTime = this.getCurrentTime();

        let stateServiceTime = this.protocolState.getNextServiceTimepoint(currentTime);
        let serviceTime = utils.foldTimeMin(stateServiceTime, this.pendingConnectionTimeout);
        serviceTime = utils.foldTimeMin(serviceTime, this.reconnectTimepoint);

        if (serviceTime != undefined && this.nextServiceTimepoint != undefined && serviceTime >= this.nextServiceTimepoint) {
            return;
        }

        if (this.serviceTask != undefined) {
            clearTimeout(this.serviceTask);
            this.serviceTask = undefined;
            this.nextServiceTimepoint = undefined;
        }

        if (serviceTime != undefined) {
            setTimeout(this.service, Math.max(0, serviceTime - currentTime));
        }
    }

    private getCurrentTime(): number {
        return new Date().getTime() - this.creationTime;
    }

    private onProtocolStateHalted(event : protocol.HaltedEvent) {

    }

    private changeState(state: ClientState) {
        this.currentState = state;
    }

    private beginConnect() {
        let expectedConnectionId = this.nextConnectionId;
        this.currentState = ClientState.Connecting;
        this.pendingConnectionId = expectedConnectionId;
        this.pendingConnectionTimeout = this.getCurrentTime() + this.config.connectTimeoutMillis;
        this.nextConnectionId++;

        this.emit('??', {});

        setImmediate(async () => {
            try {
                let connectionPromise = this.config.connectionFactory();
                let stream = await connectionPromise;
                if (this.pendingConnectionId == expectedConnectionId && this.desiredState == ClientState.Connected) {
                    this.connection = stream;
                    this.changeState(ClientState.Connected);

                    let currentTime = this.getCurrentTime();
                    let connackTimeout = this.pendingConnectionTimeout ?? 0;
                    this.protocolState.handleNetworkEvent({
                        type: protocol.NetworkEventType.ConnectionOpened,
                        context: {
                            establishmentTimeoutMillis : connackTimeout
                        },
                        elapsedMillis: currentTime
                    });
                } else {
                    stream.socket.close();
                }
            } catch (e) {
                if (this.connection) {
                    this.connection.socket.close();
                    this.connection = undefined;
                }

                this.doConnectionFailureStateTransition();
            }

            this.pendingConnectionId = undefined;
            this.pendingConnectionTimeout = undefined;
            this.reevaluateService();
        });

        this.reevaluateService();
    }

    private doConnectionFailureStateTransition() {
        if (this.desiredState == ClientState.Connected) {
            this.changeState(ClientState.PendingReconnect);
        } else {
            this.changeState(ClientState.Stopped);
        }
    }
}