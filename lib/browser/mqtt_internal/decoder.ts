/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as vli from "./vli";
import * as model from "./model";
import {toUtf8} from "@aws-sdk/util-utf8-browser";

// utility functions for individual packet fields

export function decodeBoolean(payload: DataView, offset: number) : [boolean, number] {
    return [payload.getUint8(offset) ? true : false, offset + 1];
}

export function decodeU8(payload: DataView, offset: number) : [number, number] {
    return [payload.getUint8(offset), offset + 1];
}

export function decodeU16(payload: DataView, offset: number) : [number, number] {
    return [payload.getUint16(offset), offset + 2];
}

export function decodeU32(payload: DataView, offset: number) : [number, number] {
    return [payload.getUint32(offset), offset + 4];
}

export function decodeVli(payload: DataView, offset: number) : [number, number] {
    let result = vli.decodeVli(payload, offset);
    if (result.type == vli.VliDecodeResultType.Success) {
        // @ts-ignore
        return [result.value, result.nextOffset];
    }

    throw new CrtError("insufficient data to decode variable-length integer");
}

export function decodeLengthPrefixedString(payload: DataView, offset: number) : [string, number] {
    let [stringLength, index] = decodeU16(payload, offset);
    return [toUtf8(new Uint8Array(payload.buffer, index, stringLength)), index + stringLength];
}

export function decodeBytes(payload: DataView, offset: number, length: number) : [ArrayBuffer, number] {
    return [payload.buffer.slice(offset, offset + length), offset + length];
}

export function decodeLengthPrefixedBytes(payload: DataView, offset: number) : [ArrayBuffer, number] {
    let [bytesLength, index] = decodeU16(payload, offset);
    return [payload.buffer.slice(index, index + bytesLength), index + bytesLength];
}

export function decodeUserProperty(payload: DataView, offset: number, userProperties: Array<mqtt5_packet.UserProperty>) : number {
    let index: number = offset;

    let name : string = "";
    [name, index] = decodeLengthPrefixedString(payload, index);

    let value : string = "";
    [value, index] = decodeLengthPrefixedString(payload, index);

    userProperties.push({name: name, value: value});

    return index;
}

// MQTT 311 Packet decoding functions

function decodeConnackPacket311(firstByte: number, payload: DataView) : model.ConnackPacketInternal {
    if (payload.byteLength != 2) {
        throw new CrtError("Connack packet invalid payload length");
    }

    let index : number = 0;
    let flags : number = 0;

    let connack: model.ConnackPacketInternal = {
        type: mqtt5_packet.PacketType.Connack,
        sessionPresent: false,
        reasonCode: mqtt5_packet.ConnectReasonCode.Success
    };

    [flags, index] = decodeU8(payload, index);
    if ((flags & (~0x01)) != 0) {
        throw new CrtError("Connack invalid flags");
    }
    connack.sessionPresent = (flags & model.CONNACK_FLAGS_SESSION_PRESENT) != 0;
    [connack.reasonCode, index] = decodeU8(payload, index);

    return connack;
}

function decodePublishPacket311(firstByte: number, payload: DataView) : model.PublishPacketInternal {
    let index : number = 0;

    let publish: model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        qos: (firstByte >>> model.PUBLISH_FLAGS_QOS_SHIFT) & model.QOS_MASK,
        duplicate: (firstByte & model.PUBLISH_FLAGS_DUPLICATE) ? true : false,
        retain: (firstByte & model.PUBLISH_FLAGS_RETAIN) ? true : false,
        topicName: ""
    };

    [publish.topicName, index] = decodeLengthPrefixedString(payload, index);

    if (publish.qos > 0) {
        [publish.packetId, index] = decodeU16(payload, index);
    }

    if (index < payload.byteLength) {
        [publish.payload, index] = decodeBytes(payload, index, payload.byteLength - index);
    }

    return publish;
}

function decodePubackPacket311(firstByte: number, payload: DataView) : model.PubackPacketInternal {
    if (payload.byteLength != 2) {
        throw new CrtError("Puback packet with invalid payload length");
    }

    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_PUBACK) {
        throw new CrtError("Puback packet with invalid first byte: " + firstByte);
    }

    let index : number = 0;
    let puback: model.PubackPacketInternal = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 0,
        reasonCode: mqtt5_packet.PubackReasonCode.Success,
    };

    [puback.packetId, index] = decodeU16(payload, index);

    return puback;
}

function decodeSubackPacket311(firstByte: number, payload: DataView) : model.SubackPacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_SUBACK) {
        throw new CrtError("Suback packet with invalid first byte: " + firstByte);
    }

    let index : number = 0;
    let suback: model.SubackPacketInternal = {
        type: mqtt5_packet.PacketType.Suback,
        packetId: 0,
        reasonCodes: new Array<mqtt5_packet.SubackReasonCode>()
    };

    [suback.packetId, index] = decodeU16(payload, index);

    let reasonCodeCount = payload.byteLength - index;
    for (let i = 0; i < reasonCodeCount; i++) {
        let reasonCode: mqtt5_packet.SubackReasonCode = 0;
        [reasonCode, index] = decodeU8(payload, index);
        suback.reasonCodes.push(reasonCode);
    }

    return suback;
}

function decodeUnsubackPacket311(firstByte: number, payload: DataView) : model.UnsubackPacketInternal {
    if (payload.byteLength != 2) {
        throw new CrtError("Unsuback packet with invalid payload length");
    }

    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_UNSUBACK) {
        throw new CrtError("Unsuback packet with invalid first byte: " + firstByte);
    }

    let index : number = 0;
    let puback: model.UnsubackPacketInternal = {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: 0,
        reasonCodes: [] // client will need to synthesize N successes based on original unsubscribe
    };

    [puback.packetId, index] = decodeU16(payload, index);

    return puback;
}

function decodePingrespPacket(firstByte: number, payload: DataView) : model.PingrespPacketInternal {
    if (payload.byteLength != 0) {
        throw new CrtError("Pingresp packet with invalid payload length");
    }

    if (firstByte != (model.PACKET_TYPE_PINGRESP_FULL_ENCODING >>> 8)) {
        throw new CrtError("Pingresp packet with invalid first byte: " + firstByte);
    }

    return {
        type: mqtt5_packet.PacketType.Pingresp
    };
}

// MQTT 5 packet decoders

function decodeConnackProperties(connack: model.ConnackPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decodeU8(payload, index);
        switch (propertyCode) {
            case model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE:
                [connack.sessionExpiryInterval, index] = decodeU32(payload, index);
                break;

            case model.RECEIVE_MAXIMUM_PROPERTY_CODE:
                [connack.receiveMaximum, index] = decodeU16(payload, index);
                break;

            case model.MAXIMUM_QOS_PROPERTY_CODE:
                [connack.maximumQos, index] = decodeU8(payload, index);
                break;

            case model.RETAIN_AVAILABLE_PROPERTY_CODE:
                [connack.retainAvailable, index] = decodeBoolean(payload, index);
                break;

            case model.MAXIMUM_PACKET_SIZE_PROPERTY_CODE:
                [connack.maximumPacketSize, index] = decodeU32(payload, index);
                break;

            case model.ASSIGNED_CLIENT_IDENTIFIER_PROPERTY_CODE:
                [connack.assignedClientIdentifier, index] = decodeLengthPrefixedString(payload, index);
                break;

            case model.TOPIC_ALIAS_MAXIMUM_PROPERTY_CODE:
                [connack.topicAliasMaximum, index] = decodeU16(payload, index);
                break;

            case model.REASON_STRING_PROPERTY_CODE:
                [connack.reasonString, index] = decodeLengthPrefixedString(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!connack.userProperties) {
                    connack.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decodeUserProperty(payload, index, connack.userProperties);
                break;

            case model.WILDCARD_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE:
                [connack.wildcardSubscriptionsAvailable, index] = decodeBoolean(payload, index);
                break;

            case model.SUBSCRIPTION_IDENTIFIERS_AVAILABLE_PROPERTY_CODE:
                [connack.subscriptionIdentifiersAvailable, index] = decodeBoolean(payload, index);
                break;

            case model.SHARED_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE:
                [connack.sharedSubscriptionsAvailable, index] = decodeBoolean(payload, index);
                break;

            case model.SERVER_KEEP_ALIVE_PROPERTY_CODE:
                [connack.serverKeepAlive, index] = decodeU16(payload, index);
                break;

            case model.RESPONSE_INFORMATION_PROPERTY_CODE:
                [connack.responseInformation, index] = decodeLengthPrefixedString(payload, index);
                break;

            case model.SERVER_REFERENCE_PROPERTY_CODE:
                [connack.serverReference, index] = decodeLengthPrefixedString(payload, index);
                break;

            case model.AUTHENTICATION_METHOD_PROPERTY_CODE:
                [connack.authenticationMethod, index] = decodeLengthPrefixedString(payload, index);
                break;

            case model.AUTHENTICATION_DATA_PROPERTY_CODE:
                [connack.authenticationData, index] = decodeLengthPrefixedBytes(payload, index);
                break;

            default:
                throw new CrtError("Unknown Connack property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("Connack packet mismatch between encoded properties and expected length");
    }

    return index;
}

function decodeConnackPacket5(firstByte: number, payload: DataView) : model.ConnackPacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_CONNACK) {
        throw new CrtError("Connack with invalid first byte: " + firstByte);
    }

    let index : number = 0;
    let flags : number = 0;

    let connack: model.ConnackPacketInternal = {
        type: mqtt5_packet.PacketType.Connack,
        sessionPresent: false,
        reasonCode: mqtt5_packet.ConnectReasonCode.Success
    };

    [flags, index] = decodeU8(payload, index);
    connack.sessionPresent = (flags & model.CONNACK_FLAGS_SESSION_PRESENT) != 0;
    [connack.reasonCode, index] = decodeU8(payload, index);

    let propertiesLength : number = 0;
    [propertiesLength, index] = decodeVli(payload, index);

    index = decodeConnackProperties(connack, payload, index, propertiesLength);

    if (index != payload.byteLength) {
        throw new CrtError("Connect packet mismatch between payload and expected length");
    }

    return connack;
}

function decodePublishProperties(publish: model.PublishPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decodeU8(payload, index);
        switch (propertyCode) {
            case model.PAYLOAD_FORMAT_INDICATOR_PROPERTY_CODE:
                [publish.payloadFormat, index] = decodeU8(payload, index);
                break;

            case model.MESSAGE_EXPIRY_INTERVAL_PROPERTY_CODE:
                [publish.messageExpiryIntervalSeconds, index] = decodeU32(payload, index);
                break;

            case model.TOPIC_ALIAS_PROPERTY_CODE:
                [publish.topicAlias, index] = decodeU16(payload, index);
                break;

            case model.RESPONSE_TOPIC_PROPERTY_CODE:
                [publish.responseTopic, index] = decodeLengthPrefixedString(payload, index);
                break;

            case model.CORRELATION_DATA_PROPERTY_CODE:
                [publish.correlationData, index] = decodeLengthPrefixedBytes(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!publish.userProperties) {
                    publish.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decodeUserProperty(payload, index, publish.userProperties);
                break;

            case model.SUBSCRIPTION_IDENTIFIER_PROPERTY_CODE:
                if (!publish.subscriptionIdentifiers) {
                    publish.subscriptionIdentifiers = new Array<number>();
                }
                let subscriptionIdentifier : number = 0;
                [subscriptionIdentifier, index] = decodeVli(payload, index);
                publish.subscriptionIdentifiers.push(subscriptionIdentifier);
                break;

            case model.CONTENT_TYPE_PROPERTY_CODE:
                [publish.contentType, index] = decodeLengthPrefixedString(payload, index);
                break;

            default:
                throw new CrtError("Unknown Publish property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("Publish packet mismatch between encoded properties and expected length");
    }

    return index;
}

function decodePublishPacket5(firstByte: number, payload: DataView) : model.PublishPacketInternal {
    let index : number = 0;

    let publish: model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        qos: (firstByte >>> model.PUBLISH_FLAGS_QOS_SHIFT) & model.QOS_MASK,
        duplicate: (firstByte & model.PUBLISH_FLAGS_DUPLICATE) ? true : false,
        retain: (firstByte & model.PUBLISH_FLAGS_RETAIN) ? true : false,
        topicName: ""
    };

    [publish.topicName, index] = decodeLengthPrefixedString(payload, index);
    if (publish.qos > 0) {
        [publish.packetId, index] = decodeU16(payload, index);
    }

    let propertiesLength : number = 0;
    [propertiesLength, index] = decodeVli(payload, index);

    index = decodePublishProperties(publish, payload, index, propertiesLength);

    if (index < payload.byteLength) {
        [publish.payload, index] = decodeBytes(payload, index, payload.byteLength - index);
    }

    return publish;
}

function decodePubackProperties(puback: model.PubackPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decodeU8(payload, index);
        switch (propertyCode) {

            case model.REASON_STRING_PROPERTY_CODE:
                [puback.reasonString, index] = decodeLengthPrefixedString(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!puback.userProperties) {
                    puback.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decodeUserProperty(payload, index, puback.userProperties);
                break;

            default:
                throw new CrtError("Unknown Puback property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("Puback packet mismatch between encoded properties and expected length");
    }

    return index;
}

function decodePubackPacket5(firstByte: number, payload: DataView) : model.PubackPacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_PUBACK) {
        throw new CrtError("Puback packet with invalid first byte: " + firstByte);
    }

    let index : number = 0;
    let puback: model.PubackPacketInternal = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 0,
        reasonCode: mqtt5_packet.PubackReasonCode.Success,
    };

    [puback.packetId, index] = decodeU16(payload, index);

    if (payload.byteLength > 2) {
        [puback.reasonCode, index] = decodeU8(payload, index);

        if (payload.byteLength > 3) {
            let propertiesLength: number = 0;
            [propertiesLength, index] = decodeVli(payload, index);

            index = decodePubackProperties(puback, payload, index, propertiesLength);
        }
    }

    if (index != payload.byteLength) {
        throw new CrtError("Puback packet mismatch between payload and expected length");
    }

    return puback;
}

function decodeSubackProperties(suback: model.SubackPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decodeU8(payload, index);
        switch (propertyCode) {

            case model.REASON_STRING_PROPERTY_CODE:
                [suback.reasonString, index] = decodeLengthPrefixedString(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!suback.userProperties) {
                    suback.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decodeUserProperty(payload, index, suback.userProperties);
                break;

            default:
                throw new CrtError("Unknown Suback property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("Suback packet mismatch between encoded properties and expected length");
    }

    return index;
}

function decodeSubackPacket5(firstByte: number, payload: DataView) : model.SubackPacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_SUBACK) {
        throw new CrtError("Suback packet with invalid first byte: " + firstByte);
    }

    let index : number = 0;
    let suback: model.SubackPacketInternal = {
        type: mqtt5_packet.PacketType.Suback,
        packetId: 0,
        reasonCodes: new Array<mqtt5_packet.SubackReasonCode>()
    };

    [suback.packetId, index] = decodeU16(payload, index);

    let propertiesLength: number = 0;
    [propertiesLength, index] = decodeVli(payload, index);

    index = decodeSubackProperties(suback, payload, index, propertiesLength);

    let reasonCodeCount = payload.byteLength - index;
    for (let i = 0; i < reasonCodeCount; i++) {
        let reasonCode: mqtt5_packet.SubackReasonCode = 0;
        [reasonCode, index] = decodeU8(payload, index);
        suback.reasonCodes.push(reasonCode);
    }

    return suback;
}

function decodeUnsubackProperties(unsuback: model.UnsubackPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decodeU8(payload, index);
        switch (propertyCode) {

            case model.REASON_STRING_PROPERTY_CODE:
                [unsuback.reasonString, index] = decodeLengthPrefixedString(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!unsuback.userProperties) {
                    unsuback.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decodeUserProperty(payload, index, unsuback.userProperties);
                break;

            default:
                throw new CrtError("Unknown Unsuback property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("Unsuback packet mismatch between encoded properties and expected length");
    }

    return index;
}

function decodeUnsubackPacket5(firstByte: number, payload: DataView) : model.UnsubackPacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_UNSUBACK) {
        throw new CrtError("Unsuback packet with invalid first byte: " + firstByte);
    }

    let index : number = 0;
    let unsuback: model.UnsubackPacketInternal = {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: 0,
        reasonCodes: new Array<mqtt5_packet.UnsubackReasonCode>()
    };

    [unsuback.packetId, index] = decodeU16(payload, index);

    let propertiesLength: number = 0;
    [propertiesLength, index] = decodeVli(payload, index);

    index = decodeUnsubackProperties(unsuback, payload, index, propertiesLength);

    let reasonCodeCount = payload.byteLength - index;
    for (let i = 0; i < reasonCodeCount; i++) {
        let reasonCode: mqtt5_packet.UnsubackReasonCode = 0;
        [reasonCode, index] = decodeU8(payload, index);
        unsuback.reasonCodes.push(reasonCode);
    }

    return unsuback;
}

function decodeDisconnectProperties(disconnect: mqtt5_packet.DisconnectPacket, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decodeU8(payload, index);
        switch (propertyCode) {

            case model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE:
                [disconnect.sessionExpiryIntervalSeconds, index] = decodeU32(payload, index);
                break;

            case model.REASON_STRING_PROPERTY_CODE:
                [disconnect.reasonString, index] = decodeLengthPrefixedString(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!disconnect.userProperties) {
                    disconnect.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decodeUserProperty(payload, index, disconnect.userProperties);
                break;

            case model.SERVER_REFERENCE_PROPERTY_CODE:
                [disconnect.serverReference, index] = decodeLengthPrefixedString(payload, index);
                break;

            default:
                throw new CrtError("Unknown Disconnect property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("Disconnect packet mismatch between encoded properties and expected length");
    }

    return index;
}

function decodeDisconnectPacket5(firstByte: number, payload: DataView) : model.DisconnectPacketInternal {
    if (firstByte != (model.PACKET_TYPE_DISCONNECT_FULL_ENCODING_311 >>> 8)) {
        throw new CrtError("Disconnect packet with invalid first byte: " + firstByte);
    }

    let index : number = 0;
    let disconnect: model.DisconnectPacketInternal = {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection
    };

    if (payload.byteLength > 0) {
        [disconnect.reasonCode, index] = decodeU8(payload, index);

        if (payload.byteLength > 1) {
            let propertiesLength: number = 0;
            [propertiesLength, index] = decodeVli(payload, index);

            index = decodeDisconnectProperties(disconnect, payload, index, propertiesLength);
        }
    }

    if (index != payload.byteLength) {
        throw new CrtError("Disconnect packet mismatch between payload and expected length");
    }

    return disconnect;
}

// Decoder implementation

export type DecodingFunction = (firstByte: number, payload: DataView) => mqtt5_packet.IPacket;
export type DecodingFunctionSet = Map<mqtt5_packet.PacketType, DecodingFunction>;

// decoders for server-decoded packets are found in the spec file
export function buildClientDecodingFunctionSet(mode: model.ProtocolMode) : DecodingFunctionSet {
    switch (mode) {
        case model.ProtocolMode.Mqtt311:
            return new Map<mqtt5_packet.PacketType, DecodingFunction>([
                [mqtt5_packet.PacketType.Connack, decodeConnackPacket311],
                [mqtt5_packet.PacketType.Publish, decodePublishPacket311],
                [mqtt5_packet.PacketType.Puback, decodePubackPacket311],
                [mqtt5_packet.PacketType.Suback, decodeSubackPacket311],
                [mqtt5_packet.PacketType.Unsuback, decodeUnsubackPacket311],
                [mqtt5_packet.PacketType.Pingresp, decodePingrespPacket],
            ]);

        case model.ProtocolMode.Mqtt5:
            return new Map<mqtt5_packet.PacketType, DecodingFunction>([
                [mqtt5_packet.PacketType.Connack, decodeConnackPacket5],
                [mqtt5_packet.PacketType.Publish, decodePublishPacket5],
                [mqtt5_packet.PacketType.Puback, decodePubackPacket5],
                [mqtt5_packet.PacketType.Suback, decodeSubackPacket5],
                [mqtt5_packet.PacketType.Unsuback, decodeUnsubackPacket5],
                [mqtt5_packet.PacketType.Disconnect, decodeDisconnectPacket5],
                [mqtt5_packet.PacketType.Pingresp, decodePingrespPacket],
            ]);

    }

    throw new CrtError("Unsupported protocol");
}

enum DecoderStateType {

    /**
     * We're waiting for the a byte to tell us what the next packet is
     */
    PendingFirstByte,

    /**
     * We're waiting for the VLI-encoded remaining length of the full packet
     */
    PendingRemainingLength,

    /**
     * We're waiting for the complete packet payload (determined by the remaining length field)
     */
    PendingPayload
}

/**
 * Starting buffer size for the buffer used to hold the payload (or the remaining length VLI encoding).  Grows
 * as necessary.
 */
const DEFAULT_SCRATCH_BUFFER_SIZE : number = 16 * 1024;

/**
 * Decoder implementation.  All failures surface as exceptions and are considered protocol-fatal (the connection
 * must be dropped).
 */
export class Decoder {

    private state: DecoderStateType;
    private scratchBuffer: ArrayBuffer = new ArrayBuffer(DEFAULT_SCRATCH_BUFFER_SIZE);
    private scratchView: DataView = new DataView(this.scratchBuffer);
    private scratchIndex: number = 0;
    private remainingLength : number = 0;
    private firstByte : number = 0;

    constructor(private decoders: DecodingFunctionSet) {
        this.state = DecoderStateType.PendingFirstByte;
    }

    reset() {
        this.state = DecoderStateType.PendingFirstByte;
        this.remainingLength = 0;
        this.firstByte = 0;
        this.scratchIndex = 0;
    }

    decode(data: DataView) : Array<mqtt5_packet.IPacket> {
        let current_data = data;
        let packets = new Array<mqtt5_packet.IPacket>();

        let current_state = this.state;
        let next_state = this.state;

        // we're only done when there's no bytes AND the current state's service function does not advance us to
        // the next state.
        while (current_data.byteLength > 0 || current_state != next_state) {
            current_state = this.state;
            switch (this.state) {
                case DecoderStateType.PendingFirstByte:
                    current_data = this._handleFirstByte(current_data);
                    break;

                case DecoderStateType.PendingRemainingLength:
                    current_data = this._handleRemainingLength(current_data);
                    break;

                case DecoderStateType.PendingPayload:
                    current_data = this._handlePendingPayload(current_data, packets);
                    break;
            }
            next_state = this.state;
        }

        return packets;
    }

    private _handleFirstByte(data: DataView) : DataView {
        if (data.byteLength == 0) {
            return data;
        }

        this.firstByte = data.getUint8(0);
        this.state = DecoderStateType.PendingRemainingLength;
        this.scratchIndex = 0;
        this.scratchView = new DataView(this.scratchBuffer);

        return new DataView(data.buffer, data.byteOffset + 1, data.byteLength - 1);
    }

    private _handleRemainingLength(data: DataView) : DataView {
        if (data.byteLength == 0) {
            return data;
        }

        let nextByte = data.getUint8(0);
        this.scratchView.setUint8(this.scratchIndex++, nextByte);

        let result = vli.decodeVli(new DataView(this.scratchBuffer, 0, this.scratchIndex), 0);
        if (result.type == vli.VliDecodeResultType.Success) {
            // @ts-ignore
            this.remainingLength = result.value;
            this.scratchIndex = 0;

            // make sure there's enough room for the payload
            if (this.remainingLength > this.scratchBuffer.byteLength) {
                this.scratchBuffer = new ArrayBuffer(this.remainingLength * 3 / 2);
            }

            this.scratchView = new DataView(this.scratchBuffer, 0, this.remainingLength);
            this.state = DecoderStateType.PendingPayload;
        }

        return new DataView(data.buffer, data.byteOffset + 1, data.byteLength - 1);
    }

    private _handlePendingPayload(data: DataView, packets: Array<mqtt5_packet.IPacket>) : DataView {
        let bytesToCopy = Math.min(data.byteLength, this.remainingLength - this.scratchIndex);
        if (bytesToCopy > 0) {
            let sourceView = new Uint8Array(data.buffer, data.byteOffset, bytesToCopy);
            let destView = new Uint8Array(this.scratchBuffer, this.scratchIndex, bytesToCopy);
            destView.set(sourceView);
            this.scratchIndex += bytesToCopy;
        }

        if (this.scratchIndex == this.remainingLength) {
            this.state = DecoderStateType.PendingFirstByte;
            this.scratchView = new DataView(this.scratchBuffer, 0, this.remainingLength);
            packets.push(this._decodePacket());
        }

        return new DataView(data.buffer, data.byteOffset + bytesToCopy, data.byteLength - bytesToCopy);
    }

    private _decodePacket() : mqtt5_packet.IPacket {
        let packetType = this.firstByte >>> 4;
        let decoder = this.decoders.get(packetType);
        if (!decoder) {
            throw new CrtError("No decoder for packet type");
        }

        return decoder(this.firstByte, this.scratchView);
    }
}