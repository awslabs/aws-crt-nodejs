/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import * as mqtt5_packet from '../../common/mqtt5_packet';

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

export const PUBLISH_FLAGS_QOS_SHIFT : number = 0x01;
export const PUBLISH_FLAGS_RETAIN : number = 0x01;
export const PUBLISH_FLAGS_DUPLICATE : number = 0x08;

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

export interface IPacketInternal extends mqtt5_packet.IPacket {

}

export interface UserPropertyInternal {
    name: ArrayBuffer;
    value: ArrayBuffer;
}

export interface PublishPacketInternal extends IPacketInternal {
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

    userProperties?: Array<UserPropertyInternal>;
}

export interface PubackPacketInternal extends IPacketInternal {
    packetId: number;

    reasonCode: number;

    reasonString?: ArrayBuffer;

    userProperties?: Array<UserPropertyInternal>;
}

export interface SubscriptionInternal {
    topicFilter: ArrayBuffer;
    qos: number;
    noLocal?: number;
    retainAsPublished?: number;
    retainHandlingType?: number;
}

export interface SubscribePacketInternal extends IPacketInternal {
    packetId: number;

    subscriptions: Array<SubscriptionInternal>;

    subscriptionIdentifier?: number;

    userProperties?: Array<UserPropertyInternal>;
}

export interface SubackPacketInternal extends IPacketInternal {
    packetId: number;

    reasonCodes: Array<number>;

    reasonString?: ArrayBuffer;

    userProperties?: Array<UserPropertyInternal>;
}

export interface UnsubscribePacketInternal extends IPacketInternal {
    packetId: number;

    topicFilters: Array<ArrayBuffer>;

    userProperties?: Array<UserPropertyInternal>;
}

export interface UnsubackPacketInternal extends IPacketInternal {
    packetId: number;

    reasonCodes: Array<number>;

    reasonString?: ArrayBuffer;

    userProperties?: Array<UserPropertyInternal>;
}

export interface ConnectPacketInternal extends IPacketInternal {
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

    will?: PublishPacketInternal;

    userProperties?: Array<UserPropertyInternal>;
}

export interface ConnackPacketInternal extends IPacketInternal {
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

    userProperties?: Array<UserPropertyInternal>;
}

export interface PingreqPacketInternal extends IPacketInternal {
}

export interface PingrespPacketInternal extends IPacketInternal {
}

export interface DisconnectPacketInternal extends IPacketInternal {
    reasonCode: number;

    sessionExpiryIntervalSeconds?: number;

    reasonString?: ArrayBuffer;

    serverReference?: ArrayBuffer;

    userProperties?: Array<UserPropertyInternal>;
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

function convert_user_properties_to_internal(properties: Array<mqtt5_packet.UserProperty>) : Array<UserPropertyInternal> {
    let encoder = new TextEncoder();
    let internal_properties : Array<UserPropertyInternal> = [];

    for (let property of properties) {
        internal_properties.push({
            name: encoder.encode(property.name).buffer,
            value: encoder.encode(property.value).buffer
        });
    }

    return internal_properties;
}

function convert_connect_packet_to_internal(packet: mqtt5_packet.ConnectPacket) : ConnectPacketInternal {
    let encoder = new TextEncoder();
    let internal_packet : ConnectPacketInternal = {
        type: mqtt5_packet.PacketType.Connect,
        cleanSession: 0, // set manually later by the client based on configuration
        keepAliveIntervalSeconds: packet.keepAliveIntervalSeconds
    };

    if (packet.clientId) {
        internal_packet.clientId = encoder.encode(packet.clientId).buffer;
    }

    if (packet.username) {
        internal_packet.username = encoder.encode(packet.username).buffer;
    }

    if (packet.password) {
        internal_packet.password = binary_data_to_array_buffer(packet.password);
    }

    if (packet.sessionExpiryIntervalSeconds) {
        internal_packet.sessionExpiryIntervalSeconds = packet.sessionExpiryIntervalSeconds;
    }

    if (packet.requestResponseInformation) {
        internal_packet.requestResponseInformation = packet.requestResponseInformation ? 1 : 0;
    }

    if (packet.requestProblemInformation) {
        internal_packet.requestProblemInformation = packet.requestProblemInformation ? 1 : 0;
    }

    if (packet.receiveMaximum) {
        internal_packet.receiveMaximum = packet.receiveMaximum;
    }

    if (packet.maximumPacketSizeBytes) {
        internal_packet.maximumPacketSizeBytes = packet.maximumPacketSizeBytes;
    }

    if (packet.willDelayIntervalSeconds) {
        internal_packet.willDelayIntervalSeconds = packet.willDelayIntervalSeconds;
    }

    if (packet.will) {
        internal_packet.will = convert_publish_packet_to_internal(packet.will);
    }

    if (packet.userProperties) {
        internal_packet.userProperties = convert_user_properties_to_internal(packet.userProperties);
    }

    return internal_packet;
}

function convert_connack_packet_to_internal(packet: mqtt5_packet.ConnackPacket) : ConnackPacketInternal {
    let encoder = new TextEncoder();
    let internal_packet : ConnackPacketInternal = {
        type: mqtt5_packet.PacketType.Connack,
        sessionPresent: packet.sessionPresent ? 1 : 0,
        reasonCode: packet.reasonCode
    };

    if (packet.sessionExpiryInterval) {
        internal_packet.sessionExpiryInterval = packet.sessionExpiryInterval;
    }

    if (packet.receiveMaximum) {
        internal_packet.receiveMaximum = packet.receiveMaximum;
    }

    if (packet.maximumQos) {
        internal_packet.maximumQos = packet.maximumQos;
    }

    if (packet.retainAvailable) {
        internal_packet.retainAvailable = packet.retainAvailable ? 1 : 0;
    }

    if (packet.maximumPacketSize) {
        internal_packet.maximumPacketSize = packet.maximumPacketSize;
    }

    if (packet.assignedClientIdentifier) {
        internal_packet.assignedClientIdentifier = encoder.encode(packet.assignedClientIdentifier).buffer;
    }

    if (packet.topicAliasMaximum) {
        internal_packet.topicAliasMaximum = packet.topicAliasMaximum;
    }

    if (packet.reasonString) {
        internal_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.wildcardSubscriptionsAvailable) {
        internal_packet.wildcardSubscriptionsAvailable = packet.wildcardSubscriptionsAvailable ? 1 : 0;
    }

    if (packet.subscriptionIdentifiersAvailable) {
        internal_packet.subscriptionIdentifiersAvailable = packet.subscriptionIdentifiersAvailable ? 1 : 0;
    }

    if (packet.sharedSubscriptionsAvailable) {
        internal_packet.sharedSubscriptionsAvailable = packet.sharedSubscriptionsAvailable ? 1 : 0;
    }

    if (packet.serverKeepAlive) {
        internal_packet.serverKeepAlive = packet.serverKeepAlive;
    }

    if (packet.responseInformation) {
        internal_packet.responseInformation = encoder.encode(packet.responseInformation).buffer;
    }

    if (packet.serverReference) {
        internal_packet.serverReference = encoder.encode(packet.serverReference).buffer;
    }

    if (packet.userProperties) {
        internal_packet.userProperties = convert_user_properties_to_internal(packet.userProperties);
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

function convert_publish_packet_to_internal(packet: mqtt5_packet.PublishPacket) : PublishPacketInternal {
    let encoder = new TextEncoder();
    let internal_packet : PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        packetId: 0,
        topicName : encoder.encode(packet.topicName).buffer,
        qos: packet.qos
    };

    if (packet.payload) {
        internal_packet.payload = payload_to_array_buffer(packet.payload);
    }

    if (packet.retain) {
        internal_packet.retain = packet.retain ? 1 : 0;
    }

    if (packet.payloadFormat) {
        internal_packet.payloadFormat = packet.payloadFormat;
    }

    if (packet.messageExpiryIntervalSeconds) {
        internal_packet.messageExpiryIntervalSeconds = packet.messageExpiryIntervalSeconds;
    }

    if (packet.topicAlias) {
        internal_packet.topicAlias = packet.topicAlias;
    }

    if (packet.responseTopic) {
        internal_packet.responseTopic = encoder.encode(packet.responseTopic).buffer;
    }

    if (packet.correlationData) {
        internal_packet.correlationData = binary_data_to_array_buffer(packet.correlationData);
    }

    if (packet.subscriptionIdentifiers) {
        internal_packet.subscriptionIdentifiers = packet.subscriptionIdentifiers;
    }

    if (packet.contentType) {
        internal_packet.contentType = encoder.encode(packet.contentType).buffer;
    }

    if (packet.userProperties) {
        internal_packet.userProperties = convert_user_properties_to_internal(packet.userProperties);
    }

    return internal_packet;
}

function convert_puback_packet_to_internal(packet: mqtt5_packet.PubackPacket) : PubackPacketInternal {
    let encoder = new TextEncoder();
    let internal_packet : PubackPacketInternal = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 0,
        reasonCode: packet.reasonCode
    };

    if (packet.reasonString) {
        internal_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.userProperties) {
        internal_packet.userProperties = convert_user_properties_to_internal(packet.userProperties);
    }

    return internal_packet;
}

function convert_subscription_to_internal(subscription: mqtt5_packet.Subscription) : SubscriptionInternal {
    let encoder = new TextEncoder();

    let internal_subscription : SubscriptionInternal = {
        topicFilter: encoder.encode(subscription.topicFilter).buffer,
        qos: subscription.qos
    };

    if (subscription.noLocal) {
        internal_subscription.noLocal = subscription.noLocal ? 1 : 0;
    }

    if (subscription.retainAsPublished) {
        internal_subscription.retainAsPublished = subscription.retainAsPublished ? 1 : 0;
    }

    if (subscription.retainHandlingType) {
        internal_subscription.retainHandlingType = subscription.retainHandlingType;
    }

    return internal_subscription;
}

function convert_subscribe_packet_to_internal(packet: mqtt5_packet.SubscribePacket) : SubscribePacketInternal {
    let internal_packet : SubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Subscribe,
        packetId: 0,
        subscriptions: []
    };

    for (let subscription of packet.subscriptions) {
        internal_packet.subscriptions.push(convert_subscription_to_internal(subscription));
    }

    if (packet.subscriptionIdentifier) {
        internal_packet.subscriptionIdentifier = packet.subscriptionIdentifier;
    }

    if (packet.userProperties) {
        internal_packet.userProperties = convert_user_properties_to_internal(packet.userProperties);
    }

    return internal_packet;
}

function convert_suback_packet_to_internal(packet: mqtt5_packet.SubackPacket) : SubackPacketInternal {
    let encoder = new TextEncoder();
    let internal_packet: SubackPacketInternal = {
        type: mqtt5_packet.PacketType.Suback,
        packetId: 0,
        reasonCodes: packet.reasonCodes
    };

    if (packet.reasonString) {
        internal_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.userProperties) {
        internal_packet.userProperties = convert_user_properties_to_internal(packet.userProperties);
    }

    return internal_packet;
}

function convert_unsubscribe_packet_to_internal(packet: mqtt5_packet.UnsubscribePacket) : UnsubscribePacketInternal {
    let encoder = new TextEncoder();
    let internal_packet: UnsubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        packetId: 0,
        topicFilters: []
    };

    for (let topicFilter of packet.topicFilters) {
        internal_packet.topicFilters.push(encoder.encode(topicFilter).buffer);
    }

    if (packet.userProperties) {
        internal_packet.userProperties = convert_user_properties_to_internal(packet.userProperties);
    }

    return internal_packet;
}

function convert_unsuback_packet_to_internal(packet: mqtt5_packet.UnsubackPacket) : UnsubackPacketInternal {
    let encoder = new TextEncoder();
    let internal_packet: UnsubackPacketInternal = {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: 0,
        reasonCodes: packet.reasonCodes
    };

    if (packet.reasonString) {
        internal_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.userProperties) {
        internal_packet.userProperties = convert_user_properties_to_internal(packet.userProperties);
    }

    return internal_packet;
}

function convert_disconnect_packet_to_internal(packet: mqtt5_packet.DisconnectPacket) : DisconnectPacketInternal {
    let encoder = new TextEncoder();
    let internal_packet : DisconnectPacketInternal = {
        reasonCode: packet.reasonCode
    };

    if (packet.sessionExpiryIntervalSeconds) {
        internal_packet.sessionExpiryIntervalSeconds = packet.sessionExpiryIntervalSeconds;
    }

    if (packet.serverReference) {
        internal_packet.serverReference = encoder.encode(packet.serverReference).buffer;
    }

    if (packet.reasonString) {
        internal_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.userProperties) {
        internal_packet.userProperties = convert_user_properties_to_internal(packet.userProperties);
    }

    return internal_packet;
}

// TODO: take protocol level and modify -> 311 encoding for reason codes

export function convert_packet_to_internal(packet: mqtt5_packet.IPacket) : IPacketInternal {
    if (!packet.type) {
        throw new CrtError("Invalid packet type");
    }

    switch(packet.type) {
        case mqtt5_packet.PacketType.Connect:
            return convert_connect_packet_to_internal(packet as mqtt5_packet.ConnectPacket);
        case mqtt5_packet.PacketType.Connack:
            return convert_connack_packet_to_internal(packet as mqtt5_packet.ConnackPacket);
        case mqtt5_packet.PacketType.Publish:
            return convert_publish_packet_to_internal(packet as mqtt5_packet.PublishPacket);
        case mqtt5_packet.PacketType.Puback:
            return convert_puback_packet_to_internal(packet as mqtt5_packet.PubackPacket);
        case mqtt5_packet.PacketType.Subscribe:
            return convert_subscribe_packet_to_internal(packet as mqtt5_packet.SubscribePacket);
        case mqtt5_packet.PacketType.Suback:
            return convert_suback_packet_to_internal(packet as mqtt5_packet.SubackPacket);
        case mqtt5_packet.PacketType.Unsubscribe:
            return convert_unsubscribe_packet_to_internal(packet as mqtt5_packet.UnsubscribePacket);
        case mqtt5_packet.PacketType.Unsuback:
            return convert_unsuback_packet_to_internal(packet as mqtt5_packet.UnsubackPacket);
        case mqtt5_packet.PacketType.Disconnect:
            return convert_disconnect_packet_to_internal(packet as mqtt5_packet.DisconnectPacket);
        default:
            throw new CrtError("Unsupported packet type: ");
    }
}

// TODO: convert from internal that handles reason code differences appropriately (or maybe doesn't need to)