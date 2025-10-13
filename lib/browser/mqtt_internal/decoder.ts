/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as vli from "./vli";
import * as model from "./model";
import {toUtf8} from "@aws-sdk/util-utf8-browser";

export function decode_boolean(payload: DataView, offset: number) : [boolean, number] {
    return [payload.getUint8(offset) ? true : false, offset + 1];
}

export function decode_u8(payload: DataView, offset: number) : [number, number] {
    return [payload.getUint8(offset), offset + 1];
}

export function decode_u16(payload: DataView, offset: number) : [number, number] {
    return [payload.getUint16(offset), offset + 2];
}

export function decode_u32(payload: DataView, offset: number) : [number, number] {
    return [payload.getUint32(offset), offset + 4];
}

export function decode_vli(payload: DataView, offset: number) : [number, number] {
    let result = vli.decode_vli(payload, offset);
    if (result.type == vli.VliDecodeResultType.Success) {
        // @ts-ignore
        return [result.value, result.nextOffset];
    }

    throw new CrtError("Vli overflow during decoding");
}

export function decode_string(payload: DataView, offset: number, length: number) : [string, number] {
    return [toUtf8(new Uint8Array(payload.buffer, offset, length)), offset + length];
}

export function decode_length_prefixed_string(payload: DataView, offset: number) : [string, number] {
    let [stringLength, index] = decode_u16(payload, offset);
    return [toUtf8(new Uint8Array(payload.buffer, index, stringLength)), index + stringLength];
}

export function decode_bytes(payload: DataView, offset: number, length: number) : [ArrayBuffer, number] {
    return [payload.buffer.slice(offset, length), offset + length];
}

export function decode_length_prefixed_bytes(payload: DataView, offset: number) : [ArrayBuffer, number] {
    let [bytesLength, index] = decode_u16(payload, offset);
    return [payload.buffer.slice(offset, bytesLength), index + bytesLength];
}

function decode_connack_packet_311(firstByte: number, payload: DataView) : mqtt5_packet.ConnackPacket {
    if (payload.byteLength != 2) {
        throw new CrtError("Invalid 311 Connack packet received");
    }

    let index : number = 0;
    let flags : number = 0;

    let connack: mqtt5_packet.ConnackPacket = {
        type: mqtt5_packet.PacketType.Connack,
        sessionPresent: false,
        reasonCode: mqtt5_packet.ConnectReasonCode.Success
    };

    [flags, index] = decode_u8(payload, index);
    if ((flags & ~0x01) != 0) {
        throw new CrtError("Invalid connack flags");
    }
    connack.sessionPresent = flags != 0;
    [connack.reasonCode, index] = decode_u8(payload, index);

    return connack;
}

function decode_publish_packet_311(firstByte: number, payload: DataView) : model.PublishPacketInternal {
    let index : number = 0;

    let publish: model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        qos: (firstByte >> model.PUBLISH_FLAGS_QOS_SHIFT) & model.QOS_MASK,
        duplicate: (firstByte & model.PUBLISH_FLAGS_DUPLICATE) ? true : false,
        retain: (firstByte & model.PUBLISH_FLAGS_RETAIN) ? true : false,
        topicName: ""
    };

    [publish.topicName, index] = decode_length_prefixed_string(payload, index);

    if (publish.qos != mqtt5_packet.QoS.AtLeastOnce) {
        [publish.packetId, index] = decode_u16(payload, index);
    }

    if (index < payload.byteLength) {
        [publish.payload, index] = decode_bytes(payload, index, payload.byteLength - index);
    }

    return publish;
}

function decode_puback_packet_311(firstByte: number, payload: DataView) : model.PubackPacketInternal {
    if (payload.byteLength != 2) {
        throw new CrtError("Puback packet received with invalid payload length");
    }

    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_PUBACK) {
        throw new CrtError("Puback packet received with invalid first byte");
    }

    let index : number = 0;
    let puback: model.PubackPacketInternal = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 0,
        reasonCode: mqtt5_packet.PubackReasonCode.Success,
    };

    [puback.packetId, index] = decode_u16(payload, index);

    return puback;
}

function decode_suback_packet_311(firstByte: number, payload: DataView) : model.SubackPacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_SUBACK) {
        throw new CrtError("Suback packet received with invalid first byte");
    }

    let index : number = 0;
    let suback: model.SubackPacketInternal = {
        type: mqtt5_packet.PacketType.Suback,
        packetId: 0,
        reasonCodes: new Array<mqtt5_packet.SubackReasonCode>()
    };

    [suback.packetId, index] = decode_u16(payload, index);

    let reasonCodeCount = payload.byteLength - index;
    for (let i = 0; i < reasonCodeCount; i++) {
        let reasonCode: mqtt5_packet.SubackReasonCode = 0;
        [reasonCode, index] = decode_u8(payload, index);
        suback.reasonCodes.push(reasonCode);
    }

    return suback;
}

function decode_unsuback_packet_311(firstByte: number, payload: DataView) : model.UnsubackPacketInternal {
    if (payload.byteLength != 2) {
        throw new CrtError("Unsuback packet received with invalid payload length");
    }

    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_UNSUBACK) {
        throw new CrtError("Unsuback packet received with invalid first byte");
    }

    let index : number = 0;
    let puback: model.UnsubackPacketInternal = {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: 0,
        reasonCodes: [] // client will need to synthesize N successes based on original unsubscribe
    };

    [puback.packetId, index] = decode_u16(payload, index);

    return puback;
}

function decode_pingresp_packet(firstByte: number, payload: DataView) : model.PingrespPacketInternal {
    if (payload.byteLength != 0) {
        throw new CrtError("Invalid Pingresp packet received");
    }

    if (firstByte != (model.PACKET_TYPE_PINGRESP_FULL_ENCODING >> 8)) {
        throw new CrtError("Pingresp packet received with invalid first byte");
    }

    return {
        type: mqtt5_packet.PacketType.Pingresp
    };
}

export function decode_user_property(payload: DataView, offset: number, userProperties: Array<mqtt5_packet.UserProperty>) : number {
    let index: number = offset;

    let name : string = "";
    [name, index] = decode_length_prefixed_string(payload, index);

    let value : string = "";
    [value, index] = decode_length_prefixed_string(payload, index);

    userProperties.push({name: name, value: value});

    return index;
}

function decode_connack_properties(connack: model.ConnackPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decode_u8(payload, index);
        switch (propertyCode) {
            case model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE:
                [connack.sessionExpiryInterval, index] = decode_u32(payload, index);
                break;

            case model.RECEIVE_MAXIMUM_PROPERTY_CODE:
                [connack.receiveMaximum, index] = decode_u16(payload, index);
                break;

            case model.MAXIMUM_QOS_PROPERTY_CODE:
                [connack.maximumQos, index] = decode_u8(payload, index);
                break;

            case model.RETAIN_AVAILABLE_PROPERTY_CODE:
                [connack.retainAvailable, index] = decode_boolean(payload, index);
                break;

            case model.MAXIMUM_PACKET_SIZE_PROPERTY_CODE:
                [connack.maximumPacketSize, index] = decode_u32(payload, index);
                break;

            case model.ASSIGNED_CLIENT_IDENTIFIER_PROPERTY_CODE:
                [connack.assignedClientIdentifier, index] = decode_length_prefixed_string(payload, index);
                break;

            case model.TOPIC_ALIAS_MAXIMUM_PROPERTY_CODE:
                [connack.topicAliasMaximum, index] = decode_u16(payload, index);
                break;

            case model.REASON_STRING_PROPERTY_CODE:
                [connack.reasonString, index] = decode_length_prefixed_string(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!connack.userProperties) {
                    connack.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decode_user_property(payload, index, connack.userProperties);
                break;

            case model.WILDCARD_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE:
                [connack.wildcardSubscriptionsAvailable, index] = decode_boolean(payload, index);
                break;

            case model.SUBSCRIPTION_IDENTIFIERS_AVAILABLE_PROPERTY_CODE:
                [connack.subscriptionIdentifiersAvailable, index] = decode_boolean(payload, index);
                break;

            case model.SHARED_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE:
                [connack.sharedSubscriptionsAvailable, index] = decode_boolean(payload, index);
                break;

            case model.SERVER_KEEP_ALIVE_PROPERTY_CODE:
                [connack.serverKeepAlive, index] = decode_u16(payload, index);
                break;

            case model.RESPONSE_INFORMATION_PROPERTY_CODE:
                [connack.responseInformation, index] = decode_length_prefixed_string(payload, index);
                break;

            case model.SERVER_REFERENCE_PROPERTY_CODE:
                [connack.serverReference, index] = decode_length_prefixed_string(payload, index);
                break;

            case model.AUTHENTICATION_METHOD_PROPERTY_CODE:
                [connack.authenticationMethod, index] = decode_length_prefixed_string(payload, index);
                break;

            case model.AUTHENTICATION_DATA_PROPERTY_CODE:
                [connack.authenticationData, index] = decode_length_prefixed_bytes(payload, index);
                break;

            default:
                throw new CrtError("Unknown Connack property code: " + propertyCode);
        }
    }

    if (index != propertyLength) {
        throw new CrtError("??");
    }

    return offset;
}

function decode_connack_packet_5(firstByte: number, payload: DataView) : model.ConnackPacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_CONNACK) {
        throw new CrtError("Connack received with invalid first byte");
    }

    let index : number = 0;
    let flags : number = 0;

    let connack: model.ConnackPacketInternal = {
        type: mqtt5_packet.PacketType.Connack,
        sessionPresent: false,
        reasonCode: mqtt5_packet.ConnectReasonCode.Success
    };

    [flags, index] = decode_u8(payload, index);
    if ((flags & ~0x01) != 0) {
        throw new CrtError("Invalid connack flags");
    }
    connack.sessionPresent = flags != 0;
    [connack.reasonCode, index] = decode_u8(payload, index);

    let propertiesLength : number = 0;
    [propertiesLength, index] = vli.decode_vli_unconditional(payload, index);

    index = decode_connack_properties(connack, payload, index, propertiesLength);

    if (index != payload.byteLength) {
        throw new CrtError("??");
    }

    return connack;
}

function decode_publish_properties(publish: model.PublishPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decode_u8(payload, index);
        switch (propertyCode) {
            case model.PAYLOAD_FORMAT_INDICATOR_PROPERTY_CODE:
                [publish.payloadFormat, index] = decode_u8(payload, index);
                break;

            case model.MESSAGE_EXPIRY_INTERVAL_PROPERTY_CODE:
                [publish.messageExpiryIntervalSeconds, index] = decode_u32(payload, index);
                break;

            case model.TOPIC_ALIAS_PROPERTY_CODE:
                [publish.topicAlias, index] = decode_u16(payload, index);
                break;

            case model.RESPONSE_TOPIC_PROPERTY_CODE:
                [publish.responseTopic, index] = decode_length_prefixed_string(payload, index);
                break;

            case model.CORRELATION_DATA_PROPERTY_CODE:
                [publish.correlationData, index] = decode_length_prefixed_bytes(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!publish.userProperties) {
                    publish.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decode_user_property(payload, index, publish.userProperties);
                break;

            case model.SUBSCRIPTION_IDENTIFIER_PROPERTY_CODE:
                if (!publish.subscriptionIdentifiers) {
                    publish.subscriptionIdentifiers = new Array<number>();
                }
                let subscriptionIdentifier : number = 0;
                [subscriptionIdentifier, index] = vli.decode_vli_unconditional(payload, index);
                publish.subscriptionIdentifiers.push(subscriptionIdentifier);
                break;

            case model.CONTENT_TYPE_PROPERTY_CODE:
                [publish.contentType, index] = decode_length_prefixed_string(payload, index);
                break;

            default:
                throw new CrtError("Unknown Publish property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("??");
    }

    return offset;
}

function decode_publish_packet_5(firstByte: number, payload: DataView) : model.PublishPacketInternal {
    let index : number = 0;

    let publish: model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        qos: (firstByte >> model.PUBLISH_FLAGS_QOS_SHIFT) & model.QOS_MASK,
        duplicate: (firstByte & model.PUBLISH_FLAGS_DUPLICATE) ? true : false,
        retain: (firstByte & model.PUBLISH_FLAGS_RETAIN) ? true : false,
        topicName: ""
    };

    [publish.topicName, index] = decode_length_prefixed_string(payload, index);

    if (publish.qos != mqtt5_packet.QoS.AtLeastOnce) {
        [publish.packetId, index] = decode_u16(payload, index);
    }

    if (index < payload.byteLength) {
        [publish.payload, index] = decode_bytes(payload, index, payload.byteLength - index);
    }

    [, index] = vli.decode_vli_unconditional(payload, index);

    [publish.topicName, index] = decode_length_prefixed_string(payload, index);
    if (publish.qos != mqtt5_packet.QoS.AtLeastOnce) {
        [publish.packetId, index] = decode_u16(payload, index);
    }

    let propertiesLength : number = 0;
    [propertiesLength, index] = vli.decode_vli_unconditional(payload, index);

    index = decode_publish_properties(publish, payload, index, propertiesLength);

    if (index < payload.byteLength) {
        [publish.payload, index] = decode_bytes(payload, index, payload.byteLength - index);
    }

    return publish;
}

function decode_puback_properties(puback: model.PubackPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decode_u8(payload, index);
        switch (propertyCode) {

            case model.REASON_STRING_PROPERTY_CODE:
                [puback.reasonString, index] = decode_length_prefixed_string(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!puback.userProperties) {
                    puback.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decode_user_property(payload, index, puback.userProperties);
                break;

            default:
                throw new CrtError("Unknown Puback property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("??");
    }

    return offset;
}

function decode_puback_packet_5(firstByte: number, payload: DataView) : model.PubackPacketInternal {

    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_PUBACK) {
        throw new CrtError("Puback packet received with invalid first byte");
    }

    let index : number = 0;
    let puback: model.PubackPacketInternal = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 0,
        reasonCode: mqtt5_packet.PubackReasonCode.Success,
    };

    [puback.packetId, index] = decode_u16(payload, index);

    if (payload.byteLength > 2) {
        [puback.reasonCode, index] = decode_u8(payload, index);

        if (payload.byteLength > 3) {
            let propertiesLength: number = 0;
            [propertiesLength, index] = vli.decode_vli_unconditional(payload, index);

            index = decode_puback_properties(puback, payload, index, propertiesLength);
        }
    }

    if (index != payload.byteLength) {
        throw new CrtError("??");
    }

    return puback;
}

function decode_suback_properties(suback: model.SubackPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decode_u8(payload, index);
        switch (propertyCode) {

            case model.REASON_STRING_PROPERTY_CODE:
                [suback.reasonString, index] = decode_length_prefixed_string(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!suback.userProperties) {
                    suback.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decode_user_property(payload, index, suback.userProperties);
                break;

            default:
                throw new CrtError("Unknown Suback property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("??");
    }

    return offset;
}

function decode_suback_packet_5(firstByte: number, payload: DataView) : model.SubackPacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_SUBACK) {
        throw new CrtError("Suback packet received with invalid first byte");
    }

    let index : number = 0;
    let suback: model.SubackPacketInternal = {
        type: mqtt5_packet.PacketType.Suback,
        packetId: 0,
        reasonCodes: new Array<mqtt5_packet.SubackReasonCode>()
    };

    [suback.packetId, index] = decode_u16(payload, index);

    let propertiesLength: number = 0;
    [propertiesLength, index] = vli.decode_vli_unconditional(payload, index);

    index = decode_suback_properties(suback, payload, index, propertiesLength);

    let reasonCodeCount = payload.byteLength - index;
    for (let i = 0; i < reasonCodeCount; i++) {
        let reasonCode: mqtt5_packet.SubackReasonCode = 0;
        [reasonCode, index] = decode_u8(payload, index);
        suback.reasonCodes.push(reasonCode);
    }

    return suback;
}

function decode_unsuback_properties(unsuback: model.UnsubackPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decode_u8(payload, index);
        switch (propertyCode) {

            case model.REASON_STRING_PROPERTY_CODE:
                [unsuback.reasonString, index] = decode_length_prefixed_string(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!unsuback.userProperties) {
                    unsuback.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decode_user_property(payload, index, unsuback.userProperties);
                break;

            default:
                throw new CrtError("Unknown Unsuback property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("??");
    }

    return offset;
}

function decode_unsuback_packet_5(firstByte: number, payload: DataView) : model.UnsubackPacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_UNSUBACK) {
        throw new CrtError("Unsuback packet received with invalid first byte");
    }

    let index : number = 0;
    let unsuback: model.UnsubackPacketInternal = {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: 0,
        reasonCodes: new Array<mqtt5_packet.UnsubackReasonCode>()
    };

    [unsuback.packetId, index] = decode_u16(payload, index);

    let propertiesLength: number = 0;
    [propertiesLength, index] = vli.decode_vli_unconditional(payload, index);

    index = decode_unsuback_properties(unsuback, payload, index, propertiesLength);

    let reasonCodeCount = payload.byteLength - index;
    for (let i = 0; i < reasonCodeCount; i++) {
        let reasonCode: mqtt5_packet.UnsubackReasonCode = 0;
        [reasonCode, index] = decode_u8(payload, index);
        unsuback.reasonCodes.push(reasonCode);
    }

    return unsuback;
}

function decode_disconnect_properties(disconnect: mqtt5_packet.DisconnectPacket, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decode_u8(payload, index);
        switch (propertyCode) {

            case model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE:
                [disconnect.sessionExpiryIntervalSeconds, index] = decode_u32(payload, index);
                break;

            case model.REASON_STRING_PROPERTY_CODE:
                [disconnect.reasonString, index] = decode_length_prefixed_string(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!disconnect.userProperties) {
                    disconnect.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decode_user_property(payload, index, disconnect.userProperties);
                break;

            case model.SERVER_REFERENCE_PROPERTY_CODE:
                [disconnect.serverReference, index] = decode_length_prefixed_string(payload, index);
                break;

            default:
                throw new CrtError("Unknown Disconnect property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("??");
    }

    return offset;
}

function decode_disconnect_packet_5(firstByte: number, payload: DataView) : mqtt5_packet.DisconnectPacket {
    if (firstByte != model.PACKET_TYPE_DISCONNECT_FULL_ENCODING_311 >> 8) {
        throw new CrtError("Disconnect packet received with invalid first byte");
    }

    let index : number = 0;
    let disconnect: mqtt5_packet.DisconnectPacket = {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection
    };

    if (payload.byteLength > 0) {
        [disconnect.reasonCode, index] = decode_u8(payload, index);

        if (payload.byteLength > 1) {
            let propertiesLength: number = 0;
            [propertiesLength, index] = vli.decode_vli_unconditional(payload, index);

            index = decode_disconnect_properties(disconnect, payload, index, propertiesLength);
        }
    }

    if (index != payload.byteLength) {
        throw new CrtError("??");
    }

    return disconnect;
}

export type DecodingFunction = (firstByte: number, payload: DataView) => mqtt5_packet.IPacket;
export type DecodingFunctionSet = Map<mqtt5_packet.PacketType, DecodingFunction>;

export function build_client_decoding_function_set(mode: model.ProtocolMode) : DecodingFunctionSet {
    switch (mode) {
        case model.ProtocolMode.Mqtt311:
            return new Map<mqtt5_packet.PacketType, DecodingFunction>([
                [mqtt5_packet.PacketType.Connack, decode_connack_packet_311],
                [mqtt5_packet.PacketType.Publish, decode_publish_packet_311],
                [mqtt5_packet.PacketType.Puback, decode_puback_packet_311],
                [mqtt5_packet.PacketType.Suback, decode_suback_packet_311],
                [mqtt5_packet.PacketType.Unsuback, decode_unsuback_packet_311],
                [mqtt5_packet.PacketType.Pingresp, decode_pingresp_packet],
            ]);

        case model.ProtocolMode.Mqtt5:
            return new Map<mqtt5_packet.PacketType, DecodingFunction>([
                [mqtt5_packet.PacketType.Connack, decode_connack_packet_5],
                [mqtt5_packet.PacketType.Publish, decode_publish_packet_5],
                [mqtt5_packet.PacketType.Puback, decode_puback_packet_5],
                [mqtt5_packet.PacketType.Suback, decode_suback_packet_5],
                [mqtt5_packet.PacketType.Unsuback, decode_unsuback_packet_5],
                [mqtt5_packet.PacketType.Disconnect, decode_disconnect_packet_5],
                [mqtt5_packet.PacketType.Pingresp, decode_pingresp_packet],
            ]);

    }

    throw new CrtError("Unsupported protocol");
}

enum DecoderStateType {
    PendingFirstByte,
    PendingRemainingLength,
    PendingPayload
}

const DEFAULT_SCRATCH_BUFFER_SIZE : number = 16 * 1024;

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

        while (current_data.byteLength > 0) {
            switch (this.state) {
                case DecoderStateType.PendingFirstByte:
                    current_data = this._handle_first_byte(current_data);
                    break;

                case DecoderStateType.PendingRemainingLength:
                    current_data = this._handle_remaining_length(current_data);
                    break;

                case DecoderStateType.PendingPayload:
                    current_data = this._handle_pending_payload(current_data, packets);
                    break;
            }
        }

        return packets;
    }

    private _handle_first_byte(data: DataView) : DataView {
        this.firstByte = data.getUint8(0);
        this.state = DecoderStateType.PendingRemainingLength;
        this.scratchView = new DataView(this.scratchBuffer);
        return new DataView(data.buffer, data.byteOffset + 1, data.byteLength - 1);
    }

    private _handle_remaining_length(data: DataView) : DataView {
        let nextByte = data.getUint8(0);
        this.scratchView.setUint8(this.scratchIndex++, nextByte);

        let result = vli.decode_vli(new DataView(this.scratchBuffer, 0, this.scratchIndex), 0);
        if (result.type == vli.VliDecodeResultType.Success) {
            // @ts-ignore
            this.remainingLength = result.value;
            this.scratchIndex = 0;
            if (this.remainingLength > this.scratchBuffer.byteLength) {
                this.scratchBuffer = new ArrayBuffer(this.remainingLength);
            }
            this.scratchView = new DataView(this.scratchBuffer, 0, this.remainingLength);
            this.state = DecoderStateType.PendingPayload;
        }

        return new DataView(data.buffer, data.byteOffset + 1, data.byteLength - 1);
    }

    private _handle_pending_payload(data: DataView, packets: Array<mqtt5_packet.IPacket>) : DataView {
        let bytesToCopy = Math.min(data.byteLength, this.remainingLength - this.scratchIndex);
        if (bytesToCopy > 0) {
            let sourceView = new Uint8Array(data.buffer, data.byteOffset, bytesToCopy);
            let destView = new Uint8Array(this.scratchBuffer, this.scratchIndex, bytesToCopy);
            destView.set(sourceView);
        }

        if (this.scratchIndex == this.remainingLength) {
            this.state = DecoderStateType.PendingFirstByte;
            this.scratchView = new DataView(this.scratchBuffer, 0, this.remainingLength);
            packets.push(this._decode_packet());
        }

        return new DataView(data.buffer, data.byteOffset + bytesToCopy, data.byteLength - bytesToCopy);
    }

    private _decode_packet() : mqtt5_packet.IPacket {
        let packetType = this.firstByte >> 4;
        let decoder = this.decoders.get(packetType);
        if (!decoder) {
            throw new CrtError("No decoder for packet type");
        }

        return decoder(this.firstByte, this.scratchView);
    }
}