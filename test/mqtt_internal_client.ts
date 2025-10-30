/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as decoder from '../lib/browser/mqtt_internal/decoder';
import * as encoder from '../lib/browser/mqtt_internal/encoder';
import * as model from "../lib/browser/mqtt_internal/model";
import * as vli from "../lib/browser/mqtt_internal/vli";
import {CrtError} from "@awscrt";
import * as mqtt5_packet from '../lib/common/mqtt5_packet';

function encodeConnackPacket311(steps: Array<encoder.EncodingStep>, packet: ConnackPacketBinary) {
    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNACK });
    steps.push({ type: encoder.EncodingStepType.U8, value: 0x02 });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.sessionPresent ? 1 : 0 });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.reasonCode });
}

function getSubackPacketRemainingLengths311(packet: SubackPacketBinary) : number {
    return 2 + packet.reasonCodes.length;
}

function encodeSubackPacket311(steps: Array<encoder.EncodingStep>, packet: SubackPacketBinary) {
    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_SUBACK });
    steps.push({ type: encoder.EncodingStepType.VLI, value: getSubackPacketRemainingLengths311(packet) });
    steps.push({ type: encoder.EncodingStepType.U16, value: packet.packetId });

    for (let reasonCode of packet.reasonCodes) {
        steps.push({ type: encoder.EncodingStepType.U8, value: reasonCode });
    }
}

function encodeUnsubackPacket311(steps: Array<encoder.EncodingStep>, packet: UnsubackPacketBinary) {
    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_UNSUBACK });
    steps.push({ type: encoder.EncodingStepType.U8, value: 2 });
    steps.push({ type: encoder.EncodingStepType.U16, value: packet.packetId });
}

function encodePingrespPacket(steps: Array<encoder.EncodingStep>) {
    steps.push({ type: encoder.EncodingStepType.U16, value: model.PACKET_TYPE_PINGRESP_FULL_ENCODING });
}

function getConnackPacketRemainingLengths5(packet: ConnackPacketBinary) : [number, number] {
    let remaining_length: number = 2; // 1 byte flags, 1 byte reason code
    let properties_length: number = 0;

    if (packet.sessionExpiryInterval != undefined) {
        properties_length += 5;
    }

    if (packet.receiveMaximum != undefined) {
        properties_length += 3;
    }

    if (packet.maximumQos != undefined) {
        properties_length += 2;
    }

    if (packet.retainAvailable != undefined) {
        properties_length += 2;
    }

    if (packet.maximumPacketSize != undefined) {
        properties_length += 5;
    }

    if (packet.assignedClientIdentifier != undefined) {
        properties_length += 3 + packet.assignedClientIdentifier.byteLength;
    }

    if (packet.topicAliasMaximum != undefined) {
        properties_length += 3;
    }

    if (packet.reasonString != undefined) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    if (packet.wildcardSubscriptionsAvailable != undefined) {
        properties_length += 2;
    }

    if (packet.subscriptionIdentifiersAvailable != undefined) {
        properties_length += 2;
    }

    if (packet.sharedSubscriptionsAvailable != undefined) {
        properties_length += 2;
    }

    if (packet.serverKeepAlive != undefined) {
        properties_length += 3;
    }

    if (packet.responseInformation != undefined) {
        properties_length += 3 + packet.responseInformation.byteLength;
    }

    if (packet.serverReference != undefined) {
        properties_length += 3 + packet.serverReference.byteLength;
    }

    if (packet.authenticationMethod != undefined) {
        properties_length += 3 + packet.authenticationMethod.byteLength;
    }

    if (packet.authenticationData != undefined) {
        properties_length += 3 + packet.authenticationData.byteLength;
    }

    properties_length += encoder.computeUserPropertiesLength(packet.userProperties);

    remaining_length += vli.getVliByteLength(properties_length) + properties_length;

    return [remaining_length, properties_length];
}

function encodeConnackProperties(steps: Array<encoder.EncodingStep>, packet: ConnackPacketBinary) {
    if (packet.sessionExpiryInterval != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U32, value: packet.sessionExpiryInterval });
    }

    if (packet.receiveMaximum != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.RECEIVE_MAXIMUM_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U16, value: packet.receiveMaximum });
    }

    if (packet.maximumQos != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.MAXIMUM_QOS_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U8, value: packet.maximumQos });
    }

    if (packet.retainAvailable != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.RETAIN_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U8, value: packet.retainAvailable });
    }

    if (packet.maximumPacketSize != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.MAXIMUM_PACKET_SIZE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U32, value: packet.maximumPacketSize });
    }

    if (packet.assignedClientIdentifier != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.ASSIGNED_CLIENT_IDENTIFIER_PROPERTY_CODE });
        encoder.encodeRequiredLengthPrefixedArrayBuffer(steps, packet.assignedClientIdentifier);
    }

    if (packet.topicAliasMaximum != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.TOPIC_ALIAS_MAXIMUM_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U16, value: packet.topicAliasMaximum });
    }

    if (packet.reasonString != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encoder.encodeRequiredLengthPrefixedArrayBuffer(steps, packet.reasonString);
    }

    if (packet.wildcardSubscriptionsAvailable != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.WILDCARD_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U8, value: packet.wildcardSubscriptionsAvailable });
    }

    if (packet.subscriptionIdentifiersAvailable != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.SUBSCRIPTION_IDENTIFIERS_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U8, value: packet.subscriptionIdentifiersAvailable });
    }

    if (packet.sharedSubscriptionsAvailable != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.SHARED_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U8, value: packet.sharedSubscriptionsAvailable });
    }

    if (packet.serverKeepAlive != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.SERVER_KEEP_ALIVE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U16, value: packet.serverKeepAlive });
    }

    if (packet.responseInformation != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.RESPONSE_INFORMATION_PROPERTY_CODE });
        encoder.encodeRequiredLengthPrefixedArrayBuffer(steps, packet.responseInformation);
    }

    if (packet.serverReference != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.SERVER_REFERENCE_PROPERTY_CODE });
        encoder.encodeRequiredLengthPrefixedArrayBuffer(steps, packet.serverReference);
    }

    if (packet.authenticationMethod != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.AUTHENTICATION_METHOD_PROPERTY_CODE });
        encoder.encodeRequiredLengthPrefixedArrayBuffer(steps, packet.authenticationMethod);
    }

    if (packet.authenticationData != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.AUTHENTICATION_DATA_PROPERTY_CODE });
        encoder.encodeRequiredLengthPrefixedArrayBuffer(steps, packet.authenticationData);
    }

    encoder.encodeUserProperties(steps, packet.userProperties);
}

function encodeConnackPacket5(steps: Array<encoder.EncodingStep>, packet: ConnackPacketBinary) {
    let [remaining_length, properties_length] = getConnackPacketRemainingLengths5(packet);

    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNACK });
    steps.push({ type: encoder.EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.sessionPresent ? 1 : 0 });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.reasonCode });
    steps.push({ type: encoder.EncodingStepType.VLI, value: properties_length });

    encodeConnackProperties(steps, packet);
}

function getSubackPacketRemainingLengths5(packet: SubackPacketBinary) : [number, number] {
    let remaining_length: number = 2; // packet id
    let properties_length: number = 0;

    if (packet.reasonString != undefined) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    properties_length += encoder.computeUserPropertiesLength(packet.userProperties);

    remaining_length += properties_length + vli.getVliByteLength(properties_length);
    remaining_length += packet.reasonCodes.length;

    return [remaining_length, properties_length];
}

function encodeSubackProperties(steps: Array<encoder.EncodingStep>, packet: SubackPacketBinary) {
    if (packet.reasonString != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encoder.encodeRequiredLengthPrefixedArrayBuffer(steps, packet.reasonString);
    }

    encoder.encodeUserProperties(steps, packet.userProperties);
}

function encodeSubackPacket5(steps: Array<encoder.EncodingStep>, packet: SubackPacketBinary) {
    let [remaining_length, properties_length] = getSubackPacketRemainingLengths5(packet);

    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_SUBACK });
    steps.push({ type: encoder.EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: encoder.EncodingStepType.U16, value: packet.packetId });

    steps.push({ type: encoder.EncodingStepType.VLI, value: properties_length });
    encodeSubackProperties(steps, packet);

    for (let reason_code of packet.reasonCodes) {
        steps.push({ type: encoder.EncodingStepType.U8, value: reason_code });
    }
}

function getUnsubackPacketRemainingLengths5(packet: UnsubackPacketBinary) : [number, number] {
    let remaining_length: number = 2; // packet id
    let properties_length: number = encoder.computeUserPropertiesLength(packet.userProperties);

    if (packet.reasonString != undefined) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    remaining_length += properties_length + vli.getVliByteLength(properties_length);
    remaining_length += packet.reasonCodes.length;

    return [remaining_length, properties_length];
}

function encodeUnsubackProperties(steps: Array<encoder.EncodingStep>, packet: UnsubackPacketBinary) {
    if (packet.reasonString != undefined) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encoder.encodeRequiredLengthPrefixedArrayBuffer(steps, packet.reasonString);
    }

    encoder.encodeUserProperties(steps, packet.userProperties);
}

function encodeUnsubackPacket5(steps: Array<encoder.EncodingStep>, packet: UnsubackPacketBinary) {
    let [remaining_length, properties_length] = getUnsubackPacketRemainingLengths5(packet);

    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_UNSUBACK });
    steps.push({ type: encoder.EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: encoder.EncodingStepType.U16, value: packet.packetId });

    steps.push({ type: encoder.EncodingStepType.VLI, value: properties_length });
    encodeUnsubackProperties(steps, packet);

    for (let reason_code of packet.reasonCodes) {
        steps.push({ type: encoder.EncodingStepType.U8, value: reason_code });
    }
}

export function applyDebugEncodersToEncodingFunctionSet(encoders: encoder.EncodingFunctionSet, mode: model.ProtocolMode) {
    switch(mode) {
        case model.ProtocolMode.Mqtt5:
            encoders.set(mqtt5_packet.PacketType.Connack, (steps, packet) => { encodeConnackPacket5(steps, packet as ConnackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Suback, (steps, packet) => { encodeSubackPacket5(steps, packet as SubackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Unsuback, (steps, packet) => { encodeUnsubackPacket5(steps, packet as UnsubackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Pingresp, (steps, packet) => { encodePingrespPacket(steps); });
            return;

        case model.ProtocolMode.Mqtt311:
            encoders.set(mqtt5_packet.PacketType.Connack, (steps, packet) => { encodeConnackPacket311(steps, packet as ConnackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Suback, (steps, packet) => { encodeSubackPacket311(steps, packet as SubackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Unsuback, (steps, packet) => { encodeUnsubackPacket311(steps, packet as UnsubackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Pingresp, (steps, packet) => { encodePingrespPacket(steps); });
            return;
    }

    throw new CrtError("Unsupported Protocol Mode");
}

function decodePingreqPacket(firstByte: number, payload: DataView) : mqtt5_packet.IPacket {
    if (payload.byteLength != 0) {
        throw new CrtError("Pingreq packet with invalid payload");
    }

    if (firstByte != (model.PACKET_TYPE_PINGREQ_FULL_ENCODING >>> 8)) {
        throw new CrtError("Pingreq packet with invalid first byte: " + firstByte);
    }

    return {
        type: mqtt5_packet.PacketType.Pingreq
    };
}

function decodeConnectPacket311(firstByte: number, payload: DataView) : model.ConnectPacketInternal {

    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_CONNECT) {
        throw new CrtError("Connect(311) packet with invalid first byte: " + firstByte);
    }

    let connect : model.ConnectPacketInternal = {
        type: mqtt5_packet.PacketType.Connect,
        keepAliveIntervalSeconds: 0,
        clientId: "",
        cleanStart: false
    };

    let index: number = 0;
    let protocol: string = "";

    [protocol, index] = decoder.decodeLengthPrefixedString(payload, index);
    if (protocol != "MQTT") {
        throw new CrtError("Connect(311) packet with invalid protocol");
    }

    let protocolVersion: number = 0;
    [protocolVersion, index] = decoder.decodeU8(payload, index);
    if (protocolVersion != 4) {
        throw new CrtError("Connect(311) packet with mismatched protocol version");
    }

    let flags: number = 0;
    [flags, index] = decoder.decodeU8(payload, index);

    if (flags & model.CONNECT_FLAGS_CLEAN_SESSION) {
        connect.cleanStart = true;
    }

    [connect.keepAliveIntervalSeconds, index] = decoder.decodeU16(payload, index);
    [connect.clientId, index] = decoder.decodeLengthPrefixedString(payload, index);

    if (flags & model.CONNECT_FLAGS_HAS_WILL) {
        let willTopic : string = "";
        let willPayload : ArrayBuffer | null = null;

        [willTopic, index] = decoder.decodeLengthPrefixedString(payload, index);
        [willPayload, index] = decoder.decodeLengthPrefixedBytes(payload, index);

        connect.will = {
            type: mqtt5_packet.PacketType.Publish,
            topicName: willTopic,
            payload: willPayload,
            qos: (flags >>> model.CONNECT_FLAGS_QOS_SHIFT) & model.QOS_MASK,
            retain: (flags & model.CONNECT_FLAGS_WILL_RETAIN) != 0
        };
    }

    if (flags & model.CONNECT_FLAGS_HAS_USERNAME) {
        [connect.username, index] = decoder.decodeLengthPrefixedString(payload, index);
    }

    if (flags & model.CONNECT_FLAGS_HAS_PASSWORD) {
        [connect.password, index] = decoder.decodeLengthPrefixedBytes(payload, index);
    }

    if (index != payload.byteLength) {
        throw new CrtError("??");
    }

    return connect;
}

function decodeSubscribePacket311(firstByte: number, payload: DataView) : model.SubscribePacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_SUBSCRIBE) {
        throw new CrtError("Subscribe(311) packet with invalid first byte: " + firstByte);
    }

    let subscribe : model.SubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Subscribe,
        packetId: 0,
        subscriptions: new Array<mqtt5_packet.Subscription>()
    };

    let index: number = 0;

    [subscribe.packetId, index] = decoder.decodeU16(payload, index);

    while (index < payload.byteLength) {
        let subscription : mqtt5_packet.Subscription = {
            topicFilter: "",
            qos: 0
        };

        [subscription.topicFilter, index] = decoder.decodeLengthPrefixedString(payload, index);
        [subscription.qos, index] = decoder.decodeU8(payload, index);

        subscribe.subscriptions.push(subscription);
    }

    return subscribe;
}

function decodeUnsubscribePacket311(firstByte: number, payload: DataView) : model.UnsubscribePacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_UNSUBSCRIBE) {
        throw new CrtError("Unsubscribe(311) packet with invalid first byte: " + firstByte);
    }

    let unsubscribe : model.UnsubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        packetId: 0,
        topicFilters: new Array<string>()
    };

    let index: number = 0;

    [unsubscribe.packetId, index] = decoder.decodeU16(payload, index);

    while (index < payload.byteLength) {
        let topicFilter : string = "";
        [topicFilter, index] = decoder.decodeLengthPrefixedString(payload, index);
        unsubscribe.topicFilters.push(topicFilter);
    }

    return unsubscribe;
}

function decodeDisconnectPacket311(firstByte: number, payload: DataView) : mqtt5_packet.DisconnectPacket {
    if (payload.byteLength != 0) {
        throw new CrtError("Disconnect(311) packet with invalid payload");
    }

    if (firstByte != (model.PACKET_TYPE_DISCONNECT_FULL_ENCODING_311 >>> 8)) {
        throw new CrtError("Disconnect(311) packet with invalid first byte: " + firstByte);
    }

    return {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection
    };
}

function decodeSubscribeProperties(subscribe: model.SubscribePacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decoder.decodeU8(payload, index);
        switch (propertyCode) {

            case model.SUBSCRIPTION_IDENTIFIER_PROPERTY_CODE:
                [subscribe.subscriptionIdentifier, index] = decoder.decodeVli(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!subscribe.userProperties) {
                    subscribe.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decoder.decodeUserProperty(payload, index, subscribe.userProperties);
                break;

            default:
                throw new CrtError("Unknown Subscribe property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("Subscribe packet mismatch between encoded properties and expected length");
    }

    return index;
}

function decodeSubscribePacket5(firstByte: number, payload: DataView) : model.SubscribePacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_SUBSCRIBE) {
        throw new CrtError("Subscribe(5) packet with invalid first byte: " + firstByte);
    }

    let subscribe : model.SubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Subscribe,
        packetId: 0,
        subscriptions: new Array<mqtt5_packet.Subscription>()
    };

    let index: number = 0;
    [subscribe.packetId, index] = decoder.decodeU16(payload, index);

    let propertiesLength: number = 0;
    [propertiesLength, index] = decoder.decodeVli(payload, index);

    index = decodeSubscribeProperties(subscribe, payload, index, propertiesLength);

    while (index < payload.byteLength) {
        let subscription : mqtt5_packet.Subscription = {
            topicFilter: "",
            qos: 0
        };

        [subscription.topicFilter, index] = decoder.decodeLengthPrefixedString(payload, index);

        let subscriptionFlags : number = 0;
        [subscriptionFlags, index] = decoder.decodeU8(payload, index);

        subscription.qos = subscriptionFlags & model.QOS_MASK;
        subscription.noLocal = (subscriptionFlags & model.SUBSCRIPTION_FLAGS_NO_LOCAL) != 0;
        subscription.retainAsPublished = (subscriptionFlags & model.SUBSCRIPTION_FLAGS_RETAIN_AS_PUBLISHED) != 0;
        subscription.retainHandlingType = (subscriptionFlags >>> model.SUBSCRIPTION_FLAGS_RETAIN_HANDLING_TYPE_SHIFT) & model.RETAIN_HANDLING_TYPE_SHIFT;

        subscribe.subscriptions.push(subscription);
    }

    if (index != payload.byteLength) {
        throw new CrtError("Subscribe packet mismatch between encoded subscriptions and expected length");
    }

    return subscribe;
}

function decodeUnsubscribeProperties(unsubscribe: model.UnsubscribePacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decoder.decodeU8(payload, index);
        switch (propertyCode) {

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!unsubscribe.userProperties) {
                    unsubscribe.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decoder.decodeUserProperty(payload, index, unsubscribe.userProperties);
                break;

            default:
                throw new CrtError("Unknown Unsubscribe property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("Unsubscribe packet mismatch between encoded properties and expected length");
    }

    return index;
}

function decodeUnsubscribePacket5(firstByte: number, payload: DataView) : model.UnsubscribePacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_UNSUBSCRIBE) {
        throw new CrtError("Unsubscribe(5) packet with invalid first byte: " + firstByte);
    }

    let unsubscribe : model.UnsubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        packetId: 0,
        topicFilters: new Array<string>()
    };

    let index: number = 0;
    [unsubscribe.packetId, index] = decoder.decodeU16(payload, index);

    let propertiesLength: number = 0;
    [propertiesLength, index] = decoder.decodeVli(payload, index);

    index = decodeUnsubscribeProperties(unsubscribe, payload, index, propertiesLength);

    while (index < payload.byteLength) {
        let topicFilter : string = "";
        [topicFilter, index] = decoder.decodeLengthPrefixedString(payload, index);
        unsubscribe.topicFilters.push(topicFilter);
    }

    return unsubscribe;
}

function decodeConnectProperties(connect: model.ConnectPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decoder.decodeU8(payload, index);
        switch (propertyCode) {

            case model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE:
                [connect.sessionExpiryIntervalSeconds, index] = decoder.decodeU32(payload, index);
                break;

            case model.RECEIVE_MAXIMUM_PROPERTY_CODE:
                [connect.receiveMaximum, index] = decoder.decodeU16(payload, index);
                break;

            case model.MAXIMUM_PACKET_SIZE_PROPERTY_CODE:
                [connect.maximumPacketSizeBytes, index] = decoder.decodeU32(payload, index);
                break;

            case model.TOPIC_ALIAS_MAXIMUM_PROPERTY_CODE:
                [connect.topicAliasMaximum, index] = decoder.decodeU16(payload, index);
                break;

            case model.REQUEST_RESPONSE_INFORMATION_PROPERTY_CODE:
                [connect.requestResponseInformation, index] = decoder.decodeBoolean(payload, index);
                break;

            case model.REQUEST_PROBLEM_INFORMATION_PROPERTY_CODE:
                [connect.requestProblemInformation, index] = decoder.decodeBoolean(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!connect.userProperties) {
                    connect.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decoder.decodeUserProperty(payload, index, connect.userProperties);
                break;

            case model.AUTHENTICATION_METHOD_PROPERTY_CODE:
                [connect.authenticationMethod, index] = decoder.decodeLengthPrefixedString(payload, index);
                break;

            case model.AUTHENTICATION_DATA_PROPERTY_CODE:
                [connect.authenticationData, index] = decoder.decodeLengthPrefixedBytes(payload, index);
                break;

            default:
                throw new CrtError("Unknown Connect property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("Connect packet mismatch between encoded properties and expected length");
    }

    return index;
}

function decodeWillProperties(connect: model.ConnectPacketInternal, will: model.PublishPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decoder.decodeU8(payload, index);
        switch (propertyCode) {

            case model.WILL_DELAY_INTERVAL_PROPERTY_CODE:
                [connect.willDelayIntervalSeconds, index] = decoder.decodeU32(payload, index);
                break;

            case model.PAYLOAD_FORMAT_INDICATOR_PROPERTY_CODE:
                [will.payloadFormat, index] = decoder.decodeU8(payload, index);
                break;

            case model.MESSAGE_EXPIRY_INTERVAL_PROPERTY_CODE:
                [will.messageExpiryIntervalSeconds, index] = decoder.decodeU32(payload, index);
                break;

            case model.CONTENT_TYPE_PROPERTY_CODE:
                [will.contentType, index] = decoder.decodeLengthPrefixedString(payload, index);
                break;

            case model.RESPONSE_TOPIC_PROPERTY_CODE:
                [will.responseTopic, index] = decoder.decodeLengthPrefixedString(payload, index);
                break;

            case model.CORRELATION_DATA_PROPERTY_CODE:
                [will.correlationData, index] = decoder.decodeLengthPrefixedBytes(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!will.userProperties) {
                    will.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decoder.decodeUserProperty(payload, index, will.userProperties);
                break;

            default:
                throw new CrtError("Unknown will property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("Will mismatch between encoded properties and expected length");
    }

    return index;
}

function decodeConnectPacket5(firstByte: number, payload: DataView) : model.ConnectPacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_CONNECT) {
        throw new CrtError("Connect(5) packet with invalid first byte: " + firstByte);
    }

    let connect : model.ConnectPacketInternal = {
        type: mqtt5_packet.PacketType.Connect,
        keepAliveIntervalSeconds: 0,
        clientId: "",
        cleanStart: false
    };

    let index: number = 0;
    let protocol: string = "";

    [protocol, index] = decoder.decodeLengthPrefixedString(payload, index);
    if (protocol != "MQTT") {
        throw new CrtError("Connect(5) packet with invalid protocol");
    }

    let protocolVersion: number = 0;
    [protocolVersion, index] = decoder.decodeU8(payload, index);
    if (protocolVersion != 5) {
        throw new CrtError("Connect(5) packet with unexpected protocol version");
    }

    let flags: number = 0;
    [flags, index] = decoder.decodeU8(payload, index);

    if (flags & model.CONNECT_FLAGS_CLEAN_SESSION) {
        connect.cleanStart = true;
    }

    [connect.keepAliveIntervalSeconds, index] = decoder.decodeU16(payload, index);

    let propertiesLength: number = 0;
    [propertiesLength, index] = decoder.decodeVli(payload, index);

    index = decodeConnectProperties(connect, payload, index, propertiesLength);

    [connect.clientId, index] = decoder.decodeLengthPrefixedString(payload, index);

    if (flags & model.CONNECT_FLAGS_HAS_WILL) {
        // @ts-ignore
        let will : model.PublishPacketInternal =  {
            type: mqtt5_packet.PacketType.Publish,
        };

        let willPropertiesLength: number = 0;
        [willPropertiesLength, index] = decoder.decodeVli(payload, index);

        index = decodeWillProperties(connect, will, payload, index, willPropertiesLength);

        [will.topicName, index] = decoder.decodeLengthPrefixedString(payload, index);
        [will.payload, index] = decoder.decodeLengthPrefixedBytes(payload, index);
        will.qos = (flags >>> model.CONNECT_FLAGS_QOS_SHIFT) & model.QOS_MASK;
        will.retain = (flags & model.CONNECT_FLAGS_WILL_RETAIN) != 0;

        connect.will = will;
    }

    if (flags & model.CONNECT_FLAGS_HAS_USERNAME) {
        [connect.username, index] = decoder.decodeLengthPrefixedString(payload, index);
    }

    if (flags & model.CONNECT_FLAGS_HAS_PASSWORD) {
        [connect.password, index] = decoder.decodeLengthPrefixedBytes(payload, index);
    }

    if (index != payload.byteLength) {
        throw new CrtError("Connect packet mismatch between payload and expected length");
    }

    return connect;
}

export function applyDebugDecodersToDecodingFunctionSet(decoders: decoder.DecodingFunctionSet, mode: model.ProtocolMode) {

    switch(mode) {
        case model.ProtocolMode.Mqtt5:
            decoders.set(mqtt5_packet.PacketType.Pingreq, (firstByte, payload) => { return decodePingreqPacket(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Subscribe, (firstByte, payload) => { return decodeSubscribePacket5(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Unsubscribe, (firstByte, payload) => { return decodeUnsubscribePacket5(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Connect, (firstByte, payload) => { return decodeConnectPacket5(firstByte, payload); });
            return;

        case model.ProtocolMode.Mqtt311:
            decoders.set(mqtt5_packet.PacketType.Pingreq, (firstByte, payload) => { return decodePingreqPacket(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Subscribe, (firstByte, payload) => { return decodeSubscribePacket311(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Unsubscribe, (firstByte, payload) => { return decodeUnsubscribePacket311(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Connect, (firstByte, payload) => { return decodeConnectPacket311(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Disconnect, (firstByte, payload) => { return decodeDisconnectPacket311(firstByte, payload); });
            return;
    }

    throw new CrtError("Unsupported Protocol Mode");
}

export interface SubackPacketBinary extends model.IPacketBinary {
    packetId: number;

    reasonCodes: Array<number>;

    reasonString?: ArrayBuffer;

    userProperties?: Array<model.UserPropertyBinary>;
}

export interface UnsubackPacketBinary extends model.IPacketBinary {
    packetId: number;

    reasonCodes: Array<number>;

    reasonString?: ArrayBuffer;

    userProperties?: Array<model.UserPropertyBinary>;
}

export interface ConnackPacketBinary extends model.IPacketBinary {
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

    userProperties?: Array<model.UserPropertyBinary>;
}

export interface PingrespPacketBinary extends model.IPacketBinary {
}

function convertConnackPacketToBinary(packet: model.ConnackPacketInternal) : ConnackPacketBinary {
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
        internal_packet.authenticationData = model.binaryDataToArrayBuffer(packet.authenticationData);
    }

    if (packet.userProperties != undefined) {
        internal_packet.userProperties = model.convertUserPropertiesToBinary(packet.userProperties);
    }

    return internal_packet;
}

function convertSubackPacketToBinary(packet: model.SubackPacketInternal) : SubackPacketBinary {
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
        internal_packet.userProperties = model.convertUserPropertiesToBinary(packet.userProperties);
    }

    return internal_packet;
}

function convertUnsubackPacketToBinary(packet: model.UnsubackPacketInternal) : UnsubackPacketBinary {
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
        internal_packet.userProperties = model.convertUserPropertiesToBinary(packet.userProperties);
    }

    return internal_packet;
}

export function convertDebugPacketToBinary(packet: mqtt5_packet.IPacket) : model.IPacketBinary {
    if (!packet.type) {
        throw new CrtError("Invalid packet type");
    }

    switch(packet.type) {
        case mqtt5_packet.PacketType.Connect:
        case mqtt5_packet.PacketType.Publish:
        case mqtt5_packet.PacketType.Puback:
        case mqtt5_packet.PacketType.Subscribe:
        case mqtt5_packet.PacketType.Unsubscribe:
        case mqtt5_packet.PacketType.Disconnect:
        case mqtt5_packet.PacketType.Pingreq:
            // round trip testing success requires us to use the internal converter to capture all fields
            return model.convertInternalPacketToBinary(packet);

        // for everything else, use a test-only function
        case mqtt5_packet.PacketType.Connack:
            return convertConnackPacketToBinary(packet as model.ConnackPacketInternal);

        case mqtt5_packet.PacketType.Suback:
            return convertSubackPacketToBinary(packet as model.SubackPacketInternal);

        case mqtt5_packet.PacketType.Unsuback:
            return convertUnsubackPacketToBinary(packet as model.UnsubackPacketInternal);

        case mqtt5_packet.PacketType.Pingresp:
            return {
                type: mqtt5_packet.PacketType.Pingresp
            };

        default:
            throw new CrtError("Unsupported packet type: ");
    }
}

function optionalBooleansEqual(lhs: boolean | undefined, rhs: boolean | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs == rhs;
    }

    return false;
}

function optionalBooleansFalsyEqual(lhs: boolean | undefined, rhs: boolean | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs == rhs;
    }

    return !lhs && !rhs;
}

function optionalNumbersEqual(lhs: number | undefined, rhs: number | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs == rhs;
    }

    return false;
}

function optionalNumbersFalsyEqual(lhs: number | undefined, rhs: number | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs == rhs;
    }

    return !lhs && !rhs;
}

function optionalStringsEqual(lhs: string | undefined, rhs: string | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs === rhs;
    }

    return (lhs == undefined || lhs.length == 0) && (rhs == undefined || rhs.length == 0);
}

function buffersEqual(lhs: ArrayBuffer, rhs: ArrayBuffer) : boolean {
    let lhs_view = new DataView(lhs);
    let rhs_view = new DataView(rhs);

    if (lhs_view.byteLength != rhs_view.byteLength) {
        return false;
    }

    for (let i = 0; i < lhs_view.byteLength; i++) {
        if (lhs_view.getUint8(i) != rhs_view.getUint8(i)) {
            return false;
        }
    }

    return true;
}

function optionalBuffersEqual(lhs: ArrayBuffer | undefined, rhs: ArrayBuffer | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return buffersEqual(lhs, rhs);
    }

    return (lhs == undefined || lhs.byteLength == 0) && (rhs == undefined || rhs.byteLength == 0);
}

function userPropertiesEqual(lhs: Array<mqtt5_packet.UserProperty> | undefined, rhs: Array<mqtt5_packet.UserProperty> | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        if (lhs.length != rhs.length) {
            return false;
        }

        for (let i = 0; i < lhs.length; i++) {
            if (lhs[i].name !== rhs[i].name) {
                return false;
            }

            if (lhs[i].value !== rhs[i].value) {
                return false;
            }
        }

        return true;
    }

    return (lhs == undefined || lhs.length == 0) && (rhs == undefined || rhs.length == 0);
}

function areConnectPacketsEqual(lhs: model.ConnectPacketInternal, rhs: model.ConnectPacketInternal) : boolean {
    return optionalBooleansEqual(lhs.cleanStart, rhs.cleanStart) &&
        optionalNumbersEqual(lhs.topicAliasMaximum, rhs.topicAliasMaximum) &&
        optionalStringsEqual(lhs.authenticationMethod, rhs.authenticationMethod) &&
        optionalBuffersEqual(lhs.authenticationData, rhs.authenticationData) &&
        optionalNumbersEqual(lhs.keepAliveIntervalSeconds, rhs.keepAliveIntervalSeconds) &&
        optionalStringsEqual(lhs.clientId, rhs.clientId) &&
        optionalStringsEqual(lhs.username, rhs.username) &&
        optionalBuffersEqual(binaryAsOptionalBuffer(lhs.password), binaryAsOptionalBuffer(rhs.password)) &&
        optionalNumbersEqual(lhs.sessionExpiryIntervalSeconds, rhs.sessionExpiryIntervalSeconds) &&
        optionalBooleansEqual(lhs.requestResponseInformation, rhs.requestResponseInformation) &&
        optionalBooleansEqual(lhs.requestProblemInformation, rhs.requestProblemInformation) &&
        optionalNumbersEqual(lhs.receiveMaximum, rhs.receiveMaximum) &&
        optionalNumbersEqual(lhs.maximumPacketSizeBytes, rhs.maximumPacketSizeBytes) &&
        optionalNumbersEqual(lhs.willDelayIntervalSeconds, rhs.willDelayIntervalSeconds) &&
        arePublishPacketsEqual(lhs.will, rhs.will) &&
        userPropertiesEqual(lhs.userProperties, rhs.userProperties);
}

function areConnackPacketsEqual(lhs: model.ConnackPacketInternal, rhs: model.ConnackPacketInternal) : boolean {
    return optionalStringsEqual(lhs.authenticationMethod, rhs.authenticationMethod) &&
        optionalBuffersEqual(lhs.authenticationData, rhs.authenticationData) &&
        lhs.sessionPresent == rhs.sessionPresent &&
        lhs.reasonCode == rhs.reasonCode &&
        optionalNumbersEqual(lhs.sessionExpiryInterval, rhs.sessionExpiryInterval) &&
        optionalNumbersEqual(lhs.receiveMaximum, rhs.receiveMaximum) &&
        optionalNumbersEqual(lhs.maximumQos, rhs.maximumQos) &&
        optionalBooleansEqual(lhs.retainAvailable, rhs.retainAvailable) &&
        optionalNumbersEqual(lhs.maximumPacketSize, rhs.maximumPacketSize) &&
        optionalStringsEqual(lhs.assignedClientIdentifier, rhs.assignedClientIdentifier) &&
        optionalNumbersEqual(lhs.topicAliasMaximum, rhs.topicAliasMaximum) &&
        optionalStringsEqual(lhs.reasonString, rhs.reasonString) &&
        optionalBooleansEqual(lhs.wildcardSubscriptionsAvailable, rhs.wildcardSubscriptionsAvailable) &&
        optionalBooleansEqual(lhs.subscriptionIdentifiersAvailable, rhs.subscriptionIdentifiersAvailable) &&
        optionalBooleansEqual(lhs.sharedSubscriptionsAvailable, rhs.sharedSubscriptionsAvailable) &&
        optionalNumbersEqual(lhs.serverKeepAlive, rhs.serverKeepAlive) &&
        optionalStringsEqual(lhs.responseInformation, rhs.responseInformation) &&
        optionalStringsEqual(lhs.serverReference, rhs.serverReference) &&
        userPropertiesEqual(lhs.userProperties, rhs.userProperties);
}

function binaryAsOptionalBuffer(source: BinaryData | undefined) : ArrayBuffer | undefined {
    if (source == undefined) {
        return undefined;
    }

    return source as ArrayBuffer;
}

function payloadAsOptionalBuffer(source: mqtt5_packet.Payload | undefined) : ArrayBuffer | undefined {
    if (source == undefined) {
        return undefined;
    }

    return source as ArrayBuffer;
}

function numberArraysEqual(lhs: Array<number> | undefined, rhs: Array<number> | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        if (lhs.length != rhs.length) {
            return false;
        }

        for (let i = 0; i < lhs.length; i++) {
            if (lhs[i] != rhs[i]) {
                return false;
            }
        }

        return true;
    }

    return (lhs == undefined || lhs.length == 0) && (rhs == undefined || rhs.length == 0);
}

function arePublishPacketsEqual(lhs: mqtt5_packet.PublishPacket | undefined, rhs: mqtt5_packet.PublishPacket | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs.topicName == rhs.topicName &&
            lhs.qos == rhs.qos &&
            optionalBooleansEqual(lhs.retain, rhs.retain) &&
            optionalNumbersEqual(lhs.payloadFormat, rhs.payloadFormat) &&
            optionalNumbersEqual(lhs.messageExpiryIntervalSeconds, rhs.messageExpiryIntervalSeconds) &&
            optionalNumbersEqual(lhs.topicAlias, rhs.topicAlias) &&
            optionalStringsEqual(lhs.responseTopic, rhs.responseTopic) &&
            optionalBuffersEqual(binaryAsOptionalBuffer(lhs.correlationData), binaryAsOptionalBuffer(rhs.correlationData)) &&
            optionalStringsEqual(lhs.contentType, rhs.contentType) &&
            optionalBuffersEqual(payloadAsOptionalBuffer(lhs.payload), payloadAsOptionalBuffer(rhs.payload)) &&
            numberArraysEqual(lhs.subscriptionIdentifiers, rhs.subscriptionIdentifiers) &&
            userPropertiesEqual(lhs.userProperties, rhs.userProperties);
    }

    return false;
}

function arePublishInternalPacketsEqual(lhs: model.PublishPacketInternal | undefined, rhs: model.PublishPacketInternal | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs.packetId == rhs.packetId &&
            lhs.duplicate == rhs.duplicate &&
            arePublishPacketsEqual(lhs, rhs);
    }

    return false;
}

function arePubackPacketsEqual(lhs: model.PubackPacketInternal, rhs: model.PubackPacketInternal) : boolean {
    return lhs.packetId == rhs.packetId &&
        lhs.reasonCode == rhs.reasonCode &&
        optionalStringsEqual(lhs.reasonString, rhs.reasonString) &&
        userPropertiesEqual(lhs.userProperties, rhs.userProperties);
}

function subscriptionsEqual(lhs: Array<mqtt5_packet.Subscription>, rhs: Array<mqtt5_packet.Subscription>) : boolean {
    if (lhs.length != rhs.length) {
        return false;
    }

    for (let i = 0; i < lhs.length; i++) {
        if (lhs[i].topicFilter !== rhs[i].topicFilter) {
            return false;
        }

        if (lhs[i].qos != rhs[i].qos) {
            return false;
        }

        if (!optionalBooleansFalsyEqual(lhs[i].noLocal, rhs[i].noLocal)) {
            return false;
        }

        if (!optionalBooleansFalsyEqual(lhs[i].retainAsPublished, rhs[i].retainAsPublished)) {
            return false;
        }

        if (!optionalNumbersFalsyEqual(lhs[i].retainHandlingType, rhs[i].retainHandlingType)) {
            return false;
        }
    }

    return true;
}

function areSubscribePacketsEqual(lhs: model.SubscribePacketInternal, rhs: model.SubscribePacketInternal) : boolean {
    return lhs.packetId == rhs.packetId &&
        optionalNumbersEqual(lhs.subscriptionIdentifier, rhs.subscriptionIdentifier) &&
        subscriptionsEqual(lhs.subscriptions, rhs.subscriptions) &&
        userPropertiesEqual(lhs.userProperties, rhs.userProperties);
}

function areSubackPacketsEqual(lhs: model.SubackPacketInternal, rhs: model.SubackPacketInternal) : boolean {
    return lhs.packetId == rhs.packetId &&
        numberArraysEqual(lhs.reasonCodes, rhs.reasonCodes) &&
        optionalStringsEqual(lhs.reasonString, rhs.reasonString) &&
        userPropertiesEqual(lhs.userProperties, rhs.userProperties);
}

function stringArraysEqual(lhs: Array<string>, rhs: Array<string>) : boolean {
    if (lhs.length != rhs.length) {
        return false;
    }

    for (let i = 0; i < lhs.length; i++) {
        if (lhs[i] !== rhs[i]) {
            return false;
        }
    }

    return true;
}

function areUnsubscribePacketsEqual(lhs: model.UnsubscribePacketInternal, rhs: model.UnsubscribePacketInternal) : boolean {
    return lhs.packetId == rhs.packetId &&
        stringArraysEqual(lhs.topicFilters, rhs.topicFilters) &&
        userPropertiesEqual(lhs.userProperties, rhs.userProperties);
}

function areUnsubackPacketsEqual(lhs: model.UnsubackPacketInternal, rhs: model.UnsubackPacketInternal) : boolean {
    return lhs.packetId == rhs.packetId &&
        numberArraysEqual(lhs.reasonCodes, rhs.reasonCodes) &&
        optionalStringsEqual(lhs.reasonString, rhs.reasonString) &&
        userPropertiesEqual(lhs.userProperties, rhs.userProperties);
}

function areDisconnectPacketsEqual(lhs: model.DisconnectPacketInternal, rhs: model.DisconnectPacketInternal) : boolean {
    return lhs.reasonCode == rhs.reasonCode &&
        optionalNumbersEqual(lhs.sessionExpiryIntervalSeconds, rhs.sessionExpiryIntervalSeconds) &&
        optionalStringsEqual(lhs.reasonString, rhs.reasonString) &&
        optionalStringsEqual(lhs.serverReference, rhs.serverReference) &&
        userPropertiesEqual(lhs.userProperties, rhs.userProperties);
}

export function arePacketsEqual(lhs: mqtt5_packet.IPacket, rhs: mqtt5_packet.IPacket) : boolean {
    if (lhs.type != rhs.type) {
        return false;
    }

    switch(lhs.type) {
        case mqtt5_packet.PacketType.Pingreq:
        case mqtt5_packet.PacketType.Pingresp:
            return true;

        case mqtt5_packet.PacketType.Connect:
            return areConnectPacketsEqual(lhs as model.ConnectPacketInternal, rhs as model.ConnectPacketInternal);

        case mqtt5_packet.PacketType.Connack:
            return areConnackPacketsEqual(lhs as model.ConnackPacketInternal, rhs as model.ConnackPacketInternal);

        case mqtt5_packet.PacketType.Publish:
            return arePublishInternalPacketsEqual(lhs as model.PublishPacketInternal, rhs as model.PublishPacketInternal);

        case mqtt5_packet.PacketType.Puback:
            return arePubackPacketsEqual(lhs as model.PubackPacketInternal, rhs as model.PubackPacketInternal);

        case mqtt5_packet.PacketType.Subscribe:
            return areSubscribePacketsEqual(lhs as model.SubscribePacketInternal, rhs as model.SubscribePacketInternal);

        case mqtt5_packet.PacketType.Suback:
            return areSubackPacketsEqual(lhs as model.SubackPacketInternal, rhs as model.SubackPacketInternal);

        case mqtt5_packet.PacketType.Unsubscribe:
            return areUnsubscribePacketsEqual(lhs as model.UnsubscribePacketInternal, rhs as model.UnsubscribePacketInternal);

        case mqtt5_packet.PacketType.Unsuback:
            return areUnsubackPacketsEqual(lhs as model.UnsubackPacketInternal, rhs as model.UnsubackPacketInternal);

        case mqtt5_packet.PacketType.Disconnect:
            return areDisconnectPacketsEqual(lhs as model.DisconnectPacketInternal, rhs as model.DisconnectPacketInternal);

        default:
            throw new CrtError("Unsupported packet type: " + lhs.type);
    }
}