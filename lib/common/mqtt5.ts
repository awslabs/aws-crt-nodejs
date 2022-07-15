/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt5
 */

import {
    ConnackPacket,
    DisconnectPacket, PubackPacket,
    PublishPacket, SubackPacket,
    SubscribePacket, UnsubackPacket, UnsubscribePacket, QoS, ConnectPacket
} from "./mqtt5_packet";
import {ICrtError} from "./error";

/**
 * Mqtt behavior settings that are dynamically negotiated as part of the CONNECT/CONNACK exchange.
 *
 * While you can infer all of these values from a combination of
 *   (1) defaults as specified in the mqtt5 spec
 *   (2) your CONNECT settings
 *   (3) the CONNACK from the broker
 *
 * the client instead does the combining for you and emits a NegotiatedSettings object with final, authoritative values.
 *
 * Negotiated settings are communicated with every successful connection establishment.
 */
export interface NegotiatedSettings {

    /**
     * The maximum QoS allowed for publishes on this connection instance
     */
    maximumQos: QoS;

    /**
     * The amount of time in seconds the server will retain the MQTT session after a disconnect.
     */
    sessionExpiryInterval: number;

    /**
     * The number of in-flight QoS 1 and QoS2 publications the server is willing to process concurrently.
     */
    receiveMaximumFromServer: number;

    /**
     * The maximum packet size the server is willing to accept.
     */
    maximumPacketSizeToServer: number;

    /**
     * The maximum amount of time in seconds between client packets.  The client should use PINGREQs to ensure this
     * limit is not breached.  The server will disconnect the client for inactivity if no MQTT packet is received
     * in a time interval equal to 1.5 x this value.
     */
    serverKeepAlive: number;

    /**
     * Whether the server supports retained messages.
     */
    retainAvailable: Boolean;

    /**
     * Whether the server supports wildcard subscriptions.
     */
    wildcardSubscriptionsAvailable: Boolean;

    /**
     * Whether the server supports subscription identifiers
     */
    subscriptionIdentifiersAvailable: Boolean;

    /**
     * Whether the server supports shared subscriptions
     */
    sharedSubscriptionsAvailable: Boolean;

    /**
     * Whether the client has rejoined an existing session.
     */
    rejoinedSession: Boolean;

    /**
     * The final client id in use by the newly-established connection.  This will be the configured client id if one
     * was given in the configuration, otherwise, if no client id was specified, this will be the client id assigned
     * by the server.  Reconnection attempts will always use the auto-assigned client id, allowing for auto-assigned
     * session resumption.
     */
    clientId: string;
}

/**
 * Controls how the MQTT5 client should behave with respect to MQTT sessions.
 */
export enum ClientSessionBehavior {

    /**
     * Always ask for a clean session when connecting
     */
    Clean = 0,

    /**
     * Always attempt to rejoin an existing session after an initial connection success.
     *
     * Session rejoin requires an appropriate non-zero session expiry interval in the client's CONNECT options.
     */
    RejoinPostSuccess = 1,
}

/**
 * Controls how disconnects affect the queued and in-progress operations tracked by the client.  Also controls
 * how operations are handled while the client is not connected.  In particular, if the client is not connected,
 * then any operation that would be failed on disconnect (according to these rules) will be rejected.
 */
export enum ClientOperationQueueBehavior {

    /**
     * Re-queues QoS 1+ publishes on disconnect; un-acked publishes go to the front while unprocessed publishes stay
     * in place.  All other operations (QoS 0 publishes, subscribe, unsubscribe) are failed.
     */
    FailNonQos1PublishOnDisconnect = 0,

    /**
     * QoS 0 publishes that are not complete at the time of disconnection are failed.  Un-acked QoS 1+ publishes are
     * re-queued at the head of the line for immediate retransmission on a session resumption.  All other operations
     * are requeued in original order behind any retransmissions.
     */
    FailQos0PublishOnDisconnect = 1,

    /**
     * All operations that are not complete at the time of disconnection are failed, except operations that
     * the MQTT5 spec requires to be retransmitted (un-acked QoS1+ publishes).
     */
    FailAllOnDisconnect = 2,
}

/**
 * Controls how the reconnect delay is modified in order to smooth out the distribution of reconnection attempt
 * timepoints for a large set of reconnecting clients.
 *
 * See [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
 */
export enum RetryJitterType {

    /**
     * Maps to Full
     */
    Default = 0,

    /**
     * Do not perform any randomization on the reconnect delay:
     * ```NextReconnectDelay = CurrentExponentialBackoffValue```
     */
    None = 1,

    /**
     * Fully random between no delay and the current exponential backoff value.
     * ```NextReconnectDelay = Random(0, CurrentExponentialBackoffValue)```
     */
    Full = 2,

    /**
     * ```NextReconnectDelay = Min(MaxReconnectDelay, Random(MinReconnectDelay, 3 * CurrentReconnectDelay)```
     */
    Decorrelated = 3,
}

export interface Mqtt5ClientConfigShared {

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
    sessionBehavior? : ClientSessionBehavior;

    /**
     * Controls how disconnects affect the queued and in-progress operations tracked by the client.  Also controls
     * how new operations are handled while the client is not connected.  In particular, if the client is not connected,
     * then any operation that would be failed on disconnect (according to these rules) will also be rejected.
     */
    offlineQueueBehavior? : ClientOperationQueueBehavior;

    /**
     * Controls how the reconnect delay is modified in order to smooth out the distribution of reconnection attempt
     * timepoints for a large set of reconnecting clients.
     */
    retryJitterMode? : RetryJitterType;

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
     * Time interval to wait after sending a PINGREQ for a PINGRESP to arrive.  If one does not arrive, the client will
     * close the current connection.
     */
    pingTimeoutMs? : number;

    /**
     * Time interval to wait after sending a CONNECT request for a CONNACK to arrive.  If one does not arrive, the
     * connection will be shut down.
     */
    connackTimeoutMs? : number;

    /**
     * Time interval to wait for an ack after sending a QoS 1+ PUBLISH, SUBSCRIBE, or UNSUBSCRIBE before
     * failing the operation.
     */
    operationTimeoutSeconds? : number;

    /**
     * All configurable options with respect to the CONNECT packet sent by the client, including the will.  These
     * connect properties will be used for every connection attempt made by the client.
     */
    connectProperties?: ConnectPacket;
}

/**
 * Client Error event handler signature
 */
export type ErrorEventHandler = (error: ICrtError) => void;

/**
 * Client Stopped lifecycle event handler signature
 */
export type StoppedEventHandler = () => void;

/**
 * Client AttemptingConnect lifecycle event handler signature
 */
export type AttemptingConnectEventHandler = () => void;

/**
 * Client ConnectionSuccess lifecycle event handler signature
 */
export type ConnectionSuccessEventHandler = (connack: ConnackPacket, settings: NegotiatedSettings) => void;

/**
 * Client ConnectionFailure lifecycle event handler signature
 */
export type ConnectionFailureEventHandler = (errorCode: number, connack?: ConnackPacket) => void;

/**
 * Client Disconnection lifecycle event handler signature
 */
export type DisconnectionEventHandler = (errorCode: number, disconnect?: DisconnectPacket) => void;

/**
 * Message received event handler signature
 */
export type MessageReceivedEventHandler = (message: PublishPacket) => void;

/**
 * Shared MQTT5 client interface across browser and node
 */
export interface IMqtt5Client {

    /**
     * Emitted when a client method invocation results in an error
     *
     * @param event the type of event (error)
     * @param listener the error event listener to add
     *
     * @event
     */
    on(event: 'error', listener: ErrorEventHandler): this;

    /**
     * Emitted when an MQTT PUBLISH packet is received by the client
     *
     * @param event the type of event (messageReceived)
     * @param listener the messageReceived event listener to add
     *
     * @event
     */
    on(event: 'messageReceived', listener: MessageReceivedEventHandler): this;

    /**
     * Emitted when the client begins a connection attempt
     *
     * @param event the type of event (attemptingConnect)
     * @param listener the attemptingConnect event listener to add
     *
     * @event
     */
    on(event: 'attemptingConnect', listener: AttemptingConnectEventHandler): this;

    /**
     * Emitted when the client successfully establishes an MQTT connection
     *
     * @param event the type of event (connectionSuccess)
     * @param listener the connectionSuccess event listener to add
     *
     * @event
     */
    on(event: 'connectionSuccess', listener: ConnectionSuccessEventHandler): this;

    /**
     * Emitted when the client fails to establish an MQTT connection
     *
     * @param event the type of event (connectionFailure)
     * @param listener the connectionFailure event listener to add
     *
     * @event
     */
    on(event: 'connectionFailure', listener: ConnectionFailureEventHandler): this;

    /**
     * Emitted when the client's current MQTT connection is closed
     *
     * @param event the type of event (disconnection)
     * @param listener the disconnection event listener to add
     *
     * @event
     */
    on(event: 'disconnection', listener: DisconnectionEventHandler): this;

    /**
     * Emitted when the client reaches the 'Stopped' state as a result of the user invoking .stop()
     *
     * @param event the type of event (stopped)
     * @param listener the stopped event listener to add
     *
     * @event
     */
    on(event: 'stopped', listener: StoppedEventHandler): this;


    /**
     * Notifies the MQTT5 client that you want it to attempt to connect to the configured endpoint.
     * The client will attempt to stay connected using the properties of the reconnect-related parameters
     * from the client configuration.
     *
     * This is an asynchronous operation.
     */
    start() : void;

    /**
     * Notifies the MQTT5 client that you want it to transition to the stopped state, disconnecting any existing
     * connection and stopping subsequent reconnect attempts.
     *
     * This is an asynchronous operation.
     *
     * @param packet (optional) properties of a DISCONNECT packet to send as part of the shutdown process
     */
    stop(packet?: DisconnectPacket) : void;

    /**
     * Tells the client to attempt to subscribe to one or more topic filters.
     *
     * @param packet SUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the SUBACK response
     */
    subscribe(packet: SubscribePacket) : Promise<SubackPacket>;

    /**
     * Tells the client to attempt to unsubscribe from one or more topic filters.
     *
     * @param packet UNSUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the UNSUBACK response
     */
    unsubscribe(packet: UnsubscribePacket) : Promise<UnsubackPacket>;

    /**
     * Tells the client to attempt to send a PUBLISH packet
     *
     * @param packet PUBLISH packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the PUBACK response
     */
    publish(packet: PublishPacket) : Promise<PubackPacket>;
}