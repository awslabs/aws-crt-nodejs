/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import * as mqtt5_packet from '../../common/mqtt5_packet';

export enum ProtocolMode {
    Mqtt311,
    Mqtt5
}

export const USER_PROPERTY_PROPERTY_CODE : number = 0x26;
export const SESSION_EXPIRY_INTERVAL_PROPERTY_CODE : number = 0x11;
export const RECEIVE_MAXIMUM_PROPERTY_CODE : number = 0x21;
export const MAXIMUM_PACKET_SIZE_PROPERTY_CODE : number = 0x27;
export const TOPIC_ALIAS_MAXIMUM_PROPERTY_CODE : number = 0x22;
export const REQUEST_RESPONSE_INFORMATION_PROPERTY_CODE : number = 0x19;
export const REQUEST_PROBLEM_INFORMATION_PROPERTY_CODE : number = 0x17;
export const WILL_DELAY_INTERVAL_PROPERTY_CODE : number = 0x18;
export const PAYLOAD_FORMAT_INDICATOR_PROPERTY_CODE : number = 0x01;
export const MESSAGE_EXPIRY_INTERVAL_PROPERTY_CODE : number = 0x02;
export const CONTENT_TYPE_PROPERTY_CODE : number = 0x03;
export const RESPONSE_TOPIC_PROPERTY_CODE : number = 0x08;
export const CORRELATION_DATA_PROPERTY_CODE : number = 0x09;
export const MAXIMUM_QOS_PROPERTY_CODE : number = 0x24;
export const RETAIN_AVAILABLE_PROPERTY_CODE : number = 0x25;
export const ASSIGNED_CLIENT_IDENTIFIER_PROPERTY_CODE : number = 0x12;
export const REASON_STRING_PROPERTY_CODE : number = 0x1F;
export const WILDCARD_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE : number = 0x28;
export const SUBSCRIPTION_IDENTIFIERS_AVAILABLE_PROPERTY_CODE : number = 0x29;
export const SHARED_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE : number = 0x2A;
export const SERVER_KEEP_ALIVE_PROPERTY_CODE : number = 0x13;
export const RESPONSE_INFORMATION_PROPERTY_CODE : number = 0x1A;
export const SERVER_REFERENCE_PROPERTY_CODE : number = 0x1C;
export const AUTHENTICATION_METHOD_PROPERTY_CODE: number = 0x15;
export const AUTHENTICATION_DATA_PROPERTY_CODE: number = 0x16;
export const TOPIC_ALIAS_PROPERTY_CODE : number = 0x23;
export const SUBSCRIPTION_IDENTIFIER_PROPERTY_CODE : number = 0x0B;

export const connect311ProtocolBytes = [0x00, 0x04, 0x4D, 0x51, 0x54, 0x54, 0x04];
export const connect311ProtocolBuffer = new Uint8Array(connect311ProtocolBytes);
export const connect311ProtocolDataView = new DataView(connect311ProtocolBuffer.buffer);
export const connect5ProtocolBytes = [0x00, 0x04, 0x4D, 0x51, 0x54, 0x54, 0x05];
export const connect5ProtocolBuffer = new Uint8Array(connect5ProtocolBytes);
export const connect5ProtocolDataView = new DataView(connect5ProtocolBuffer.buffer);

export const CONNECT_FLAGS_HAS_USERNAME : number = 0x80;
export const CONNECT_FLAGS_HAS_PASSWORD : number = 0x40;
export const CONNECT_FLAGS_HAS_WILL : number = 0x04;
export const CONNECT_FLAGS_QOS_SHIFT : number = 0x03;
export const CONNECT_FLAGS_WILL_RETAIN : number = 0x20;
export const CONNECT_FLAGS_CLEAN_SESSION : number = 0x02;

export const CONNACK_FLAGS_SESSION_PRESENT : number = 0x01;

export const PUBLISH_FLAGS_QOS_SHIFT : number = 0x01;
export const PUBLISH_FLAGS_RETAIN : number = 0x01;
export const PUBLISH_FLAGS_DUPLICATE : number = 0x08;

export const SUBSCRIPTION_FLAGS_NO_LOCAL : number = 0x04;
export const SUBSCRIPTION_FLAGS_RETAIN_AS_PUBLISHED : number = 0x08;
export const SUBSCRIPTION_FLAGS_RETAIN_HANDLING_TYPE_SHIFT : number = 0x04;

export const PACKET_TYPE_FIRST_BYTE_CONNECT : number = 0x10;
export const PACKET_TYPE_FIRST_BYTE_CONNACK : number = 0x20;
export const PACKET_TYPE_FIRST_BYTE_PUBLISH : number = 0x30;
export const PACKET_TYPE_FIRST_BYTE_PUBACK : number = 0x40;
export const PACKET_TYPE_FIRST_BYTE_SUBSCRIBE : number = 0x82;
export const PACKET_TYPE_FIRST_BYTE_SUBACK : number = 0x90;
export const PACKET_TYPE_FIRST_BYTE_UNSUBSCRIBE : number = 0xA2;
export const PACKET_TYPE_FIRST_BYTE_UNSUBACK : number = 0xB0;
export const PACKET_TYPE_FIRST_BYTE_DISCONNECT : number = 0xE0;

export const PACKET_TYPE_PINGREQ_FULL_ENCODING : number = 0xC000;
export const PACKET_TYPE_PINGRESP_FULL_ENCODING : number = 0xD000;
export const PACKET_TYPE_DISCONNECT_FULL_ENCODING_311 : number = 0xE000;

export const QOS_MASK : number = 0x03;
export const RETAIN_HANDLING_TYPE_SHIFT : number = 0x03;

export interface IPacketBinary extends mqtt5_packet.IPacket {

}

export interface UserPropertyBinary {
    name: ArrayBuffer;
    value: ArrayBuffer;
}

export interface PublishPacketBinary extends IPacketBinary {
    packetId: number;

    topicName: ArrayBuffer;

    payload?: ArrayBuffer;

    qos: number;

    duplicate?: number;

    retain?: number;

    payloadFormat?: number;

    messageExpiryIntervalSeconds?: number;

    topicAlias?: number;

    responseTopic?: ArrayBuffer;

    correlationData?: ArrayBuffer;

    subscriptionIdentifiers?: Array<number>;

    contentType?: ArrayBuffer;

    userProperties?: Array<UserPropertyBinary>;
}

export interface PublishPacketInternal extends mqtt5_packet.PublishPacket {
    packetId?: number;

    duplicate: boolean;
}

export interface PubackPacketBinary extends IPacketBinary {
    packetId: number;

    reasonCode: number;

    reasonString?: ArrayBuffer;

    userProperties?: Array<UserPropertyBinary>;
}

export interface PubackPacketInternal extends mqtt5_packet.PubackPacket {
    packetId: number
}

export interface SubscriptionBinary {
    topicFilter: ArrayBuffer;
    qos: number;
    noLocal?: number;
    retainAsPublished?: number;
    retainHandlingType?: number;
}

export interface SubscribePacketBinary extends IPacketBinary {
    packetId: number;

    subscriptions: Array<SubscriptionBinary>;

    subscriptionIdentifier?: number;

    userProperties?: Array<UserPropertyBinary>;
}

export interface SubscribePacketInternal extends mqtt5_packet.SubscribePacket {
    packetId: number
}

export interface SubackPacketBinary extends IPacketBinary {
    packetId: number;

    reasonCodes: Array<number>;

    reasonString?: ArrayBuffer;

    userProperties?: Array<UserPropertyBinary>;
}

export interface SubackPacketInternal extends mqtt5_packet.SubackPacket {
    packetId: number
}

export interface UnsubscribePacketBinary extends IPacketBinary {
    packetId: number;

    topicFilters: Array<ArrayBuffer>;

    userProperties?: Array<UserPropertyBinary>;
}

export interface UnsubscribePacketInternal extends mqtt5_packet.UnsubscribePacket {
    packetId: number
}

export interface UnsubackPacketBinary extends IPacketBinary {
    packetId: number;

    reasonCodes: Array<number>;

    reasonString?: ArrayBuffer;

    userProperties?: Array<UserPropertyBinary>;
}

export interface UnsubackPacketInternal extends mqtt5_packet.UnsubackPacket {
    packetId: number
}

export interface ConnectPacketBinary extends IPacketBinary {
    cleanSession: number;

    keepAliveIntervalSeconds: number;

    clientId?: ArrayBuffer;

    username?: ArrayBuffer;

    password?: ArrayBuffer;

    sessionExpiryIntervalSeconds?: number;

    topicAliasMaximum?: number;

    requestResponseInformation?: number;

    requestProblemInformation?: number;

    receiveMaximum?: number;

    maximumPacketSizeBytes?: number;

    willDelayIntervalSeconds?: number;

    will?: PublishPacketBinary;

    authenticationMethod?: ArrayBuffer;

    authenticationData?: ArrayBuffer;

    userProperties?: Array<UserPropertyBinary>;
}

export interface ConnectPacketInternal extends mqtt5_packet.ConnectPacket {
    cleanStart: boolean;

    topicAliasMaximum?: number;

    authenticationMethod?: string;

    authenticationData?: ArrayBuffer;
}

export interface ConnackPacketBinary extends IPacketBinary {
    sessionPresent: number;

    reasonCode: number;

    sessionExpiryInterval?: number;

    receiveMaximum?: number;

    maximumQos?: number;

    retainAvailable?: number;

    maximumPacketSize?: number;

    assignedClientIdentifier?: ArrayBuffer;

    topicAliasMaximum?: number;

    reasonString?: ArrayBuffer;

    wildcardSubscriptionsAvailable?: number;

    subscriptionIdentifiersAvailable?: number;

    sharedSubscriptionsAvailable?: number;

    serverKeepAlive?: number;

    responseInformation?: ArrayBuffer;

    serverReference?: ArrayBuffer;

    authenticationMethod?: ArrayBuffer;

    authenticationData?: ArrayBuffer;

    userProperties?: Array<UserPropertyBinary>;
}

export interface ConnackPacketInternal extends mqtt5_packet.ConnackPacket {
    authenticationMethod?: string;

    authenticationData?: ArrayBuffer;
}

export interface PingreqPacketBinary extends IPacketBinary {
}

export interface PingreqPacketInternal extends mqtt5_packet.IPacket {
}

export interface PingrespPacketBinary extends IPacketBinary {
}

export interface PingrespPacketInternal extends mqtt5_packet.IPacket {
}

export interface DisconnectPacketBinary extends IPacketBinary {
    reasonCode: number;

    sessionExpiryIntervalSeconds?: number;

    reasonString?: ArrayBuffer;

    serverReference?: ArrayBuffer;

    userProperties?: Array<UserPropertyBinary>;
}

export interface DisconnectPacketInternal extends mqtt5_packet.DisconnectPacket {

}

function binary_data_to_array_buffer(data: BinaryData) : ArrayBuffer {
    if (data instanceof ArrayBuffer) {
        return data;
    } else if (data instanceof Uint8Array) {
        return data.buffer;
    } else if (data instanceof Buffer) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else {
        throw new CrtError("Invalid binary data");
    }
}

function convert_user_properties_to_binary(properties: Array<mqtt5_packet.UserProperty>) : Array<UserPropertyBinary> {
    let encoder = new TextEncoder();
    let internal_properties : Array<UserPropertyBinary> = [];

    for (let property of properties) {
        internal_properties.push({
            name: encoder.encode(property.name).buffer,
            value: encoder.encode(property.value).buffer
        });
    }

    return internal_properties;
}

function convert_connect_packet_to_binary(packet: ConnectPacketInternal) : ConnectPacketBinary {
    let encoder = new TextEncoder();
    let internal_packet : ConnectPacketBinary = {
        type: mqtt5_packet.PacketType.Connect,
        cleanSession: packet.cleanStart ? 1 : 0,
        keepAliveIntervalSeconds: packet.keepAliveIntervalSeconds
    };

    if (packet.clientId != undefined) {
        internal_packet.clientId = encoder.encode(packet.clientId).buffer;
    }

    if (packet.username != undefined) {
        internal_packet.username = encoder.encode(packet.username).buffer;
    }

    if (packet.password != undefined) {
        internal_packet.password = binary_data_to_array_buffer(packet.password);
    }

    if (packet.topicAliasMaximum != undefined) {
        internal_packet.topicAliasMaximum = packet.topicAliasMaximum;
    }

    if (packet.sessionExpiryIntervalSeconds != undefined) {
        internal_packet.sessionExpiryIntervalSeconds = packet.sessionExpiryIntervalSeconds;
    }

    if (packet.requestResponseInformation != undefined) {
        internal_packet.requestResponseInformation = packet.requestResponseInformation ? 1 : 0;
    }

    if (packet.requestProblemInformation != undefined) {
        internal_packet.requestProblemInformation = packet.requestProblemInformation ? 1 : 0;
    }

    if (packet.receiveMaximum != undefined) {
        internal_packet.receiveMaximum = packet.receiveMaximum;
    }

    if (packet.maximumPacketSizeBytes != undefined) {
        internal_packet.maximumPacketSizeBytes = packet.maximumPacketSizeBytes;
    }

    if (packet.willDelayIntervalSeconds != undefined) {
        internal_packet.willDelayIntervalSeconds = packet.willDelayIntervalSeconds;
    }

    if (packet.will) {
        internal_packet.will = convert_publish_packet_to_binary(packet.will as PublishPacketInternal);
    }

    if (packet.authenticationMethod != undefined) {
        internal_packet.authenticationMethod = encoder.encode(packet.authenticationMethod).buffer;
    }

    if (packet.authenticationData != undefined) {
        internal_packet.authenticationData = binary_data_to_array_buffer(packet.authenticationData);
    }

    if (packet.userProperties != undefined) {
        internal_packet.userProperties = convert_user_properties_to_binary(packet.userProperties);
    }

    return internal_packet;
}

function convert_connack_packet_to_binary(packet: ConnackPacketInternal) : ConnackPacketBinary {
    let encoder = new TextEncoder();
    let internal_packet : ConnackPacketBinary = {
        type: mqtt5_packet.PacketType.Connack,
        sessionPresent: packet.sessionPresent ? 1 : 0,
        reasonCode: packet.reasonCode
    };

    if (packet.sessionExpiryInterval != undefined) {
        internal_packet.sessionExpiryInterval = packet.sessionExpiryInterval;
    }

    if (packet.receiveMaximum != undefined) {
        internal_packet.receiveMaximum = packet.receiveMaximum;
    }

    if (packet.maximumQos != undefined) {
        internal_packet.maximumQos = packet.maximumQos;
    }

    if (packet.retainAvailable != undefined) {
        internal_packet.retainAvailable = packet.retainAvailable ? 1 : 0;
    }

    if (packet.maximumPacketSize != undefined) {
        internal_packet.maximumPacketSize = packet.maximumPacketSize;
    }

    if (packet.assignedClientIdentifier != undefined) {
        internal_packet.assignedClientIdentifier = encoder.encode(packet.assignedClientIdentifier).buffer;
    }

    if (packet.topicAliasMaximum != undefined) {
        internal_packet.topicAliasMaximum = packet.topicAliasMaximum;
    }

    if (packet.reasonString != undefined) {
        internal_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.wildcardSubscriptionsAvailable != undefined) {
        internal_packet.wildcardSubscriptionsAvailable = packet.wildcardSubscriptionsAvailable ? 1 : 0;
    }

    if (packet.subscriptionIdentifiersAvailable != undefined) {
        internal_packet.subscriptionIdentifiersAvailable = packet.subscriptionIdentifiersAvailable ? 1 : 0;
    }

    if (packet.sharedSubscriptionsAvailable != undefined) {
        internal_packet.sharedSubscriptionsAvailable = packet.sharedSubscriptionsAvailable ? 1 : 0;
    }

    if (packet.serverKeepAlive != undefined) {
        internal_packet.serverKeepAlive = packet.serverKeepAlive;
    }

    if (packet.responseInformation != undefined) {
        internal_packet.responseInformation = encoder.encode(packet.responseInformation).buffer;
    }

    if (packet.serverReference != undefined) {
        internal_packet.serverReference = encoder.encode(packet.serverReference).buffer;
    }

    if (packet.authenticationMethod != undefined) {
        internal_packet.authenticationMethod = encoder.encode(packet.authenticationMethod).buffer;
    }

    if (packet.authenticationData != undefined) {
        internal_packet.authenticationData = binary_data_to_array_buffer(packet.authenticationData);
    }

    if (packet.userProperties != undefined) {
        internal_packet.userProperties = convert_user_properties_to_binary(packet.userProperties);
    }

    return internal_packet;
}

function payload_to_array_buffer(payload: mqtt5_packet.Payload) : ArrayBuffer {
    if (payload instanceof ArrayBuffer) {
        return payload;
    } else if (payload instanceof Uint8Array) {
        return payload.buffer;
    } else if (payload instanceof Buffer) {
        return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
    } else if (typeof(payload) === 'string') {
        let encoder = new TextEncoder();
        return encoder.encode(payload).buffer;
    } else {
        throw new CrtError("Invalid payload");
    }
}

function convert_publish_packet_to_binary(packet: PublishPacketInternal) : PublishPacketBinary {
    let encoder = new TextEncoder();
    let internal_packet : PublishPacketBinary = {
        type: mqtt5_packet.PacketType.Publish,
        packetId: packet.packetId || 0,
        topicName : encoder.encode(packet.topicName).buffer,
        qos: packet.qos,
        duplicate: packet.duplicate ? 1 : 0,
    };

    if (packet.payload != undefined) {
        internal_packet.payload = payload_to_array_buffer(packet.payload);
    }

    if (packet.retain != undefined) {
        internal_packet.retain = packet.retain ? 1 : 0;
    }

    if (packet.payloadFormat != undefined) {
        internal_packet.payloadFormat = packet.payloadFormat;
    }

    if (packet.messageExpiryIntervalSeconds != undefined) {
        internal_packet.messageExpiryIntervalSeconds = packet.messageExpiryIntervalSeconds;
    }

    if (packet.topicAlias != undefined) {
        internal_packet.topicAlias = packet.topicAlias;
    }

    if (packet.responseTopic != undefined) {
        internal_packet.responseTopic = encoder.encode(packet.responseTopic).buffer;
    }

    if (packet.correlationData != undefined) {
        internal_packet.correlationData = binary_data_to_array_buffer(packet.correlationData);
    }

    if (packet.subscriptionIdentifiers != undefined) {
        internal_packet.subscriptionIdentifiers = packet.subscriptionIdentifiers;
    }

    if (packet.contentType != undefined) {
        internal_packet.contentType = encoder.encode(packet.contentType).buffer;
    }

    if (packet.userProperties != undefined) {
        internal_packet.userProperties = convert_user_properties_to_binary(packet.userProperties);
    }

    return internal_packet;
}

function convert_puback_packet_to_binary(packet: PubackPacketInternal) : PubackPacketBinary {
    let encoder = new TextEncoder();
    let internal_packet : PubackPacketBinary = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: packet.packetId,
        reasonCode: packet.reasonCode
    };

    if (packet.reasonString != undefined) {
        internal_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.userProperties != undefined) {
        internal_packet.userProperties = convert_user_properties_to_binary(packet.userProperties);
    }

    return internal_packet;
}

function convert_subscription_to_binary(subscription: mqtt5_packet.Subscription) : SubscriptionBinary {
    let encoder = new TextEncoder();

    let internal_subscription : SubscriptionBinary = {
        topicFilter: encoder.encode(subscription.topicFilter).buffer,
        qos: subscription.qos
    };

    if (subscription.noLocal != undefined) {
        internal_subscription.noLocal = subscription.noLocal ? 1 : 0;
    }

    if (subscription.retainAsPublished != undefined) {
        internal_subscription.retainAsPublished = subscription.retainAsPublished ? 1 : 0;
    }

    if (subscription.retainHandlingType != undefined) {
        internal_subscription.retainHandlingType = subscription.retainHandlingType;
    }

    return internal_subscription;
}

function convert_subscribe_packet_to_binary(packet: SubscribePacketInternal) : SubscribePacketBinary {
    let internal_packet : SubscribePacketBinary = {
        type: mqtt5_packet.PacketType.Subscribe,
        packetId: packet.packetId,
        subscriptions: []
    };

    for (let subscription of packet.subscriptions) {
        internal_packet.subscriptions.push(convert_subscription_to_binary(subscription));
    }

    if (packet.subscriptionIdentifier != undefined) {
        internal_packet.subscriptionIdentifier = packet.subscriptionIdentifier;
    }

    if (packet.userProperties != undefined) {
        internal_packet.userProperties = convert_user_properties_to_binary(packet.userProperties);
    }

    return internal_packet;
}

function convert_suback_packet_to_binary(packet: SubackPacketInternal) : SubackPacketBinary {
    let encoder = new TextEncoder();
    let internal_packet: SubackPacketBinary = {
        type: mqtt5_packet.PacketType.Suback,
        packetId: packet.packetId,
        reasonCodes: packet.reasonCodes
    };

    if (packet.reasonString != undefined) {
        internal_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.userProperties != undefined) {
        internal_packet.userProperties = convert_user_properties_to_binary(packet.userProperties);
    }

    return internal_packet;
}

function convert_unsubscribe_packet_to_binary(packet: UnsubscribePacketInternal) : UnsubscribePacketBinary {
    let encoder = new TextEncoder();
    let internal_packet: UnsubscribePacketBinary = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        packetId: packet.packetId,
        topicFilters: []
    };

    for (let topicFilter of packet.topicFilters) {
        internal_packet.topicFilters.push(encoder.encode(topicFilter).buffer);
    }

    if (packet.userProperties != undefined) {
        internal_packet.userProperties = convert_user_properties_to_binary(packet.userProperties);
    }

    return internal_packet;
}

function convert_unsuback_packet_to_binary(packet: UnsubackPacketInternal) : UnsubackPacketBinary {
    let encoder = new TextEncoder();
    let internal_packet: UnsubackPacketBinary = {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: packet.packetId,
        reasonCodes: packet.reasonCodes
    };

    if (packet.reasonString != undefined) {
        internal_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.userProperties != undefined) {
        internal_packet.userProperties = convert_user_properties_to_binary(packet.userProperties);
    }

    return internal_packet;
}

function convert_disconnect_packet_to_binary(packet: DisconnectPacketInternal) : DisconnectPacketBinary {
    let encoder = new TextEncoder();
    let internal_packet : DisconnectPacketBinary = {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: packet.reasonCode
    };

    if (packet.sessionExpiryIntervalSeconds != undefined) {
        internal_packet.sessionExpiryIntervalSeconds = packet.sessionExpiryIntervalSeconds;
    }

    if (packet.serverReference != undefined) {
        internal_packet.serverReference = encoder.encode(packet.serverReference).buffer;
    }

    if (packet.reasonString != undefined) {
        internal_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.userProperties != undefined) {
        internal_packet.userProperties = convert_user_properties_to_binary(packet.userProperties);
    }

    return internal_packet;
}

// TODO: take protocol level and modify -> 311 encoding for reason codes

export function convert_packet_to_binary(packet: mqtt5_packet.IPacket) : IPacketBinary {
    if (!packet.type) {
        throw new CrtError("Invalid packet type");
    }

    switch(packet.type) {
        case mqtt5_packet.PacketType.Connect:
            return convert_connect_packet_to_binary(packet as ConnectPacketInternal);
        case mqtt5_packet.PacketType.Connack:
            return convert_connack_packet_to_binary(packet as ConnackPacketInternal);
        case mqtt5_packet.PacketType.Publish:
            return convert_publish_packet_to_binary(packet as PublishPacketInternal);
        case mqtt5_packet.PacketType.Puback:
            return convert_puback_packet_to_binary(packet as PubackPacketInternal);
        case mqtt5_packet.PacketType.Subscribe:
            return convert_subscribe_packet_to_binary(packet as SubscribePacketInternal);
        case mqtt5_packet.PacketType.Suback:
            return convert_suback_packet_to_binary(packet as SubackPacketInternal);
        case mqtt5_packet.PacketType.Unsubscribe:
            return convert_unsubscribe_packet_to_binary(packet as UnsubscribePacketInternal);
        case mqtt5_packet.PacketType.Unsuback:
            return convert_unsuback_packet_to_binary(packet as UnsubackPacketInternal);
        case mqtt5_packet.PacketType.Disconnect:
            return convert_disconnect_packet_to_binary(packet as DisconnectPacketInternal);
        case mqtt5_packet.PacketType.Pingreq:
            return {
                type: mqtt5_packet.PacketType.Pingreq
            };
        case mqtt5_packet.PacketType.Pingresp:
            return {
                type: mqtt5_packet.PacketType.Pingresp
            };
        default:
            throw new CrtError("Unsupported packet type: ");
    }
}

// TODO: convert from internal that handles reason code differences appropriately (or maybe doesn't need to)