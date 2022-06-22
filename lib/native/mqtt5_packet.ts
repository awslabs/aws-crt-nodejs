/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt
 */

/**
 * Typescript interface for MQTT5 user properties
 */
export interface AwsMqtt5UserProperty {
    name: string;
    value: string;
}

/**
 * Server return code for CONNECT attempts.
 * Enum values match MQTT5 spec encoding values.
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901079
 */
export enum AwsMqtt5ConnectReasonCode {
    Success = 0,
    UnspecifiedError = 128,
    MalformedPacket = 129,
    ProtocolError = 130,
    ImplementationSpecificError = 131,
    UnsupportedProtocolVersion = 132,
    ClientIdentifierNotValid = 133,
    BadUsernameOrPassword = 134,
    NotAuthorized = 135,
    ServerUnavailable = 136,
    ServerBusy = 137,
    Banned = 138,
    BadAuthenticationMethod = 140,
    TopicNameInvalid = 144,
    PacketTooLarge = 149,
    QuotaExceeded = 151,
    PayloadFormatInvalid = 153,
    RetainNotSupported = 154,
    QosNotSupported = 155,
    UseAnotherServer = 156,
    ServerMoved = 157,
    ConnectionRateExceeded = 159,
}

/**
 * Reason code inside DISCONNECT packets.
 * Enum values match MQTT5 spec encoding values.
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901208
 */
export enum AwsMqtt5DisconnectReasonCode {
    NormalDisconnection = 0,
    DisconnectWithWillMessage = 4,
    UnspecifiedError = 128,
    MalformedPacket = 129,
    ProtocolError = 130,
    ImplementationSpecificError = 131,
    NotAuthorized = 135,
    ServerBusy = 137,
    ServerShuttingDown = 139,
    KeepAliveTimeout = 141,
    SessionTakenOver = 142,
    TopicFilterInvalid = 143,
    TopicNameInvalid = 144,
    ReceiveMaximumExceeded = 147,
    TopicAliasInvalid = 148,
    PacketTooLarge = 149,
    MessageRateTooHigh = 150,
    QuotaExceeded = 151,
    AdministrativeAction = 152,
    PayloadFormatInvalid = 153,
    RetainNotSupported = 154,
    QosNotSupported = 155,
    UseAnotherServer = 156,
    ServerMoved = 157,
    SharedSubscriptionsNotSupported = 158,
    ConnectionRateExceeded = 159,
    MaximumConnectTime = 160,
    SubscriptionIdentifiersNotSupported = 161,
    WildcardSubscriptionsNotSupported = 162,
}

/**
 * Optional property describing a PUBLISH payload's format.
 * Enum values match MQTT5 spec encoding values.
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901063
 */
export enum AwsMqtt5PayloadFormatIndicator {
    Bytes = 0,
    Utf8 = 1,
};

/**
 * Valid types for a PUBLISH packet's payload
 */
export type AwsMqtt5Payload = string | Record<string, unknown> | ArrayBuffer | ArrayBufferView;

/**
 * Valid types for MQTT5 packet binary data fields (other than PUBLISH payload)
 */
export type AwsMqtt5BinaryData = string | ArrayBuffer | ArrayBufferView;

/**
 * MQTT Message delivery quality of service.
 * Enum values match MQTT5 spec encoding values.
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901234
 */
export enum AwsMqtt5QoS {

    AtMostOnce = 0,

    AtLeastOnce = 1,

    ExactlyOnce = 2,
};

/**
 * Typescript interface for an MQTT5 PUBLISH packet
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901100
 */
export interface AwsMqtt5PacketPublish {
    topic: string;
    payload: AwsMqtt5Payload;

    qos: AwsMqtt5QoS;

    retain?: Boolean;

    payloadFormat?: AwsMqtt5PayloadFormatIndicator;

    messageExpiryIntervalSeconds?: number;

    responseTopic?: string;
    correlationData?: AwsMqtt5BinaryData;

    subscriptionIdentifiers?: Array<number>;

    contentType?: string;

    userProperties?: Array<AwsMqtt5UserProperty>;
}

/**
 * Typescript interface for an MQTT5 CONNECT packet.
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901033
 */
export interface AwsMqtt5PacketConnect {
    keepAliveIntervalSeconds: number;

    clientId?: string;

    username?: string;
    password?: AwsMqtt5BinaryData;

    sessionExpiryIntervalSeconds?: number;

    requestResponseInformation?: Boolean;
    requestProblemInformation?: Boolean;

    receiveMaximum?: number;
    maximumPacketSizeBytes?: number;

    willDelayIntervalSeconds?: number;
    will?: AwsMqtt5PacketPublish;

    userProperties?: Array<AwsMqtt5UserProperty>;
}

/**
 * Typescript interface for an MQTT5 CONNACK packet.
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901074
 */
export interface AwsMqtt5PacketConnack {
    sessionPresent : Boolean;
    reasonCode : AwsMqtt5ConnectReasonCode;

    sessionExpiryInterval?: number;
    receiveMaximum?: number;
    maximumQos?: AwsMqtt5QoS;
    retainAvailable?: Boolean;
    maximumPacketSize?: number;
    assignedClientIdentifier?: string;
    topicAliasMaximum?: number;
    reasonString?: string;

    userProperties?: Array<AwsMqtt5UserProperty>;

    wildcardSubscriptionsAvailable?: Boolean;
    subscriptionIdentifiersAvailable?: Boolean;
    sharedSubscriptionsAvailable?: Boolean;

    serverKeepAlive?: number;
    responseInformation?: string;
    serverReference?: string;
}

/**
 * Typescript interface for an MQTT5 DISCONNECT packet.
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901205
 */
export interface AwsMqtt5PacketDisconnect {
    reasonCode: AwsMqtt5DisconnectReasonCode;

    sessionExpiryIntervalSeconds?: number;

    reasonString?: string;

    userProperties?: Array<AwsMqtt5UserProperty>;

    serverReference?: string;
}
