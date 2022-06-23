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
 * Reason code inside SUBACK packet payloads.
 * Enum values match mqtt spec encoding values.
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901178
 */
export enum AwsMqtt5SubackReasonCode {
    GrantedQoS0 = 0,
    GrantedQoS1 = 1,
    GrantedQoS2 = 2,
    UnspecifiedError = 128,
    ImplementationSpecificError = 131,
    NotAuthorized = 135,
    TopicFilterInvalid = 143,
    PacketIdentifierInUse = 145,
    QuotaExceeded = 151,
    SharedSubscriptionsNotSupported = 158,
    SubscriptionIdentifiersNotSupported = 161,
    WildcardSubscriptionsNotSupported = 162,
}

/**
 * Reason code inside UNSUBACK packet payloads.
 * Enum values match mqtt spec encoding values.
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901194
 */
export enum AwsMqtt5UnsubackReasonCode {
    Success = 0,
    NoSubscriptionExisted = 17,
    UnspecifiedError = 128,
    ImplementationSpecificError = 131,
    NotAuthorized = 135,
    TopicFilterInvalid = 143,
    PacketIdentifierInUse = 145,
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
}

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
}

/**
 * Configures how retained messages should be handled when subscribing with a topic filter that matches topics with
 * associated retained messages.
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901169
 */
export enum AwsMqtt5RetainHandlingType {

    /**
     * Server should send all retained messages on topics that match the subscription's filter.
     */
    SendOnSubscribe = 0x00,

    /**
     * Server should send all retained messages on topics that match the subscription's filter, where this is the
     * first (relative to connection) subscription filter that matches the topic with a retained message.
     */
    SendOnSubscribeIfNew = 0x01,

    /**
     * Subscribe must not trigger any retained message publishes from the server.
     */
    DontSend = 0x02,
}

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
 *
 * The client configuration includes the connect properties that should be used for every connection attempt
 * made by the client.
 */
export interface AwsMqtt5PacketConnect {
    keepAliveIntervalSeconds: number;

    /**
     * If left empty, the broker will auto-assign a unique client id.  When reconnecting, the mqtt5 client will
     * always use the original auto-assigned client id.
     */
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

/**
 * Configures a single subscription within a Subscribe operation
 */
export interface AwsMqtt5Subscription {
    /**
     * Topic filter to subscribe to
     */
    topicFilter : string;

    /**
     * Maximum QOS that the subscriber will accept messages for.  Negotiated QoS may be different.
     */
    qos : AwsMqtt5QoS;

    /**
     * Should the server not send publishes to a client when that client was the one who sent the publish?
     */
    noLocal? : Boolean;

    /**
     * Should messages sent due to this subscription keep the retain flag preserved on the message?
     */
    retainAsPublished?: Boolean;

    /**
     * Should retained messages on matching topics be sent in reaction to this subscription?
     */
    retainHandlingType?: AwsMqtt5RetainHandlingType;
}

/**
 * Typescript interface for an MQTT5 SUBSCRIBE packet
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901161
 */
export interface AwsMqtt5PacketSubscribe {
    subscriptions?: Array<AwsMqtt5Subscription>;

    subscriptionIdentifier?: number;

    userProperties?: Array<AwsMqtt5UserProperty>;
}

/**
 * Typescript interface for an MQTT5 SUBACK packet.
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901171
 */
export interface AwsMqtt5PacketSuback {
    reasonString?: string;

    userProperties?: Array<AwsMqtt5UserProperty>;

    reasonCodes: Array<AwsMqtt5SubackReasonCode>;
}

/**
 * Typescript interface for an MQTT5 UNSUBSCRIBE packet
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901179
 */
export interface AwsMqtt5PacketUnsubscribe {
    topicFilters: Array<string>;

    userProperties?: Array<AwsMqtt5UserProperty>;
}

/**
 * Typescript interface for an MQTT5 UNSUBACK packet
 *
 * https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901187
 */
export interface AwsMqtt5PacketUnsuback {

    reasonString?: string;

    userProperties?: Array<AwsMqtt5UserProperty>;

    reasonCodes: Array<AwsMqtt5UnsubackReasonCode>;
}
