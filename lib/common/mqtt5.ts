/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt5
 */

import * as mqtt5_packet from "./mqtt5_packet";
import { ICrtError } from "./error";

/**
 * Mqtt behavior settings that are dynamically negotiated as part of the CONNECT/CONNACK exchange.
 *
 * While you can infer all of these values from a combination of
 *   1. defaults as specified in the mqtt5 spec
 *   1. your CONNECT settings
 *   1. the CONNACK from the broker
 *
 * the client instead does the combining for you and emits a NegotiatedSettings object with final, authoritative values.
 *
 * Negotiated settings are communicated with every successful connection establishment.
 */
export interface NegotiatedSettings {

    /**
     * The maximum QoS allowed for publishes on this connection instance
     */
    maximumQos: mqtt5_packet.QoS;

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
    retainAvailable: boolean;

    /**
     * Whether the server supports wildcard subscriptions.
     */
    wildcardSubscriptionsAvailable: boolean;

    /**
     * Whether the server supports subscription identifiers
     */
    subscriptionIdentifiersAvailable: boolean;

    /**
     * Whether the server supports shared subscriptions
     */
    sharedSubscriptionsAvailable: boolean;

    /**
     * Whether the client has rejoined an existing session.
     */
    rejoinedSession: boolean;

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

    /** Maps to Clean */
    Default = 0,

    /**
     * Always ask for a clean session when connecting
     */
    Clean = 1,

    /**
     * Always attempt to rejoin an existing session after an initial connection success.
     *
     * Session rejoin requires an appropriate non-zero session expiry interval in the client's CONNECT options.
     */
    RejoinPostSuccess = 2,
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

/**
 * Client Error event listener signature
 */
export type ErrorEventListener = (error: ICrtError) => void;

/**
 * Client Stopped lifecycle event listener signature
 */
export type StoppedEventListener = () => void;

/**
 * Client AttemptingConnect lifecycle event listener signature
 */
export type AttemptingConnectEventListener = () => void;

/**
 * Client ConnectionSuccess lifecycle event listener signature
 */
export type ConnectionSuccessEventListener = (connack: mqtt5_packet.ConnackPacket, settings: NegotiatedSettings) => void;

/**
 * Client ConnectionFailure lifecycle event listener signature
 */
export type ConnectionFailureEventListener = (error: ICrtError, connack?: mqtt5_packet.ConnackPacket) => void;

/**
 * Client Disconnection lifecycle event listener signature
 */
export type DisconnectionEventListener = (error: ICrtError, disconnect?: mqtt5_packet.DisconnectPacket) => void;

/**
 * Message received event listener signature
 */
export type MessageReceivedEventListener = (message: mqtt5_packet.PublishPacket) => void;

/**
 * Polymorphic success result for publish actions:
 *
 * * QoS 0 - resolves to undefined
 * * QoS 1 - resolves to a {@link PubackPacket}
 * * QoS 2 - (not yet supported) would resolve to a Pubcomp
 */
export type PublishCompletionResult = mqtt5_packet.PubackPacket | undefined;

/**
 * Shared MQTT5 client interface across browser and node.
 */
export interface IMqtt5Client {

    /**
     * Notifies the MQTT5 client that you want it to maintain connectivity to the configured endpoint.
     * The client will attempt to stay connected using the properties of the reconnect-related parameters
     * in the mqtt5 client configuration.
     *
     * This is an asynchronous operation.
     */
    start() : void;

    /**
     * Notifies the MQTT5 client that you want it to end connectivity to the configured endpoint, disconnecting any
     * existing connection and halting reconnection attempts.
     *
     * This is an asynchronous operation.  Once the process completes, no further events will be emitted until the client
     * has {@link start} invoked.
     *
     * @param disconnectPacket (optional) properties of a DISCONNECT packet to send as part of the shutdown process
     */
    stop(packet?: mqtt5_packet.DisconnectPacket) : void;

    /**
     * Subscribe to one or more topic filters by queuing a SUBSCRIBE packet to be sent to the server.
     *
     * @param packet SUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the SUBACK response
     */
    subscribe(packet: mqtt5_packet.SubscribePacket) : Promise<mqtt5_packet.SubackPacket>;

    /**
     * Unsubscribe from one or more topic filters by queuing an UNSUBSCRIBE packet to be sent to the server.
     *
     * @param packet UNSUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the UNSUBACK response
     */
    unsubscribe(packet: mqtt5_packet.UnsubscribePacket) : Promise<mqtt5_packet.UnsubackPacket>;

    /**
     * Send a message to subscribing clients by queuing a PUBLISH packet to be sent to the server.
     *
     * @param packet PUBLISH packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the PUBACK response
     */
    publish(packet: mqtt5_packet.PublishPacket) : Promise<PublishCompletionResult>;
}
