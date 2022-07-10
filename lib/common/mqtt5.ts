/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt
 */

import {
    ConnackPacket,
    DisconnectPacket, PubackPacket,
    PublishPacket, SubackPacket,
    SubscribePacket, UnsubackPacket, UnsubscribePacket, QoS
} from "./mqtt5_packet";

/**
 * Mqtt behavior settings that are dynamically negotiated as part of the CONNECT/CONNACK exchange.
 *
 * While you can infer all of these values from a combination of
 *   (1) the mqtt5 spec
 *   (2) your CONNECT settings
 *   (3) the CONNACK from the broker
 *
 * the client does all the combining for you and gives something with defined, authoritative values.
 *
 * Negotiated settings are communicated with every successful connection establishment.
 */
export interface NegotiatedSettings {

    /**
     * The maximum QoS allowed for publishes on this connection instance
     */
    maximumQos: QoS;

    /**
     * the amount of time in seconds the server will retain the MQTT session after a disconnect.
     */
    sessionExpiryInterval: number;

    /**
     * the number of QoS 1 and QoS2 publications the server is willing to process concurrently.
     */
    receiveMaximumFromServer: number;

    /**
     * the maximum packet size the server is willing to accept.
     */
    maximumPacketSizeToServer: number;

    /**
     * the amount of time in seconds before the server will disconnect the client for inactivity.
     */
    serverKeepAlive: number;

    /**
     * whether the server supports retained messages.
     */
    retainAvailable: Boolean;

    /**
     * whether the server supports wildcard subscriptions.
     */
    wildcardSubscriptionsAvailable: Boolean;

    /**
     * whether the server supports subscription identifiers
     */
    subscriptionIdentifiersAvailable: Boolean;

    /**
     * whether the server supports shared subscriptions
     */
    sharedSubscriptionsAvailable: Boolean;

    /**
     * whether the client has rejoined an existing session.
     */
    rejoinedSession: Boolean;

    /**
     * The final client id in use by the newly-established connection.  This will be the configured client id if one
     * was given in the configuration, otherwise, if no client id was specified, this will be the client id assigned
     * by the server.  Reconnection attempts will always use the auto-assigned client id, allowing for session
     * resumption in that case.
     */
    clientId: string;
}

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
 * Shared Mqtt5 client interface across browser and node
 */
export interface IMqtt5Client {

    /**
     * Emitted when an mqtt PUBLISH packet is received by the client
     *
     * @param event the type of event (messageReceived)
     * @param listener the messageReceived event listener to add
     *
     * @event
     */
    on(event: 'messageReceived', listener: MessageReceivedEventHandler): this;

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
     * Emitted when the client begins a connection attempt
     *
     * @param event the type of event (attemptingConnect)
     * @param listener the attemptingConnect event listener to add
     *
     * @event
     */
    on(event: 'attemptingConnect', listener: AttemptingConnectEventHandler): this;

    /**
     * Emitted when the client successfully establishes an mqtt connection
     *
     * @param event the type of event (connectionSuccess)
     * @param listener the connectionSuccess event listener to add
     *
     * @event
     */
    on(event: 'connectionSuccess', listener: ConnectionSuccessEventHandler): this;

    /**
     * Emitted when the client fails to establish an mqtt connection
     *
     * @param event the type of event (connectionFailure)
     * @param listener the connectionFailure event listener to add
     *
     * @event
     */
    on(event: 'connectionFailure', listener: ConnectionFailureEventHandler): this;

    /**
     * Emitted when the client's current mqtt connection is shut down
     *
     * @param event the type of event (disconnection)
     * @param listener the disconnection event listener to add
     *
     * @event
     */
    on(event: 'disconnection', listener: DisconnectionEventHandler): this;

    /**
     * Notifies the mqtt5 client that you want it to attempt to connect to the configured endpoint.
     * The client will attempt to stay connected using the properties of the reconnect-related parameters
     * from the client configuration.
     */
    start() : void;

    /**
     * Notifies the mqtt5 client that you want it to transition to the stopped state, disconnecting any existing
     * connection and ceasing subsequent reconnect attempts.
     *
     * @param disconnectPacket (optional) properties of a DISCONNECT packet to send as part of the shutdown process
     */
    stop(disconnectPacket?: DisconnectPacket) : void;

    /**
     * Tells the client to attempt to subscribe to one or more topic filters.
     *
     * @param packet configuration of the SUBSCRIBE packet to send to the broker
     */
    subscribe(packet: SubscribePacket) : Promise<SubackPacket>;

    /**
     * Tells the client to attempt to unsubscribe from one or more topic filters.
     *
     * @param packet configuration of the UNSUBSCRIBE packet to send to the broker
     */
    unsubscribe(packet: UnsubscribePacket) : Promise<UnsubackPacket>;

    /**
     * Tells the client to attempt to send a PUBLISH packet
     *
     * @param packet configuration of the PUBLISH packet to send to the broker
     */
    publish(packet: PublishPacket) : Promise<PubackPacket>;
}