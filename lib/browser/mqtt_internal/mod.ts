/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from "../../common/mqtt5_packet"

export interface PublishOptions {
    timeoutInMillis? : number
}

export enum PublishResultType {
    Qos0,
    Qos1,
}

export interface PublishResult {
    type: PublishResultType,
    packet?: mqtt5_packet.PubackPacket,
}

export interface SubscribeOptions {
    timeoutInMillis? : number
}

export interface UnsubscribeOptions {
    timeoutInMillis? : number
}

/**
 * Controls how the client will attempt to use MQTT sessions.
 */
export enum ResumeSessionPolicyType {

    /** User clean start true until a successful connection is established.  Afterwards, always attempt to rejoin a session */
    PostSuccess = 0,

    /** Never rejoin a session.  Clean start is always true. */
    Never = 1,

    /** Always try to rejoin a session.  Clean start is always false.  This setting is technically not spec-compliant */
    Always = 2,

    Default = 0,
}

export type ConnectPacketTransformer = (packet: mqtt5_packet.ConnectPacket) => void;

export interface ConnectOptions {
    connectPacketTransformer? : ConnectPacketTransformer,
    keepAliveIntervalSeconds: number;
    resumeSessionPolicy?: ResumeSessionPolicyType,
    clientId?: string;
    username?: string;
    password?: BinaryData;
    sessionExpiryIntervalSeconds?: number;
    requestResponseInformation?: boolean;
    requestProblemInformation?: boolean;
    receiveMaximum?: number;
    maximumPacketSizeBytes?: number;
    willDelayIntervalSeconds?: number;
    will?: mqtt5_packet.PublishPacket;
    userProperties?: Array<mqtt5_packet.UserProperty>;
}

/**
 * Controls how disconnects affect the queued and in-progress operations tracked by the client.  Also controls
 * how operations are handled while the client is not connected.  In particular, if the client is not connected,
 * then any operation that would be failed on disconnect (according to these rules) will be rejected.
 *
 * A deliberate mirror of the native ClientOperationQueueBehavior enum
 */
export enum OfflineQueuePolicy {

    /** Operations are never failed due to connection state */
    PreserveAll = 0,

    /** Qos0 Publishes are failed when there is no connection, all other operations are left alone. */
    PreserveAcknowledged,

    /** Only QoS1 and QoS2 publishes are retained when there is no connection */
    PreserveQos1PlusPublishes,

    /** Nothing is retained when there is no connection */
    PreserveNothing,

    /** Keep everything by default */
    Default = 0,
}
