/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt
 */

export interface AwsMqtt5UserProperty {
    name: string;
    value: string;
}

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

export enum AwsMqtt5PayloadFormatIndicator {
    Bytes = 0,
    Utf8 = 1,
};

export type AwsMqtt5Payload = string | Record<string, unknown> | ArrayBuffer | ArrayBufferView;
export type AwsMqtt5BinaryData = string | ArrayBuffer | ArrayBufferView;

export enum AwsMqtt5QoS {

    AtMostOnce = 0,

    AtLeastOnce = 1,

    ExactlyOnce = 2,
};

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

export interface AwsMqtt5PacketConnect {
    keepAliveIntervalSeconds: number;

    clientId?: string;

    username?: string;
    password?: AwsMqtt5BinaryData;

    cleanStart?: Boolean;

    sessionExpiryIntervalSeconds?: number;

    requestResponseInformation?: Boolean;
    requestProblemInformation?: Boolean;

    receiveMaximum?: number;
    topicAliasMaximum?: number;
    maximumPacketSizeBytes?: number;

    willDelayIntervalSeconds?: number;
    will?: AwsMqtt5PacketPublish;

    userProperties?: Array<AwsMqtt5UserProperty>;
}

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

    wildcard_subscriptions_available?: Boolean;
    subscription_identifiers_available?: Boolean;
    shared_subscriptions_available?: Boolean;

    serverKeepAlive?: number;
    response_information?: string;
    server_reference?: string;
}

export interface AwsMqtt5PacketDisconnect {
    reasonCode: AwsMqtt5DisconnectReasonCode;

    sessionExpiryIntervalSeconds?: number;

    reasonString?: string;

    userProperties?: Array<AwsMqtt5UserProperty>;

    serverReference?: string;
}
