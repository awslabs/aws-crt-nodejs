/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as encoder from './encoder';
import * as model from "./model";
import * as vli from "./vli";
import {CrtError} from "../error";
import * as mqtt5_packet from '../../common/mqtt5_packet';

function encode_connack_packet311(steps: Array<encoder.EncodingStep>, packet: model.ConnackPacketInternal) {
    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNACK });
    steps.push({ type: encoder.EncodingStepType.U8, value: 0x02 });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.sessionPresent ? 1 : 0 });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.reasonCode });
}

function get_suback_packet_remaining_lengths311(packet: model.SubackPacketInternal) : number {
    return 2 + packet.reasonCodes.length;
}

function encode_suback_packet311(steps: Array<encoder.EncodingStep>, packet: model.SubackPacketInternal) {
    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_SUBACK });
    steps.push({ type: encoder.EncodingStepType.VLI, value: get_suback_packet_remaining_lengths311(packet) });
    steps.push({ type: encoder.EncodingStepType.U16, value: packet.packetId });

    for (let reasonCode of packet.reasonCodes) {
        steps.push({ type: encoder.EncodingStepType.U8, value: reasonCode });
    }
}

function encode_unsuback_packet311(steps: Array<encoder.EncodingStep>, packet: model.UnsubackPacketInternal) {
    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_UNSUBACK });
    steps.push({ type: encoder.EncodingStepType.U8, value: 2 });
    steps.push({ type: encoder.EncodingStepType.U16, value: packet.packetId });
}

function encode_pingresp_packet(steps: Array<encoder.EncodingStep>) {
    steps.push({ type: encoder.EncodingStepType.U16, value: model.PACKET_TYPE_PINGRESP_FULL_ENCODING });
}

function get_connack_packet_remaining_lengths5(packet: model.ConnackPacketInternal) : [number, number] {
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

function encode_connack_properties(steps: Array<encoder.EncodingStep>, packet: model.ConnackPacketInternal) {
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

function encode_connack_packet5(steps: Array<encoder.EncodingStep>, packet: model.ConnackPacketInternal) {
    let [remaining_length, properties_length] = get_connack_packet_remaining_lengths5(packet);

    steps.push({ type: encoder.EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNACK });
    steps.push({ type: encoder.EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.sessionPresent ? 1 : 0 });
    steps.push({ type: encoder.EncodingStepType.U8, value: packet.reasonCode });
    steps.push({ type: encoder.EncodingStepType.VLI, value: properties_length });

    encode_connack_properties(steps, packet);
}

function get_suback_packet_remaining_lengths5(packet: model.SubackPacketInternal) : [number, number] {
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

function encode_suback_properties(steps: Array<encoder.EncodingStep>, packet: model.SubackPacketInternal) {
    if (packet.reasonString) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encoder.encode_required_16bit_array_buffer(steps, packet.reasonString);
    }

    encoder.encode_user_properties(steps, packet.userProperties);
}

function encode_suback_packet5(steps: Array<encoder.EncodingStep>, packet: model.SubackPacketInternal) {
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

function get_unsuback_packet_remaining_lengths5(packet: model.UnsubackPacketInternal) : [number, number] {
    let remaining_length: number = 2; // packet id
    let properties_length: number = encoder.compute_user_properties_length(packet.userProperties);

    if (packet.reasonString) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    remaining_length += properties_length + vli.get_vli_byte_length(properties_length);
    remaining_length += packet.reasonCodes.length;

    return [remaining_length, properties_length];
}

function encode_unsuback_properties(steps: Array<encoder.EncodingStep>, packet: model.UnsubackPacketInternal) {
    if (packet.reasonString) {
        steps.push({ type: encoder.EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encoder.encode_required_16bit_array_buffer(steps, packet.reasonString);
    }

    encoder.encode_user_properties(steps, packet.userProperties);
}

function encode_unsuback_packet5(steps: Array<encoder.EncodingStep>, packet: model.UnsubackPacketInternal) {
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
            encoders.set(mqtt5_packet.PacketType.Connack, (steps, packet) => { encode_connack_packet5(steps, packet as model.ConnackPacketInternal); });
            encoders.set(mqtt5_packet.PacketType.Suback, (steps, packet) => { encode_suback_packet5(steps, packet as model.SubackPacketInternal); });
            encoders.set(mqtt5_packet.PacketType.Unsuback, (steps, packet) => { encode_unsuback_packet5(steps, packet as model.UnsubackPacketInternal); });
            encoders.set(mqtt5_packet.PacketType.Pingresp, (steps, packet) => { encode_pingresp_packet(steps); });
            return;

        case model.ProtocolMode.Mqtt311:
            encoders.set(mqtt5_packet.PacketType.Connack, (steps, packet) => { encode_connack_packet311(steps, packet as model.ConnackPacketInternal); });
            encoders.set(mqtt5_packet.PacketType.Suback, (steps, packet) => { encode_suback_packet311(steps, packet as model.SubackPacketInternal); });
            encoders.set(mqtt5_packet.PacketType.Unsuback, (steps, packet) => { encode_unsuback_packet311(steps, packet as model.UnsubackPacketInternal); });
            encoders.set(mqtt5_packet.PacketType.Pingresp, (steps, packet) => { encode_pingresp_packet(steps); });
            return;
    }

    throw new CrtError("Unsupported Protocol Moder");
}