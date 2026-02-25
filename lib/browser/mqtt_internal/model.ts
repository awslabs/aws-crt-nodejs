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

// A variety of constants related to the MQTT311 and MQTT5 protocols

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

export const CONNECT_311_PROTOCOL_BYTES = [0x00, 0x04, 0x4D, 0x51, 0x54, 0x54, 0x04];
export const CONNECT_311_PROTOCOL_BUFFER = new Uint8Array(CONNECT_311_PROTOCOL_BYTES);
export const CONNECT_311_PROTOCOL_DATAVIEW = new DataView(CONNECT_311_PROTOCOL_BUFFER.buffer);
export const CONNECT_5_PROTOCOL_BYTES = [0x00, 0x04, 0x4D, 0x51, 0x54, 0x54, 0x05];
export const CONNECT_5_PROTOCOL_BUFFER = new Uint8Array(CONNECT_5_PROTOCOL_BYTES);
export const CONNECT_5_PROTOCOL_DATAVIEW = new DataView(CONNECT_5_PROTOCOL_BUFFER.buffer);

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

/*
 * We specify two separate-but-related packet models in this module:
 *
 *   1. An internal model - extends packets defined in "common/mqtt5_packet.ts" with protocol-internal details like
 *      packet id, duplicate, and other fields that we don't want to put into the public packet model.  This is the
 *      model we decode into (so technically these fields will be visible as properties on received packets, but
 *      far more importantly, they won't be required on outbound packets).
 *
 *   2. A binary model - a transformation of external/internal packets to one where all field primitives are numbers or
 *      ArrayBuffers.  This is the representation that the client will track persistently and output to the wire
 *      (ie, the encoder operates on the binary model).  The binary model is needed due to the fact that Javascript
 *      does not have any API for computing the utf-8 length of a string other than by performing the encoding (due
 *      to the fact that strings are represented internally using a non-utf-8 encoding).  By converting to and using
 *      a binary model, we only ever have to do the to-bytes conversion once (we need to know the lengths of all
 *      string-value fields before we even begin the encoding due to VLI remaining length calculations).
 *
 *      The binary model keeps around non-binary fields in exactly one instance: the subscriptions in a Subscribe packet
 *      contain both the topic filter as an ArrayBuffer as well as the original string.  This was the least messy
 *      way to be able to do dynamic (negotiated settings based) validation based on properties like wildcards and
 *      shared subscriptions.
 *
 *
 *   User-submitted outbound packet processing:
 *
 *   [User Subscribe/Publish/Unsubscribe/Disconnect] ->
 *   validate_user_submitted_outbound_packet ->
 *   convert_external_packet_to_binary_model ->
 *   client operation queue ->
 *   current operatioon ->
 *   validate_binary_outbound_packet ->
 *   encode and write to socket
 *
 *   Client-initiated outbound packet processing:
 *
 *   client operation queue ->
 *   current operatioon ->
 *   validate_binary_outbound_packet ->
 *   encode and write to socket
 *
 *   Model packets that aren't needed in the final client implementation are defined in test modules and used as
 *   needed.
 */

// Internal Model - decoded packet types + Connect
export interface ConnectPacketInternal extends mqtt5_packet.ConnectPacket {
    cleanStart: boolean;

    topicAliasMaximum?: number;

    authenticationMethod?: string;

    authenticationData?: ArrayBuffer;
}

export interface PublishPacketInternal extends mqtt5_packet.PublishPacket {
    packetId?: number;

    duplicate: boolean;
}

export interface PubackPacketInternal extends mqtt5_packet.PubackPacket {
    packetId: number
}

export interface SubackPacketInternal extends mqtt5_packet.SubackPacket {
    packetId: number
}

export interface UnsubackPacketInternal extends mqtt5_packet.UnsubackPacket {
    packetId: number
}

export interface ConnackPacketInternal extends mqtt5_packet.ConnackPacket {
    authenticationMethod?: string;

    authenticationData?: ArrayBuffer;
}

export interface PingrespPacketInternal extends mqtt5_packet.IPacket {
}

export interface DisconnectPacketInternal extends mqtt5_packet.DisconnectPacket {
}

export interface SubscribePacketInternal extends mqtt5_packet.SubscribePacket {
    packetId: number
}

export interface UnsubscribePacketInternal extends mqtt5_packet.UnsubscribePacket {
    packetId: number
}

// Binary Model - outbound packet types (publish, subscribe, unsubscribe, connect, puback, pingreq, disconnect)
export interface IPacketBinary extends mqtt5_packet.IPacket {
}

export interface UserPropertyBinary {
    name: ArrayBuffer;

    value: ArrayBuffer;
}

export interface PublishPacketBinary extends IPacketBinary {
    packetId?: number;

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

export interface PubackPacketBinary extends IPacketBinary {
    packetId: number;

    reasonCode: number;

    reasonString?: ArrayBuffer;

    userProperties?: Array<UserPropertyBinary>;
}

export interface SubscriptionBinary {
    topicFilter: ArrayBuffer;
    topicFilterAsString: string; // keep around the non-binary value for easy validation
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

export interface UnsubscribePacketBinary extends IPacketBinary {
    packetId: number;

    topicFilters: Array<ArrayBuffer>;
    topicFiltersAsStrings : Array<string>; // keep around the non-binary values for easy validation

    userProperties?: Array<UserPropertyBinary>;
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

export interface PingreqPacketBinary extends IPacketBinary {
}

export interface DisconnectPacketBinary extends IPacketBinary {
    reasonCode: number;

    sessionExpiryIntervalSeconds?: number;

    reasonString?: ArrayBuffer;

    serverReference?: ArrayBuffer;

    userProperties?: Array<UserPropertyBinary>;
}

export function isValidBinaryData(data: mqtt5_packet.BinaryData) : boolean {
    return data instanceof ArrayBuffer || data instanceof Uint8Array || data instanceof Buffer;
}

export function binaryDataToArrayBuffer(data: mqtt5_packet.BinaryData) : ArrayBuffer {
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

export function convertUserPropertiesToBinary(properties: Array<mqtt5_packet.UserProperty>) : Array<UserPropertyBinary> {
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

function convertConnectPacketToBinary(packet: ConnectPacketInternal) : ConnectPacketBinary {
    let encoder = new TextEncoder();
    let binary_packet : ConnectPacketBinary = {
        type: mqtt5_packet.PacketType.Connect,
        cleanSession: packet.cleanStart ? 1 : 0,
        keepAliveIntervalSeconds: packet.keepAliveIntervalSeconds
    };

    if (packet.clientId != undefined) {
        binary_packet.clientId = encoder.encode(packet.clientId).buffer;
    }

    if (packet.username != undefined) {
        binary_packet.username = encoder.encode(packet.username).buffer;
    }

    if (packet.password != undefined) {
        binary_packet.password = binaryDataToArrayBuffer(packet.password);
    }

    if (packet.topicAliasMaximum != undefined) {
        binary_packet.topicAliasMaximum = packet.topicAliasMaximum;
    }

    if (packet.sessionExpiryIntervalSeconds != undefined) {
        binary_packet.sessionExpiryIntervalSeconds = packet.sessionExpiryIntervalSeconds;
    }

    if (packet.requestResponseInformation != undefined) {
        binary_packet.requestResponseInformation = packet.requestResponseInformation ? 1 : 0;
    }

    if (packet.requestProblemInformation != undefined) {
        binary_packet.requestProblemInformation = packet.requestProblemInformation ? 1 : 0;
    }

    if (packet.receiveMaximum != undefined) {
        binary_packet.receiveMaximum = packet.receiveMaximum;
    }

    if (packet.maximumPacketSizeBytes != undefined) {
        binary_packet.maximumPacketSizeBytes = packet.maximumPacketSizeBytes;
    }

    if (packet.willDelayIntervalSeconds != undefined) {
        binary_packet.willDelayIntervalSeconds = packet.willDelayIntervalSeconds;
    }

    if (packet.will) {
        binary_packet.will = convertPublishPacketToBinary(packet.will as mqtt5_packet.PublishPacket);
    }

    if (packet.authenticationMethod != undefined) {
        binary_packet.authenticationMethod = encoder.encode(packet.authenticationMethod).buffer;
    }

    if (packet.authenticationData != undefined) {
        binary_packet.authenticationData = binaryDataToArrayBuffer(packet.authenticationData);
    }

    if (packet.userProperties != undefined) {
        binary_packet.userProperties = convertUserPropertiesToBinary(packet.userProperties);
    }

    return binary_packet;
}

function convertConnectPacketInternalToBinary(packet: ConnectPacketInternal, includeInternalFields: boolean) : ConnectPacketBinary {
    let encoder = new TextEncoder();
    let binary_packet : ConnectPacketBinary = convertConnectPacketToBinary(packet);

    if (includeInternalFields) {
        binary_packet.cleanSession = packet.cleanStart ? 1 : 0;
        if (packet.topicAliasMaximum != undefined) {
            binary_packet.topicAliasMaximum = packet.topicAliasMaximum;
        }

        if (packet.authenticationMethod != undefined) {
            binary_packet.authenticationMethod = encoder.encode(packet.authenticationMethod).buffer;
        }

        if (packet.authenticationData != undefined) {
            binary_packet.authenticationData = packet.authenticationData;
        }
    }

    return binary_packet;
}

export function isValidPayload(payload: mqtt5_packet.Payload) : boolean {
    return payload instanceof ArrayBuffer || payload instanceof Uint8Array || payload instanceof Buffer || typeof(payload) === 'string';
}

function payloadToArrayBuffer(payload: mqtt5_packet.Payload) : ArrayBuffer {
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

export function convertPublishPacketToBinary(packet: mqtt5_packet.PublishPacket) : PublishPacketBinary {
    let encoder = new TextEncoder();
    let binary_packet : PublishPacketBinary = {
        type: mqtt5_packet.PacketType.Publish,
        topicName : encoder.encode(packet.topicName).buffer,
        qos: packet.qos,
    };

    if (packet.payload != undefined) {
        binary_packet.payload = payloadToArrayBuffer(packet.payload);
    }

    if (packet.retain != undefined) {
        binary_packet.retain = packet.retain ? 1 : 0;
    }

    if (packet.payloadFormat != undefined) {
        binary_packet.payloadFormat = packet.payloadFormat;
    }

    if (packet.messageExpiryIntervalSeconds != undefined) {
        binary_packet.messageExpiryIntervalSeconds = packet.messageExpiryIntervalSeconds;
    }

    if (packet.topicAlias != undefined) {
        binary_packet.topicAlias = packet.topicAlias;
    }

    if (packet.responseTopic != undefined) {
        binary_packet.responseTopic = encoder.encode(packet.responseTopic).buffer;
    }

    if (packet.correlationData != undefined) {
        binary_packet.correlationData = binaryDataToArrayBuffer(packet.correlationData);
    }

    if (packet.contentType != undefined) {
        binary_packet.contentType = encoder.encode(packet.contentType).buffer;
    }

    if (packet.userProperties != undefined) {
        binary_packet.userProperties = convertUserPropertiesToBinary(packet.userProperties);
    }

    return binary_packet;
}

function convertPublishPacketInternalToBinary(packet: PublishPacketInternal, includeInternalFields: boolean) : PublishPacketBinary {
    let binary_packet : PublishPacketBinary = convertPublishPacketToBinary(packet);

    if (includeInternalFields) {
        if (packet.packetId != undefined) {
            binary_packet.packetId = packet.packetId;
        }

        if (packet.subscriptionIdentifiers != undefined) {
            binary_packet.subscriptionIdentifiers = packet.subscriptionIdentifiers;
        }

        binary_packet.duplicate = packet.duplicate ? 1 : 0;
    }

    return binary_packet;
}

function convertPubackPacketToBinary(packet: mqtt5_packet.PubackPacket) : PubackPacketBinary {
    let encoder = new TextEncoder();
    let binary_packet : PubackPacketBinary = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 0,
        reasonCode: packet.reasonCode
    };

    if (packet.reasonString != undefined) {
        binary_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.userProperties != undefined) {
        binary_packet.userProperties = convertUserPropertiesToBinary(packet.userProperties);
    }

    return binary_packet;
}

function convertPubackPacketInternalToBinary(packet: PubackPacketInternal, includeInternalFields: boolean) : PubackPacketBinary {
    let binary_packet : PubackPacketBinary = convertPubackPacketToBinary(packet);

    if (includeInternalFields) {
        binary_packet.packetId = packet.packetId;
    }

    return binary_packet;
}

function convertSubscriptionToBinary(subscription: mqtt5_packet.Subscription, encoder : TextEncoder) : SubscriptionBinary {
    let internal_subscription : SubscriptionBinary = {
        topicFilter: encoder.encode(subscription.topicFilter).buffer,
        topicFilterAsString: subscription.topicFilter,
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

export function convertSubscribePacketToBinary(packet: mqtt5_packet.SubscribePacket) : SubscribePacketBinary {
    let encoder = new TextEncoder();
    let binary_packet : SubscribePacketBinary = {
        type: mqtt5_packet.PacketType.Subscribe,
        packetId: 0,
        subscriptions: []
    };

    for (let subscription of packet.subscriptions) {
        binary_packet.subscriptions.push(convertSubscriptionToBinary(subscription, encoder));
    }

    if (packet.subscriptionIdentifier != undefined) {
        binary_packet.subscriptionIdentifier = packet.subscriptionIdentifier;
    }

    if (packet.userProperties != undefined) {
        binary_packet.userProperties = convertUserPropertiesToBinary(packet.userProperties);
    }

    return binary_packet;
}

function convertSubscribePacketInternalToBinary(packet: SubscribePacketInternal, includeInternalFields: boolean) : SubscribePacketBinary {
    let binary_packet : SubscribePacketBinary = convertSubscribePacketToBinary(packet);

    if (includeInternalFields) {
        binary_packet.packetId = packet.packetId;
    }

    return binary_packet;
}

export function convertUnsubscribePacketToBinary(packet: mqtt5_packet.UnsubscribePacket) : UnsubscribePacketBinary {
    let encoder = new TextEncoder();
    let binary_packet: UnsubscribePacketBinary = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        packetId: 0,
        topicFilters: [],
        topicFiltersAsStrings: []
    };

    for (let topicFilter of packet.topicFilters) {
        binary_packet.topicFilters.push(encoder.encode(topicFilter).buffer);
        binary_packet.topicFiltersAsStrings.push(topicFilter);
    }

    if (packet.userProperties != undefined) {
        binary_packet.userProperties = convertUserPropertiesToBinary(packet.userProperties);
    }

    return binary_packet;
}

function convertUnsubscribePacketInternalToBinary(packet: UnsubscribePacketInternal, includeInternalFields: boolean) : UnsubscribePacketBinary {
    let binaryPacket = convertUnsubscribePacketToBinary(packet);

    if (includeInternalFields) {
        binaryPacket.packetId = packet.packetId;
    }

    return binaryPacket;
}

export function convertDisconnectPacketToBinary(packet: mqtt5_packet.DisconnectPacket) : DisconnectPacketBinary {
    let encoder = new TextEncoder();
    let binary_packet : DisconnectPacketBinary = {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: packet.reasonCode
    };

    if (packet.sessionExpiryIntervalSeconds != undefined) {
        binary_packet.sessionExpiryIntervalSeconds = packet.sessionExpiryIntervalSeconds;
    }

    if (packet.serverReference != undefined) {
        binary_packet.serverReference = encoder.encode(packet.serverReference).buffer;
    }

    if (packet.reasonString != undefined) {
        binary_packet.reasonString = encoder.encode(packet.reasonString).buffer;
    }

    if (packet.userProperties != undefined) {
        binary_packet.userProperties = convertUserPropertiesToBinary(packet.userProperties);
    }

    return binary_packet;
}

/*
 * Mostly needed for round trip encode/decode testing.  In the client implementation, we use
 * convert_user_packet_to_binary on user-submitted packets after initial validation.
 */
export function convertInternalPacketToBinary(packet: mqtt5_packet.IPacket) : IPacketBinary {
    if (packet.type == undefined) {
        throw new CrtError("Invalid packet type");
    }

    switch(packet.type) {
        case mqtt5_packet.PacketType.Connect:
            return convertConnectPacketInternalToBinary(packet as ConnectPacketInternal, true);
        case mqtt5_packet.PacketType.Publish:
            return convertPublishPacketInternalToBinary(packet as PublishPacketInternal, true);
        case mqtt5_packet.PacketType.Puback:
            return convertPubackPacketInternalToBinary(packet as PubackPacketInternal, true);
        case mqtt5_packet.PacketType.Subscribe:
            return convertSubscribePacketInternalToBinary(packet as SubscribePacketInternal, true);
        case mqtt5_packet.PacketType.Unsubscribe:
            return convertUnsubscribePacketInternalToBinary(packet as UnsubscribePacketInternal, true);
        case mqtt5_packet.PacketType.Disconnect:
            return convertDisconnectPacketToBinary(packet as mqtt5_packet.DisconnectPacket);
        case mqtt5_packet.PacketType.Pingreq:
            return {
                type: mqtt5_packet.PacketType.Pingreq
            };
        default:
            throw new CrtError(`Unexpected/unsupported internal packet type: ${packet.type}`);
    }
}

export function cloneSubscribeShallow(subscribe: mqtt5_packet.SubscribePacket) : mqtt5_packet.SubscribePacket {
    let clone : mqtt5_packet.SubscribePacket = {
        type: mqtt5_packet.PacketType.Subscribe,
        subscriptions: subscribe.subscriptions
    };

    if (subscribe.userProperties) {
        clone.userProperties = subscribe.userProperties;
    }

    return clone;
}

export function cloneUnsubscribeShallow(unsubscribe: mqtt5_packet.UnsubscribePacket) : mqtt5_packet.UnsubscribePacket {
    let clone : mqtt5_packet.UnsubscribePacket = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        topicFilters: unsubscribe.topicFilters
    };

    if (unsubscribe.userProperties) {
        clone.userProperties = unsubscribe.userProperties;
    }

    return clone;
}

export function clonePublishShallow(publish: mqtt5_packet.PublishPacket) : mqtt5_packet.PublishPacket {
    let clone : mqtt5_packet.PublishPacket = {
        type: mqtt5_packet.PacketType.Publish,
        topicName: publish.topicName,
        qos: publish.qos
    };

    if (publish.payload) {
        clone.payload = publish.payload;
    }

    if (publish.retain) {
        clone.retain = publish.retain;
    }

    if (publish.payloadFormat) {
        clone.payloadFormat = publish.payloadFormat;
    }

    if (publish.messageExpiryIntervalSeconds) {
        clone.messageExpiryIntervalSeconds = publish.messageExpiryIntervalSeconds;
    }

    if (publish.responseTopic) {
        clone.responseTopic = publish.responseTopic;
    }

    if (publish.correlationData) {
        clone.correlationData = publish.correlationData;
    }

    if (publish.contentType) {
        clone.contentType = publish.contentType;
    }

    if (publish.userProperties) {
        clone.userProperties = publish.userProperties;
    }

    return clone;
}

export function cloneDisconnectShallow(disconnect: mqtt5_packet.DisconnectPacket) : mqtt5_packet.DisconnectPacket {
    let clone : mqtt5_packet.DisconnectPacket = {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: disconnect.reasonCode
    };

    if (disconnect.sessionExpiryIntervalSeconds) {
        clone.sessionExpiryIntervalSeconds = disconnect.sessionExpiryIntervalSeconds;
    }

    if (disconnect.reasonString) {
        clone.reasonString = disconnect.reasonString;
    }

    if (disconnect.userProperties) {
        clone.userProperties = disconnect.userProperties;
    }

    if (disconnect.serverReference) {
        clone.serverReference = disconnect.serverReference;
    }

    return clone;
}

function appendBooleanPacketPropertyLine(current: string, prefix: string, propertyName: string, value: boolean) : string {
    return current + `${prefix}  ${propertyName}: ${value ? "true" : "false"}\n`;
}

function appendOptionalBooleanPacketPropertyLine(current: string, prefix: string, propertyName: string, value?: boolean) : string {
    if (value == undefined) {
        return current;
    } else {
        return appendBooleanPacketPropertyLine(current, prefix, propertyName, value);
    }
}

function appendNumericPacketPropertyLine(current: string, prefix: string, propertyName: string, value: number) : string {
    return current + `${prefix}  ${propertyName}: ${value}\n`;
}

function appendOptionalNumericPacketPropertyLine(current: string, prefix: string, propertyName: string, value?: number) : string {
    if (value == undefined) {
        return current;
    } else {
        return appendNumericPacketPropertyLine(current, prefix, propertyName, value);
    }
}

function appendOptionalNumericArrayPacketPropertyLine(current: string, prefix: string, propertyName: string, values?: Array<number>) : string {
    if (values == undefined) {
        return current;
    } else {
        current += `${prefix}  ${propertyName}: [`;
        for (let i = 0; i < values.length; i++) {
            if (i > 0) {
                current += ", ";
            }

            current += values[i];
        }
        current += "]\n";

        return current;
    }
}

function appendEnumPacketPropertyLine(current: string, prefix: string, propertyName: string, valueNameConverter: (val : number) => string, value: number) : string {
    return current + `${prefix}  ${propertyName}: ${valueNameConverter(value)}(${value})\n`;
}

function appendOptionalEnumPacketPropertyLine(current: string, prefix: string, propertyName: string, valueNameConverter: (val : number) => string, value?: number) : string {
    if (value == undefined) {
        return current;
    } else {
        return appendEnumPacketPropertyLine(current, prefix, propertyName, valueNameConverter, value);
    }
}

function appendEnumArrayPacketPropertyLine<T>(current: string, prefix: string, propertyName: string, valueNameConverter: (val : number) => string, values: Array<T>) : string {
    current += `${prefix}  ${propertyName}: [\n`;
    for (let i = 0; i < values.length; i++) {
        let value = values[i];
        current += `${prefix}    ${valueNameConverter(value as number)}(${value})\n`;
    }
    current += `${prefix}  ]\n`;

    return current;
}

function appendStringPacketPropertyLine(current: string, prefix: string, propertyName: string, value: string) : string {
    return current + `${prefix}  ${propertyName}: ${value}\n`;
}

function appendOptionalStringPacketPropertyLine(current: string, prefix: string, propertyName: string, value?: string) : string {
    if (value == undefined) {
        return current;
    } else {
        return appendStringPacketPropertyLine(current, prefix, propertyName, value);
    }
}

function appendStringArrayPacketPropertyLine(current: string, prefix: string, propertyName: string, values: Array<string>) : string {
    current += `${prefix}  ${propertyName}: [\n`;
    for (let value of values) {
        current += `${prefix}    ${value}\n`;
    }
    current += `${prefix}  ]\n`;

    return current;
}

function appendBinaryPacketPropertyLine(current: string, prefix: string, propertyName: string, value: BinaryData) : string {
    return current + `${prefix}  ${propertyName}: [..${value.byteLength} bytes..]\n`;
}

function appendOptionalBinaryPacketPropertyLine(current: string, prefix: string, propertyName: string, value?: BinaryData) : string {
    if (value == undefined) {
        return current;
    } else {
        return appendBinaryPacketPropertyLine(current, prefix, propertyName, value);
    }
}

function appendPayloadPacketPropertyLine(current: string, prefix: string, propertyName: string, value?: mqtt5_packet.Payload) : string {
    let payloadLength : number = 0;
    if (value != undefined) {
        if (value instanceof ArrayBuffer) {
            payloadLength = (value as ArrayBuffer).byteLength;
        } else if (value instanceof Uint8Array) {
            payloadLength = (value as Uint8Array).buffer.byteLength;
        } else if (value instanceof Buffer) {
            payloadLength = value.byteLength;
        } else if (typeof(value) === 'string') {
            let encoder = new TextEncoder();
            payloadLength = encoder.encode(value).buffer.byteLength;
        }
    }

    return current + `${prefix}  ${propertyName}: [..${payloadLength} bytes..]\n`;
}

function appendUserProperties(current: string, prefix: string, userProperties?: Array<mqtt5_packet.UserProperty>) : string {
    if (!userProperties) {
        return current;
    }

    current += `${prefix}  UserProperties: [\n`
    for (let userProperty of userProperties) {
        current += `${prefix}    ${userProperty.name}: "${userProperty.value}"\n`;
    }
    current += `${prefix}]\n`

    return current;
}

function connectPacketToLogString(packet: ConnectPacketInternal, prefix : string) : string {
    let result = `${prefix}Connect: {\n`;

    result = appendBooleanPacketPropertyLine(result, "", "CleanStart", packet.cleanStart);
    result = appendNumericPacketPropertyLine(result, "", "KeepAliveInterval", packet.keepAliveIntervalSeconds);
    result = appendOptionalStringPacketPropertyLine(result, "", "ClientId", packet.clientId);
    result = appendOptionalStringPacketPropertyLine(result, "", "Username", packet.username);
    result = appendOptionalBinaryPacketPropertyLine(result, "", "Password", packet.password);
    result = appendOptionalNumericPacketPropertyLine(result, "", "SessionExpiryIntervalSeconds", packet.sessionExpiryIntervalSeconds);
    result = appendOptionalBooleanPacketPropertyLine(result, "", "RequestResponseInformation", packet.requestResponseInformation);
    result = appendOptionalBooleanPacketPropertyLine(result, "", "RequestProblemInformation", packet.requestProblemInformation);
    result = appendOptionalNumericPacketPropertyLine(result, "", "ReceiveMaximum", packet.receiveMaximum);
    result = appendOptionalNumericPacketPropertyLine(result, "", "MaximumPacketSize", packet.maximumPacketSizeBytes);
    result = appendOptionalNumericPacketPropertyLine(result, "", "TopicAliasMaximum", packet.topicAliasMaximum);
    result = appendOptionalStringPacketPropertyLine(result, "", "AuthenticationMethod", packet.authenticationMethod);
    result = appendOptionalBinaryPacketPropertyLine(result, "", "AuthenticationData", packet.authenticationData);
    result = appendOptionalNumericPacketPropertyLine(result, "", "WillDelayIntervalSeconds", packet.willDelayIntervalSeconds);

    if (packet.will) {
        result += `${prefix}  Will: {\n`;
        result += publishPacketToLogString(packet.will as PublishPacketInternal, "  ");
        result += `${prefix}  }\n`;
    }

    result = appendUserProperties(result, "", packet.userProperties);

    result += `${prefix}}\n`;

    return result;
}

function connackPacketToLogString(packet: ConnackPacketInternal, prefix : string) : string {
    let result = `${prefix}Connack: {\n`;

    result = appendBooleanPacketPropertyLine(result, "", "SessionPresent", packet.sessionPresent);
    result = appendEnumPacketPropertyLine(result, "", "ReasonCode", (val : number) => mqtt5_packet.ConnectReasonCode[val], packet.reasonCode);
    result = appendOptionalNumericPacketPropertyLine(result, "", "SessionExpiryInterval", packet.sessionExpiryInterval);
    result = appendOptionalNumericPacketPropertyLine(result, "", "ReceiveMaximum", packet.receiveMaximum);
    result = appendOptionalEnumPacketPropertyLine(result, "", "MaximumQos", (val : number) => mqtt5_packet.QoS[val], packet.maximumQos);
    result = appendOptionalBooleanPacketPropertyLine(result, "", "RetainAvailable", packet.retainAvailable);
    result = appendOptionalNumericPacketPropertyLine(result, "", "MaximumPacketSize", packet.maximumPacketSize);
    result = appendOptionalStringPacketPropertyLine(result, "", "AssignedClientIdentifier", packet.assignedClientIdentifier);
    result = appendOptionalNumericPacketPropertyLine(result, "", "TopicAliasMaximum", packet.topicAliasMaximum);
    result = appendOptionalStringPacketPropertyLine(result, "", "ReasonString", packet.reasonString);
    result = appendOptionalBooleanPacketPropertyLine(result, "", "WildcardSubscriptionsAvailable", packet.wildcardSubscriptionsAvailable);
    result = appendOptionalBooleanPacketPropertyLine(result, "", "SubscriptionIdentifiersAvailable", packet.subscriptionIdentifiersAvailable);
    result = appendOptionalBooleanPacketPropertyLine(result, "", "SharedSubscriptionsAvailable", packet.sharedSubscriptionsAvailable);

    result = appendOptionalNumericPacketPropertyLine(result, "", "ServerKeepAlive", packet.serverKeepAlive);
    result = appendOptionalStringPacketPropertyLine(result, "", "ResponseInformation", packet.responseInformation);
    result = appendOptionalStringPacketPropertyLine(result, "", "ServerReference", packet.serverReference);
    result = appendOptionalStringPacketPropertyLine(result, "", "AuthenticationMethod", packet.authenticationMethod);
    result = appendOptionalBinaryPacketPropertyLine(result, "", "AuthenticationData", packet.authenticationData);

    result = appendUserProperties(result, "", packet.userProperties);

    result += `${prefix}}\n`;

    return result;
}

function publishPacketToLogString(packet: PublishPacketInternal, prefix : string) : string {
    let result = `${prefix}Publish: {\n`;

    result = appendOptionalNumericPacketPropertyLine(result, "", "PacketId", packet.packetId);
    result = appendBooleanPacketPropertyLine(result, "", "Duplicate", packet.duplicate);
    result = appendStringPacketPropertyLine(result, "", "TopicName", packet.topicName);
    result = appendPayloadPacketPropertyLine(result, "", "Payload", packet.payload);
    result = appendEnumPacketPropertyLine(result, "", "Qos", (val : number) => mqtt5_packet.QoS[val], packet.qos);
    result = appendOptionalBooleanPacketPropertyLine(result, "", "Retain", packet.retain);
    result = appendOptionalEnumPacketPropertyLine(result, "", "PayloadFormat", (val : number) => mqtt5_packet.PayloadFormatIndicator[val], packet.payloadFormat);
    result = appendOptionalNumericPacketPropertyLine(result, "", "MessageExpiryIntervalSeconds", packet.messageExpiryIntervalSeconds);
    result = appendOptionalNumericPacketPropertyLine(result, "", "TopicAlias", packet.topicAlias);
    result = appendOptionalStringPacketPropertyLine(result, "", "ResponseTopic", packet.responseTopic);
    result = appendOptionalBinaryPacketPropertyLine(result, "", "CorrelationData", packet.correlationData);
    result = appendOptionalNumericArrayPacketPropertyLine(result, "", "SubscriptionIdentifiers", packet.subscriptionIdentifiers);
    result = appendOptionalStringPacketPropertyLine(result, "", "ContentType", packet.contentType);

    result = appendUserProperties(result, "", packet.userProperties);

    result += `${prefix}}\n`;

    return result;
}

function pubackPacketToLogString(packet: PubackPacketInternal, prefix : string) : string {
    let result = `${prefix}Puback: {\n`;

    result = appendNumericPacketPropertyLine(result, "", "PacketId", packet.packetId);
    result = appendEnumPacketPropertyLine(result, "", "ReasonCode", (val : number) => mqtt5_packet.PubackReasonCode[val], packet.reasonCode);
    result = appendOptionalStringPacketPropertyLine(result, "", "ReasonString", packet.reasonString);

    result = appendUserProperties(result, "", packet.userProperties);

    result += `${prefix}}\n`;

    return result;
}

function appendSubscription(current: string, prefix : string, subscription: mqtt5_packet.Subscription) : string {
    let localPrefix = `${prefix}  `;
    let result = `${localPrefix}{`;

    result = appendStringPacketPropertyLine(result, localPrefix, "TopicFilter", subscription.topicFilter);
    result = appendEnumPacketPropertyLine(result, localPrefix, "Qos", (val : number) => mqtt5_packet.QoS[val], subscription.qos);
    result = appendOptionalBooleanPacketPropertyLine(result, localPrefix, "NoLocal", subscription.noLocal);
    result = appendOptionalBooleanPacketPropertyLine(result, localPrefix, "RetainAsPublished", subscription.retainAsPublished);
    result = appendOptionalEnumPacketPropertyLine(result, localPrefix, "RetainHandlingType", (val : number) => mqtt5_packet.RetainHandlingType[val], subscription.retainHandlingType);

    result += `${localPrefix}}`;

    return result;
}

function subscribePacketToLogString(packet: SubscribePacketInternal, prefix : string) : string {
    let result = `${prefix}Subscribe: {\n`;

    result = appendOptionalNumericPacketPropertyLine(result, "", "PacketId", packet.packetId);
    result = appendOptionalNumericPacketPropertyLine(result, "", "SubscriptionIdentifier", packet.subscriptionIdentifier);
    result += `${prefix}  Subscriptions: [\n`;
    for (let subscription of packet.subscriptions) {
        result += appendSubscription(result, "  ", subscription);
    }
    result += `${prefix}  ]\n`;

    result = appendUserProperties(result, "", packet.userProperties);

    result += `${prefix}}\n`;

    return result;
}

function subackPacketToLogString(packet: SubackPacketInternal, prefix : string) : string {
    let result = `${prefix}Suback: {\n`;

    result = appendNumericPacketPropertyLine(result, "", "PacketId", packet.packetId);
    result = appendEnumArrayPacketPropertyLine(result, "", "ReasonCodes", (val : number) => mqtt5_packet.SubackReasonCode[val], packet.reasonCodes);
    result = appendOptionalStringPacketPropertyLine(result, "", "ReasonString", packet.reasonString);

    result = appendUserProperties(result, "", packet.userProperties);

    result += `${prefix}}\n`;

    return result;
}

function unsubscribePacketToLogString(packet: UnsubscribePacketInternal, prefix : string) : string {
    let result = `${prefix}Unsubscribe: {\n`;

    result = appendOptionalNumericPacketPropertyLine(result, "", "PacketId", packet.packetId);
    result = appendStringArrayPacketPropertyLine(result, "", "TopicFilters", packet.topicFilters);

    result = appendUserProperties(result, "", packet.userProperties);

    result += `${prefix}}\n`;

    return result;
}

function unsubackPacketToLogString(packet: UnsubackPacketInternal, prefix : string) : string {
    let result = `${prefix}Unsuback: {\n`;

    result = appendNumericPacketPropertyLine(result, "", "PacketId", packet.packetId);
    result = appendEnumArrayPacketPropertyLine(result, "", "ReasonCodes", (val : number) => mqtt5_packet.UnsubackReasonCode[val], packet.reasonCodes);
    result = appendOptionalStringPacketPropertyLine(result, "", "ReasonString", packet.reasonString);

    result = appendUserProperties(result, "", packet.userProperties);

    result += `${prefix}}\n`;

    return result;
}

function disconnectPacketToLogString(packet: DisconnectPacketInternal, prefix : string) : string {
    let result = `${prefix}Disconnect: {\n`;

    result = appendEnumPacketPropertyLine(result, "", "ReasonCode", (val : number) => mqtt5_packet.DisconnectReasonCode[val], packet.reasonCode);
    result = appendOptionalNumericPacketPropertyLine(result, "", "SessionExpiryIntervalSeconds", packet.sessionExpiryIntervalSeconds);
    result = appendOptionalStringPacketPropertyLine(result, "", "ReasonString", packet.reasonString);
    result = appendOptionalStringPacketPropertyLine(result, "", "ServerReference", packet.serverReference);

    result = appendUserProperties(result, "", packet.userProperties);

    result += `${prefix}}\n`;

    return result;
}

// support all user-submitted packets + all valid inbound packets + Connect
export function internalPacketToLogString(packet: mqtt5_packet.IPacket, prefix : string = "" ) : string {
    switch(packet.type) {
        case mqtt5_packet.PacketType.Connect:
            return connectPacketToLogString(packet as ConnectPacketInternal, prefix);

        case mqtt5_packet.PacketType.Connack:
            return connackPacketToLogString(packet as ConnackPacketInternal, prefix);

        case mqtt5_packet.PacketType.Publish:
            return publishPacketToLogString(packet as PublishPacketInternal, prefix);

        case mqtt5_packet.PacketType.Puback:
            return pubackPacketToLogString(packet as PubackPacketInternal, prefix);

        case mqtt5_packet.PacketType.Subscribe:
            return subscribePacketToLogString(packet as SubscribePacketInternal, prefix);

        case mqtt5_packet.PacketType.Suback:
            return subackPacketToLogString(packet as SubackPacketInternal, prefix);

        case mqtt5_packet.PacketType.Unsubscribe:
            return unsubscribePacketToLogString(packet as UnsubscribePacketInternal, prefix);

        case mqtt5_packet.PacketType.Unsuback:
            return unsubackPacketToLogString(packet as UnsubackPacketInternal, prefix);

        case mqtt5_packet.PacketType.Disconnect:
            return disconnectPacketToLogString(packet as DisconnectPacketInternal, prefix);

        case mqtt5_packet.PacketType.Pingresp:
            return `${prefix}Pingresp: {}`;

        default:
            return `${prefix}UnexpectedPacketType: ${packet.type}`;
    }
}