/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as decoder from './decoder';
import * as encoder from './encoder';
import * as model from "./model";
import * as vli from "./vli";
import {CrtError} from "../error";
import * as mqtt5_packet from '../../common/mqtt5_packet';

function encode_connack_packet311(steps: Array<encoder.EncodingStep>, packet: model.ConnackPacketBinary) {
    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNACK });
    steps.push({ type: encoder.EncodingStepType.U8, value: 0x02 });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.sessionPresent ? 1 : 0 });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.reasonCode });
}

function get_suback_packet_remaining_lengths311(packet: model.SubackPacketBinary) : number {
    return 2 + packet.reasonCodes.length;
}

function encode_suback_packet311(steps: Array<encoder.EncodingStep>, packet: model.SubackPacketBinary) {
    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_SUBACK });
    steps.push({ type: encoder.EncodingStepType.VLI, value: get_suback_packet_remaining_lengths311(packet) });
    steps.push({ type: encoder.EncodingStepType.U16, value: packet.packetId });

    for (let reasonCode of packet.reasonCodes) {
        steps.push({ type: encoder.EncodingStepType.U8, value: reasonCode });
    }
}

function encode_unsuback_packet311(steps: Array<encoder.EncodingStep>, packet: model.UnsubackPacketBinary) {
    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_UNSUBACK });
    steps.push({ type: encoder.EncodingStepType.U8, value: 2 });
    steps.push({ type: encoder.EncodingStepType.U16, value: packet.packetId });
}

function encode_pingresp_packet(steps: Array<encoder.EncodingStep>) {
    steps.push({ type: encoder.EncodingStepType.U16, value: model.PACKET_TYPE_PINGRESP_FULL_ENCODING });
}

function get_connack_packet_remaining_lengths5(packet: model.ConnackPacketBinary) : [number, number] {
    let remaining_length: number = 2; // 1 byte flags, 1 byte reason code
    let properties_length: number = 0;

    if (packet.sessionExpiryInterval) {
        properties_length += 5;
    }

    if (packet.receiveMaximum) {
        properties_length += 3;
    }

    if (packet.maximumQos) {
        properties_length += 2;
    }

    if (packet.retainAvailable) {
        properties_length += 1;
    }

    if (packet.maximumPacketSize) {
        properties_length += 5;
    }

    if (packet.assignedClientIdentifier) {
        properties_length += 3 + packet.assignedClientIdentifier.byteLength;
    }

    if (packet.topicAliasMaximum) {
        properties_length += 3;
    }

    if (packet.reasonString) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    if (packet.wildcardSubscriptionsAvailable) {
        properties_length += 2;
    }

    if (packet.subscriptionIdentifiersAvailable) {
        properties_length += 2;
    }

    if (packet.sharedSubscriptionsAvailable) {
        properties_length += 2;
    }

    if (packet.serverKeepAlive) {
        properties_length += 3;
    }

    if (packet.responseInformation) {
        properties_length += 3 + packet.responseInformation.byteLength;
    }

    if (packet.serverReference) {
        properties_length += 3 + packet.serverReference.byteLength;
    }

    if (packet.authenticationMethod) {
        properties_length += 3 + packet.authenticationMethod.byteLength;
    }

    if (packet.authenticationData) {
        properties_length += 3 + packet.authenticationData.byteLength;
    }

    properties_length += encoder.compute_user_properties_length(packet.userProperties);

    remaining_length += vli.get_vli_byte_length(properties_length) + properties_length;

    return [remaining_length, properties_length];
}

function encode_connack_properties(steps: Array<encoder.EncodingStep>, packet: model.ConnackPacketBinary) {
    if (packet.sessionExpiryInterval) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U32, value: packet.sessionExpiryInterval });
    }

    if (packet.receiveMaximum) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.RECEIVE_MAXIMUM_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U16, value: packet.receiveMaximum });
    }

    if (packet.maximumQos) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.MAXIMUM_QOS_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U8, value: packet.maximumQos });
    }

    if (packet.retainAvailable) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.RETAIN_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U8, value: packet.retainAvailable });
    }

    if (packet.maximumPacketSize) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.MAXIMUM_PACKET_SIZE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U32, value: packet.maximumPacketSize });
    }

    if (packet.assignedClientIdentifier) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.ASSIGNED_CLIENT_IDENTIFIER_PROPERTY_CODE });
        encoder.encode_required_16bit_array_buffer(steps, packet.assignedClientIdentifier);
    }

    if (packet.topicAliasMaximum) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.TOPIC_ALIAS_MAXIMUM_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U16, value: packet.topicAliasMaximum });
    }

    if (packet.reasonString) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encoder.encode_required_16bit_array_buffer(steps, packet.reasonString);
    }

    if (packet.wildcardSubscriptionsAvailable) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.WILDCARD_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U8, value: packet.wildcardSubscriptionsAvailable });
    }

    if (packet.subscriptionIdentifiersAvailable) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.SUBSCRIPTION_IDENTIFIERS_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U8, value: packet.subscriptionIdentifiersAvailable });
    }

    if (packet.sharedSubscriptionsAvailable) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.SHARED_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U8, value: packet.sharedSubscriptionsAvailable });
    }

    if (packet.serverKeepAlive) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.SERVER_KEEP_ALIVE_PROPERTY_CODE });
        steps.push({ type: encoder.EncodingStepType.U16, value: packet.serverKeepAlive });
    }

    if (packet.responseInformation) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.RESPONSE_INFORMATION_PROPERTY_CODE });
        encoder.encode_required_16bit_array_buffer(steps, packet.responseInformation);
    }

    if (packet.serverReference) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.SERVER_REFERENCE_PROPERTY_CODE });
        encoder.encode_required_16bit_array_buffer(steps, packet.serverReference);
    }

    if (packet.authenticationMethod) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.AUTHENTICATION_METHOD_PROPERTY_CODE });
        encoder.encode_required_16bit_array_buffer(steps, packet.authenticationMethod);
    }

    if (packet.authenticationData) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.AUTHENTICATION_DATA_PROPERTY_CODE });
        encoder.encode_required_16bit_array_buffer(steps, packet.authenticationData);
    }

    encoder.encode_user_properties(steps, packet.userProperties);
}

function encode_connack_packet5(steps: Array<encoder.EncodingStep>, packet: model.ConnackPacketBinary) {
    let [remaining_length, properties_length] = get_connack_packet_remaining_lengths5(packet);

    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNACK });
    steps.push({ type: encoder.EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.sessionPresent ? 1 : 0 });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.reasonCode });
    steps.push({ type: encoder.EncodingStepType.VLI, value: properties_length });

    encode_connack_properties(steps, packet);
}

function get_suback_packet_remaining_lengths5(packet: model.SubackPacketBinary) : [number, number] {
    let remaining_length: number = 2; // packet id
    let properties_length: number = 0;

    if (packet.reasonString) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    properties_length += encoder.compute_user_properties_length(packet.userProperties);

    remaining_length += properties_length + vli.get_vli_byte_length(properties_length);
    remaining_length += packet.reasonCodes.length;

    return [remaining_length, properties_length];
}

function encode_suback_properties(steps: Array<encoder.EncodingStep>, packet: model.SubackPacketBinary) {
    if (packet.reasonString) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encoder.encode_required_16bit_array_buffer(steps, packet.reasonString);
    }

    encoder.encode_user_properties(steps, packet.userProperties);
}

function encode_suback_packet5(steps: Array<encoder.EncodingStep>, packet: model.SubackPacketBinary) {
    let [remaining_length, properties_length] = get_suback_packet_remaining_lengths5(packet);

    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_SUBACK });
    steps.push({ type: encoder.EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: encoder.EncodingStepType.U16, value: packet.packetId });

    steps.push({ type: encoder.EncodingStepType.VLI, value: properties_length });
    encode_suback_properties(steps, packet);

    for (let reason_code of packet.reasonCodes) {
        steps.push({ type: encoder.EncodingStepType.U8, value: reason_code });
    }
}

function get_unsuback_packet_remaining_lengths5(packet: model.UnsubackPacketBinary) : [number, number] {
    let remaining_length: number = 2; // packet id
    let properties_length: number = encoder.compute_user_properties_length(packet.userProperties);

    if (packet.reasonString) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    remaining_length += properties_length + vli.get_vli_byte_length(properties_length);
    remaining_length += packet.reasonCodes.length;

    return [remaining_length, properties_length];
}

function encode_unsuback_properties(steps: Array<encoder.EncodingStep>, packet: model.UnsubackPacketBinary) {
    if (packet.reasonString) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encoder.encode_required_16bit_array_buffer(steps, packet.reasonString);
    }

    encoder.encode_user_properties(steps, packet.userProperties);
}

function encode_unsuback_packet5(steps: Array<encoder.EncodingStep>, packet: model.UnsubackPacketBinary) {
    let [remaining_length, properties_length] = get_unsuback_packet_remaining_lengths5(packet);

    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_UNSUBACK });
    steps.push({ type: encoder.EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: encoder.EncodingStepType.U16, value: packet.packetId });

    steps.push({ type: encoder.EncodingStepType.VLI, value: properties_length });
    encode_unsuback_properties(steps, packet);

    for (let reason_code of packet.reasonCodes) {
        steps.push({ type: encoder.EncodingStepType.U8, value: reason_code });
    }
}

function apply_debug_encoders_to_encoding_function_set(encoders: encoder.EncodingFunctionSet, mode: model.ProtocolMode) {
    switch(mode) {
        case model.ProtocolMode.Mqtt5:
            encoders.set(mqtt5_packet.PacketType.Connack, (steps, packet) => { encode_connack_packet5(steps, packet as model.ConnackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Suback, (steps, packet) => { encode_suback_packet5(steps, packet as model.SubackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Unsuback, (steps, packet) => { encode_unsuback_packet5(steps, packet as model.UnsubackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Pingresp, (steps, packet) => { encode_pingresp_packet(steps); });
            return;

        case model.ProtocolMode.Mqtt311:
            encoders.set(mqtt5_packet.PacketType.Connack, (steps, packet) => { encode_connack_packet311(steps, packet as model.ConnackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Suback, (steps, packet) => { encode_suback_packet311(steps, packet as model.SubackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Unsuback, (steps, packet) => { encode_unsuback_packet311(steps, packet as model.UnsubackPacketBinary); });
            encoders.set(mqtt5_packet.PacketType.Pingresp, (steps, packet) => { encode_pingresp_packet(steps); });
            return;
    }

    throw new CrtError("Unsupported Protocol Mode");
}

function decode_pingreq_packet(firstByte: number, payload: DataView) : model.PingreqPacketInternal {
    if (payload.byteLength != 0) {
        throw new CrtError("Invalid Pingreq packet received");
    }

    if (firstByte != (model.PACKET_TYPE_PINGREQ_FULL_ENCODING >> 8)) {
        throw new CrtError("Pingreq packet received with invalid first byte");
    }

    return {
        type: mqtt5_packet.PacketType.Pingreq
    };
}

function decode_connect_packet311(firstByte: number, payload: DataView) : model.ConnectPacketInternal {

    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_CONNECT) {
        throw new CrtError("311 Connect packet received with invalid first byte");
    }

    let connect : model.ConnectPacketInternal = {
        type: mqtt5_packet.PacketType.Connect,
        keepAliveIntervalSeconds: 0,
        clientId: "",
        cleanStart: false
    };

    let index: number = 0;
    let protocol: string = "";

    [protocol, index] = decoder.decode_length_prefixed_string(payload, index);
    if (protocol != "MQTT") {
        throw new CrtError("Connect packet received with invalid protocol");
    }

    let protocolVersion: number = 0;
    [protocolVersion, index] = decoder.decode_u8(payload, index);
    if (protocolVersion != 4) {
        throw new CrtError("Connect packet received with non-311 protocol version");
    }

    let flags: number = 0;
    [flags, index] = decoder.decode_u8(payload, index);

    if (flags & model.CONNECT_FLAGS_CLEAN_SESSION) {
        connect.cleanStart = true;
    }

    [connect.keepAliveIntervalSeconds, index] = decoder.decode_u16(payload, index);
    [connect.clientId, index] = decoder.decode_length_prefixed_string(payload, index);

    if (flags & model.CONNECT_FLAGS_HAS_WILL) {
        let willTopic : string = "";
        let willPayload : ArrayBuffer | null = null;

        [willTopic, index] = decoder.decode_length_prefixed_string(payload, index);
        [willPayload, index] = decoder.decode_length_prefixed_bytes(payload, index);

        connect.will = {
            type: mqtt5_packet.PacketType.Publish,
            topicName: willTopic,
            payload: willPayload,
            qos: (flags >> model.CONNECT_FLAGS_QOS_SHIFT) & model.QOS_MASK
        };
    }

    if (flags & model.CONNECT_FLAGS_HAS_USERNAME) {
        [connect.username, index] = decoder.decode_length_prefixed_string(payload, index);
    }

    if (flags & model.CONNECT_FLAGS_HAS_PASSWORD) {
        [connect.password, index] = decoder.decode_length_prefixed_bytes(payload, index);
    }

    if (index != payload.byteLength) {
        throw new CrtError("??");
    }

    return connect;
}

function decode_subscribe_packet311(firstByte: number, payload: DataView) : model.SubscribePacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_SUBSCRIBE) {
        throw new CrtError("311 Subscribe packet received with invalid first byte");
    }

    let subscribe : model.SubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Subscribe,
        packetId: 0,
        subscriptions: new Array<mqtt5_packet.Subscription>()
    };

    let index: number = 0;

    [subscribe.packetId, index] = decoder.decode_u16(payload, index);

    while (index < payload.byteLength) {
        let subscription : mqtt5_packet.Subscription = {
            topicFilter: "",
            qos: 0
        };

        [subscription.topicFilter, index] = decoder.decode_length_prefixed_string(payload, index);
        [subscription.qos, index] = decoder.decode_u8(payload, index);

        subscribe.subscriptions.push(subscription);
    }

    return subscribe;
}

function decode_unsubscribe_packet311(firstByte: number, payload: DataView) : model.UnsubscribePacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_UNSUBSCRIBE) {
        throw new CrtError("311 Unsubscribe packet received with invalid first byte");
    }

    let unsubscribe : model.UnsubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        packetId: 0,
        topicFilters: new Array<string>()
    };

    let index: number = 0;

    [unsubscribe.packetId, index] = decoder.decode_u16(payload, index);

    while (index < payload.byteLength) {
        let topicFilter : string = "";
        [topicFilter, index] = decoder.decode_length_prefixed_string(payload, index);
        unsubscribe.topicFilters.push(topicFilter);
    }

    return unsubscribe;
}

function decode_disconnect_packet311(firstByte: number, payload: DataView) : mqtt5_packet.DisconnectPacket {
    if (payload.byteLength != 0) {
        throw new CrtError("Invalid 311 Disconnect packet received");
    }

    if (firstByte != (model.PACKET_TYPE_DISCONNECT_FULL_ENCODING_311 >> 8)) {
        throw new CrtError("311 Disconnect packet received with invalid first byte");
    }

    return {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection
    };
}

function decode_subscribe_properties(subscribe: model.SubscribePacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decoder.decode_u8(payload, index);
        switch (propertyCode) {

            case model.SUBSCRIPTION_IDENTIFIER_PROPERTY_CODE:
                [subscribe.subscriptionIdentifier, index] = decoder.decode_vli(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!subscribe.userProperties) {
                    subscribe.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decoder.decode_user_property(payload, index, subscribe.userProperties);
                break;

            default:
                throw new CrtError("Unknown Subscribe property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("??");
    }

    return offset;
}

function decode_subscribe_packet5(firstByte: number, payload: DataView) : model.SubscribePacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_SUBSCRIBE) {
        throw new CrtError("5 Subscribe packet received with invalid first byte");
    }

    let subscribe : model.SubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Subscribe,
        packetId: 0,
        subscriptions: new Array<mqtt5_packet.Subscription>()
    };

    let index: number = 0;
    [subscribe.packetId, index] = decoder.decode_u16(payload, index);

    let propertiesLength: number = 0;
    [propertiesLength, index] = decoder.decode_vli(payload, index);

    index = decode_subscribe_properties(subscribe, payload, index, propertiesLength);

    while (index < payload.byteLength) {
        let subscription : mqtt5_packet.Subscription = {
            topicFilter: "",
            qos: 0
        };

        [subscription.topicFilter, index] = decoder.decode_length_prefixed_string(payload, index);

        let subscriptionFlags : number = 0;
        [subscriptionFlags, index] = decoder.decode_u8(payload, index);

        subscription.qos = subscriptionFlags & model.QOS_MASK;
        subscription.noLocal = (subscriptionFlags & model.SUBSCRIPTION_FLAGS_NO_LOCAL) != 0;
        subscription.retainAsPublished = (subscriptionFlags & model.SUBSCRIPTION_FLAGS_RETAIN_AS_PUBLISHED) != 0;
        subscription.retainHandlingType = (subscriptionFlags >> model.SUBSCRIPTION_FLAGS_RETAIN_HANDLING_TYPE_SHIFT) & model.RETAIN_HANDLING_TYPE_SHIFT;

        subscribe.subscriptions.push(subscription);
    }

    if (index != payload.byteLength) {
        throw new CrtError("??");
    }

    return subscribe;
}

function decode_unsubscribe_properties(unsubscribe: model.UnsubscribePacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decoder.decode_u8(payload, index);
        switch (propertyCode) {

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!unsubscribe.userProperties) {
                    unsubscribe.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decoder.decode_user_property(payload, index, unsubscribe.userProperties);
                break;

            default:
                throw new CrtError("Unknown Unsubscribe property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("??");
    }

    return offset;
}

function decode_unsubscribe_packet5(firstByte: number, payload: DataView) : model.UnsubscribePacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_UNSUBSCRIBE) {
        throw new CrtError("5 Unsubscribe packet received with invalid first byte");
    }

    let unsubscribe : model.UnsubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        packetId: 0,
        topicFilters: new Array<string>()
    };

    let index: number = 0;
    [unsubscribe.packetId, index] = decoder.decode_u16(payload, index);

    let propertiesLength: number = 0;
    [propertiesLength, index] = decoder.decode_vli(payload, index);

    index = decode_unsubscribe_properties(unsubscribe, payload, index, propertiesLength);

    while (index < payload.byteLength) {
        let topicFilter : string = "";
        [topicFilter, index] = decoder.decode_length_prefixed_string(payload, index);
        unsubscribe.topicFilters.push(topicFilter);
    }

    return unsubscribe;
}

function decode_connect_properties(connect: model.ConnectPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decoder.decode_u8(payload, index);
        switch (propertyCode) {

            case model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE:
                [connect.sessionExpiryIntervalSeconds, index] = decoder.decode_u32(payload, index);
                break;

            case model.RECEIVE_MAXIMUM_PROPERTY_CODE:
                [connect.receiveMaximum, index] = decoder.decode_u16(payload, index);
                break;

            case model.MAXIMUM_PACKET_SIZE_PROPERTY_CODE:
                [connect.maximumPacketSizeBytes, index] = decoder.decode_u32(payload, index);
                break;

            case model.TOPIC_ALIAS_MAXIMUM_PROPERTY_CODE:
                [connect.topicAliasMaximum, index] = decoder.decode_u16(payload, index);
                break;

            case model.REQUEST_RESPONSE_INFORMATION_PROPERTY_CODE:
                [connect.requestResponseInformation, index] = decoder.decode_boolean(payload, index);
                break;

            case model.REQUEST_PROBLEM_INFORMATION_PROPERTY_CODE:
                [connect.requestProblemInformation, index] = decoder.decode_boolean(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!connect.userProperties) {
                    connect.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decoder.decode_user_property(payload, index, connect.userProperties);
                break;

            case model.AUTHENTICATION_METHOD_PROPERTY_CODE:
                [connect.authenticationMethod, index] = decoder.decode_length_prefixed_string(payload, index);
                break;

            case model.AUTHENTICATION_DATA_PROPERTY_CODE:
                [connect.authenticationData, index] = decoder.decode_length_prefixed_bytes(payload, index);
                break;

            default:
                throw new CrtError("Unknown Connect property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("??");
    }

    return offset;
}

function decode_will_properties(connect: model.ConnectPacketInternal, will: model.PublishPacketInternal, payload: DataView, offset: number, propertyLength: number) : number {
    let index : number = offset;
    let propertyCode : number = 0;
    while (index < offset + propertyLength) {
        [propertyCode, index] = decoder.decode_u8(payload, index);
        switch (propertyCode) {

            case model.WILL_DELAY_INTERVAL_PROPERTY_CODE:
                [connect.willDelayIntervalSeconds, index] = decoder.decode_u32(payload, index);
                break;

            case model.PAYLOAD_FORMAT_INDICATOR_PROPERTY_CODE:
                [will.payloadFormat, index] = decoder.decode_u8(payload, index);
                break;

            case model.MESSAGE_EXPIRY_INTERVAL_PROPERTY_CODE:
                [will.messageExpiryIntervalSeconds, index] = decoder.decode_u32(payload, index);
                break;

            case model.CONTENT_TYPE_PROPERTY_CODE:
                [will.contentType, index] = decoder.decode_length_prefixed_string(payload, index);
                break;

            case model.RESPONSE_TOPIC_PROPERTY_CODE:
                [will.responseTopic, index] = decoder.decode_length_prefixed_string(payload, index);
                break;

            case model.CORRELATION_DATA_PROPERTY_CODE:
                [will.correlationData, index] = decoder.decode_length_prefixed_bytes(payload, index);
                break;

            case model.USER_PROPERTY_PROPERTY_CODE:
                if (!will.userProperties) {
                    will.userProperties = new Array<mqtt5_packet.UserProperty>();
                }
                index = decoder.decode_user_property(payload, index, will.userProperties);
                break;

            default:
                throw new CrtError("Unknown will property code: " + propertyCode);
        }
    }

    if (index != offset + propertyLength) {
        throw new CrtError("??");
    }

    return offset;
}

function decode_connect_packet5(firstByte: number, payload: DataView) : model.ConnectPacketInternal {
    if (firstByte != model.PACKET_TYPE_FIRST_BYTE_CONNECT) {
        throw new CrtError("5 Connect packet received with invalid first byte");
    }

    let connect : model.ConnectPacketInternal = {
        type: mqtt5_packet.PacketType.Connect,
        keepAliveIntervalSeconds: 0,
        clientId: "",
        cleanStart: false
    };

    let index: number = 0;
    let protocol: string = "";

    [protocol, index] = decoder.decode_length_prefixed_string(payload, index);
    if (protocol != "MQTT") {
        throw new CrtError("Connect packet received with invalid protocol");
    }

    let protocolVersion: number = 0;
    [protocolVersion, index] = decoder.decode_u8(payload, index);
    if (protocolVersion != 5) {
        throw new CrtError("Connect packet received with non-311 protocol version");
    }

    let flags: number = 0;
    [flags, index] = decoder.decode_u8(payload, index);

    if (flags & model.CONNECT_FLAGS_CLEAN_SESSION) {
        connect.cleanStart = true;
    }

    [connect.keepAliveIntervalSeconds, index] = decoder.decode_u16(payload, index);

    let propertiesLength: number = 0;
    [propertiesLength, index] = decoder.decode_vli(payload, index);

    index = decode_connect_properties(connect, payload, index, propertiesLength);

    [connect.clientId, index] = decoder.decode_length_prefixed_string(payload, index);

    if (flags & model.CONNECT_FLAGS_HAS_WILL) {
        // @ts-ignore
        let will : model.PublishPacketInternal =  {
            type: mqtt5_packet.PacketType.Publish,
        };

        let willPropertiesLength: number = 0;
        [willPropertiesLength, index] = decoder.decode_vli(payload, index);

        index = decode_will_properties(connect, will, payload, index, willPropertiesLength);

        [will.topicName, index] = decoder.decode_length_prefixed_string(payload, index);
        [will.payload, index] = decoder.decode_length_prefixed_bytes(payload, index);
        will.qos = (flags >> model.CONNECT_FLAGS_QOS_SHIFT) & model.QOS_MASK;

        connect.will = will;
    }

    if (flags & model.CONNECT_FLAGS_HAS_USERNAME) {
        [connect.username, index] = decoder.decode_length_prefixed_string(payload, index);
    }

    if (flags & model.CONNECT_FLAGS_HAS_PASSWORD) {
        [connect.password, index] = decoder.decode_length_prefixed_bytes(payload, index);
    }

    if (index != payload.byteLength) {
        throw new CrtError("??");
    }

    return connect;
}

function apply_debug_decoders_to_decoding_function_set(decoders: decoder.DecodingFunctionSet, mode: model.ProtocolMode) {

    switch(mode) {
        case model.ProtocolMode.Mqtt5:
            decoders.set(mqtt5_packet.PacketType.Pingreq, (firstByte, payload) => { return decode_pingreq_packet(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Subscribe, (firstByte, payload) => { return decode_subscribe_packet5(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Unsubscribe, (firstByte, payload) => { return decode_unsubscribe_packet5(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Connect, (firstByte, payload) => { return decode_connect_packet5(firstByte, payload); });
            return;

        case model.ProtocolMode.Mqtt311:
            decoders.set(mqtt5_packet.PacketType.Pingreq, (firstByte, payload) => { return decode_pingreq_packet(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Subscribe, (firstByte, payload) => { return decode_subscribe_packet311(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Unsubscribe, (firstByte, payload) => { return decode_unsubscribe_packet311(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Connect, (firstByte, payload) => { return decode_connect_packet311(firstByte, payload); });
            decoders.set(mqtt5_packet.PacketType.Disconnect, (firstByte, payload) => { return decode_disconnect_packet311(firstByte, payload); });
            return;
    }

    throw new CrtError("Unsupported Protocol Mode");
}

function optional_booleans_equal(lhs: boolean | undefined, rhs: boolean | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs == rhs;
    }

    return false;
}

function optional_numbers_equal(lhs: number | undefined, rhs: number | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs == rhs;
    }

    return false;
}

function optional_strings_equal(lhs: string | undefined, rhs: string | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs === rhs;
    }

    return false;
}

function buffers_equal(lhs: ArrayBuffer, rhs: ArrayBuffer) : boolean {
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

function optional_buffers_equal(lhs: ArrayBuffer | undefined, rhs: ArrayBuffer | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return buffers_equal(lhs, rhs);
    }

    return false;
}

function user_properties_equal(lhs: Array<mqtt5_packet.UserProperty> | undefined, rhs: Array<mqtt5_packet.UserProperty> | undefined) : boolean {
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

    return false;
}

function are_connect_packets_equal(lhs: model.ConnectPacketInternal, rhs: model.ConnectPacketInternal) : boolean {
    return optional_booleans_equal(lhs.cleanStart, rhs.cleanStart) &&
        optional_numbers_equal(lhs.topicAliasMaximum, rhs.topicAliasMaximum) &&
        optional_strings_equal(lhs.authenticationMethod, rhs.authenticationMethod) &&
        optional_buffers_equal(lhs.authenticationData, rhs.authenticationData) &&
        optional_numbers_equal(lhs.keepAliveIntervalSeconds, rhs.keepAliveIntervalSeconds) &&
        optional_strings_equal(lhs.clientId, rhs.clientId) &&
        optional_strings_equal(lhs.username, rhs.username) &&
        optional_buffers_equal(binary_as_optional_buffer(lhs.password), binary_as_optional_buffer(rhs.password)) &&
        optional_numbers_equal(lhs.sessionExpiryIntervalSeconds, rhs.sessionExpiryIntervalSeconds) &&
        optional_booleans_equal(lhs.requestResponseInformation, rhs.requestResponseInformation) &&
        optional_booleans_equal(lhs.requestProblemInformation, rhs.requestProblemInformation) &&
        optional_numbers_equal(lhs.receiveMaximum, rhs.receiveMaximum) &&
        optional_numbers_equal(lhs.maximumPacketSizeBytes, rhs.maximumPacketSizeBytes) &&
        optional_numbers_equal(lhs.willDelayIntervalSeconds, rhs.willDelayIntervalSeconds) &&
        are_publish_packets_equal(lhs.will, rhs.will) &&
        user_properties_equal(lhs.userProperties, rhs.userProperties);
}

function are_connack_packets_equal(lhs: model.ConnackPacketInternal, rhs: model.ConnackPacketInternal) : boolean {
    return optional_strings_equal(lhs.authenticationMethod, rhs.authenticationMethod) &&
        optional_buffers_equal(lhs.authenticationData, rhs.authenticationData) &&
        lhs.sessionPresent == rhs.sessionPresent &&
        lhs.reasonCode == rhs.reasonCode &&
        optional_numbers_equal(lhs.sessionExpiryInterval, rhs.sessionExpiryInterval) &&
        optional_numbers_equal(lhs.receiveMaximum, rhs.receiveMaximum) &&
        optional_numbers_equal(lhs.maximumQos, rhs.maximumQos) &&
        optional_booleans_equal(lhs.retainAvailable, rhs.retainAvailable) &&
        optional_numbers_equal(lhs.maximumPacketSize, rhs.maximumPacketSize) &&
        optional_strings_equal(lhs.assignedClientIdentifier, rhs.assignedClientIdentifier) &&
        optional_numbers_equal(lhs.topicAliasMaximum, rhs.topicAliasMaximum) &&
        optional_strings_equal(lhs.reasonString, rhs.reasonString) &&
        optional_booleans_equal(lhs.wildcardSubscriptionsAvailable, rhs.wildcardSubscriptionsAvailable) &&
        optional_booleans_equal(lhs.subscriptionIdentifiersAvailable, rhs.subscriptionIdentifiersAvailable) &&
        optional_booleans_equal(lhs.sharedSubscriptionsAvailable, rhs.sharedSubscriptionsAvailable) &&
        optional_numbers_equal(lhs.serverKeepAlive, rhs.serverKeepAlive) &&
        optional_strings_equal(lhs.responseInformation, rhs.responseInformation) &&
        optional_strings_equal(lhs.serverReference, rhs.serverReference) &&
        user_properties_equal(lhs.userProperties, rhs.userProperties);
}

function binary_as_optional_buffer(source: BinaryData | undefined) : ArrayBuffer | undefined {
    if (source == undefined) {
        return undefined;
    }

    return source as ArrayBuffer;
}

function payload_as_optional_buffer(source: mqtt5_packet.Payload | undefined) : ArrayBuffer | undefined {
    if (source == undefined) {
        return undefined;
    }

    return source as ArrayBuffer;
}

function number_arrays_equal(lhs: Array<number> | undefined, rhs: Array<number> | undefined) : boolean {
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

    return false;
}

function are_publish_packets_equal(lhs: mqtt5_packet.PublishPacket | undefined, rhs: mqtt5_packet.PublishPacket | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs.topicName == rhs.topicName &&
            lhs.qos == rhs.qos &&
            optional_booleans_equal(lhs.retain, rhs.retain) &&
            optional_numbers_equal(lhs.payloadFormat, rhs.payloadFormat) &&
            optional_numbers_equal(lhs.messageExpiryIntervalSeconds, rhs.messageExpiryIntervalSeconds) &&
            optional_numbers_equal(lhs.topicAlias, rhs.topicAlias) &&
            optional_strings_equal(lhs.responseTopic, rhs.responseTopic) &&
            optional_buffers_equal(binary_as_optional_buffer(lhs.correlationData), binary_as_optional_buffer(rhs.correlationData)) &&
            optional_strings_equal(lhs.contentType, rhs.contentType) &&
            optional_buffers_equal(payload_as_optional_buffer(lhs.payload), payload_as_optional_buffer(rhs.payload)) &&
            number_arrays_equal(lhs.subscriptionIdentifiers, rhs.subscriptionIdentifiers) &&
            user_properties_equal(lhs.userProperties, rhs.userProperties);
    }

    return false;
}

function are_publish_internal_packets_equal(lhs: model.PublishPacketInternal | undefined, rhs: model.PublishPacketInternal | undefined) : boolean {
    if (lhs == undefined && rhs == undefined) {
        return true;
    }

    if (lhs != undefined && rhs != undefined) {
        return lhs.packetId == rhs.packetId &&
            lhs.duplicate == rhs.duplicate &&
            are_publish_packets_equal(lhs, rhs);
    }

    return false;
}

function are_puback_packets_equal(lhs: model.PubackPacketInternal, rhs: model.PubackPacketInternal) : boolean {
    return lhs.packetId == rhs.packetId &&
        lhs.reasonCode == rhs.reasonCode &&
        optional_strings_equal(lhs.reasonString, rhs.reasonString) &&
        user_properties_equal(lhs.userProperties, rhs.userProperties);
}

function subscriptions_equal(lhs: Array<mqtt5_packet.Subscription>, rhs: Array<mqtt5_packet.Subscription>) : boolean {
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

        if (!optional_booleans_equal(lhs[i].noLocal, rhs[i].noLocal)) {
            return false;
        }

        if (!optional_booleans_equal(lhs[i].retainAsPublished, rhs[i].retainAsPublished)) {
            return false;
        }

        if (!optional_numbers_equal(lhs[i].retainHandlingType, rhs[i].retainHandlingType)) {
            return false;
        }
    }

    return true;
}

function are_subscribe_packets_equal(lhs: model.SubscribePacketInternal, rhs: model.SubscribePacketInternal) : boolean {
    return lhs.packetId == rhs.packetId &&
        optional_numbers_equal(lhs.subscriptionIdentifier, rhs.subscriptionIdentifier) &&
        subscriptions_equal(lhs.subscriptions, rhs.subscriptions) &&
        user_properties_equal(lhs.userProperties, rhs.userProperties);
}

function are_suback_packets_equal(lhs: model.SubackPacketInternal, rhs: model.SubackPacketInternal) : boolean {
    return lhs.packetId == rhs.packetId &&
        number_arrays_equal(lhs.reasonCodes, rhs.reasonCodes) &&
        optional_strings_equal(lhs.reasonString, rhs.reasonString) &&
        user_properties_equal(lhs.userProperties, rhs.userProperties);
}

function string_arrays_equal(lhs: Array<string>, rhs: Array<string>) : boolean {
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

function are_unsubscribe_packets_equal(lhs: model.UnsubscribePacketInternal, rhs: model.UnsubscribePacketInternal) : boolean {
    return lhs.packetId == rhs.packetId &&
        string_arrays_equal(lhs.topicFilters, rhs.topicFilters) &&
        user_properties_equal(lhs.userProperties, rhs.userProperties);
}

function are_unsuback_packets_equal(lhs: model.UnsubackPacketInternal, rhs: model.UnsubackPacketInternal) : boolean {
    return lhs.packetId == rhs.packetId &&
        number_arrays_equal(lhs.reasonCodes, rhs.reasonCodes) &&
        optional_strings_equal(lhs.reasonString, rhs.reasonString) &&
        user_properties_equal(lhs.userProperties, rhs.userProperties);
}

function are_disconnect_packets_equal(lhs: model.DisconnectPacketInternal, rhs: model.DisconnectPacketInternal) : boolean {
    return lhs.reasonCode == rhs.reasonCode &&
        optional_numbers_equal(lhs.sessionExpiryIntervalSeconds, rhs.sessionExpiryIntervalSeconds) &&
        optional_strings_equal(lhs.reasonString, rhs.reasonString) &&
        optional_strings_equal(lhs.serverReference, rhs.serverReference) &&
        user_properties_equal(lhs.userProperties, rhs.userProperties);
}

function are_packets_equal(lhs: mqtt5_packet.IPacket, rhs: mqtt5_packet.IPacket) : boolean {
    if (lhs.type != rhs.type) {
        return false;
    }

    switch(lhs.type) {
        case mqtt5_packet.PacketType.Pingreq:
        case mqtt5_packet.PacketType.Pingresp:
            return true;

        case mqtt5_packet.PacketType.Connect:
            return are_connect_packets_equal(lhs as model.ConnectPacketInternal, rhs as model.ConnectPacketInternal);

        case mqtt5_packet.PacketType.Connack:
            return are_connack_packets_equal(lhs as model.ConnackPacketInternal, rhs as model.ConnackPacketInternal);

        case mqtt5_packet.PacketType.Publish:
            return are_publish_internal_packets_equal(lhs as model.PublishPacketInternal, rhs as model.PublishPacketInternal);

        case mqtt5_packet.PacketType.Puback:
            return are_puback_packets_equal(lhs as model.PubackPacketInternal, rhs as model.PubackPacketInternal);

        case mqtt5_packet.PacketType.Subscribe:
            return are_subscribe_packets_equal(lhs as model.SubscribePacketInternal, rhs as model.SubscribePacketInternal);

        case mqtt5_packet.PacketType.Suback:
            return are_suback_packets_equal(lhs as model.SubackPacketInternal, rhs as model.SubackPacketInternal);

        case mqtt5_packet.PacketType.Unsubscribe:
            return are_unsubscribe_packets_equal(lhs as model.UnsubscribePacketInternal, rhs as model.UnsubscribePacketInternal);

        case mqtt5_packet.PacketType.Unsuback:
            return are_unsuback_packets_equal(lhs as model.UnsubackPacketInternal, rhs as model.UnsubackPacketInternal);

        case mqtt5_packet.PacketType.Disconnect:
            return are_disconnect_packets_equal(lhs as model.DisconnectPacketInternal, rhs as model.DisconnectPacketInternal);

        default:
            throw new CrtError("Unsupported packet type: " + lhs.type);
    }
}