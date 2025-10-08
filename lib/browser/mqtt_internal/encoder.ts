/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import * as model from "./model";
import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as vli from "./vli";

enum EncodingStepType {
    U8,
    U16,
    U32,
    VLI,
    BYTES
}

interface EncodingStep {
    type: EncodingStepType,
    value: number | DataView
}

function encode_16bit_array_buffer(steps: Array<EncodingStep>, source: ArrayBuffer | undefined) {
    if (source) {
        steps.push({ type: EncodingStepType.U16, value: source.byteLength });
        steps.push({ type: EncodingStepType.BYTES, value: new DataView(source) });
    } else {
        steps.push({ type: EncodingStepType.U16, value: 0 });
    }
}

function encode_optional_16bit_array_buffer(steps: Array<EncodingStep>, source: ArrayBuffer | undefined) {
    if (source) {
        steps.push({ type: EncodingStepType.U16, value: source.byteLength });
        steps.push({ type: EncodingStepType.BYTES, value: new DataView(source) });
    }
}

function encode_required_16bit_array_buffer(steps: Array<EncodingStep>, source: ArrayBuffer) {
    steps.push({ type: EncodingStepType.U16, value: source.byteLength });
    steps.push({ type: EncodingStepType.BYTES, value: new DataView(source) });
}

function get_connect_packet_remaining_lengths311(packet: model.ConnectPacketInternal) : number {
    let size: number = 12; // 0x00, 0x04, "MQTT", 0x04, Flags byte, Keep Alive u16, Client Id Length u16

    if (packet.clientId) {
        size += packet.clientId.byteLength;
    }

    if (packet.will) {
        size += 2 + packet.will.topicName.byteLength;
        size += 2; // payload length
        if (packet.will.payload) {
            size += packet.will.payload.byteLength;
        }
    }

    if (packet.username) {
        size += 2 + packet.username.byteLength;
    }

    if (packet.password) {
        size += 2 + packet.password.byteLength;
    }

    return size;
}

function compute_connect_flags(packet: model.ConnectPacketInternal) : number {
    let flags: number = 0;

    if (packet.username) {
        flags |= model.CONNECT_FLAGS_HAS_USERNAME;
    }

    if (packet.password) {
        flags |= model.CONNECT_FLAGS_HAS_PASSWORD;
    }

    if (packet.will) {
        flags |= model.CONNECT_FLAGS_HAS_WILL;
        flags |= ((packet.will.qos & model.QOS_MASK) << model.CONNECT_FLAGS_QOS_SHIFT);

        if (packet.will.retain) {
            flags |= model.CONNECT_FLAGS_WILL_RETAIN;
        }
    }

    if (packet.cleanSession) {
        flags |= model.CONNECT_FLAGS_CLEAN_SESSION;
    }

    return flags;
}

function encode_connect_packet311(steps: Array<EncodingStep>, packet: model.ConnectPacketInternal) {
    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNECT });
    steps.push({ type: EncodingStepType.VLI, value: get_connect_packet_remaining_lengths311(packet) });
    steps.push({ type: EncodingStepType.BYTES, value: model.connect311ProtocolDataView });
    steps.push({ type: EncodingStepType.U8, value: compute_connect_flags(packet) });
    steps.push({ type: EncodingStepType.U16, value: packet.keepAliveIntervalSeconds });
    encode_16bit_array_buffer(steps, packet.clientId);

    if (packet.will) {
        encode_16bit_array_buffer(steps, packet.will.topicName);
        encode_16bit_array_buffer(steps, packet.will.payload);
    }

    encode_optional_16bit_array_buffer(steps, packet.username);
    encode_optional_16bit_array_buffer(steps, packet.password);
}

function encode_connack_packet311(steps: Array<EncodingStep>, packet: model.ConnackPacketInternal) {
    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNACK });
    steps.push({ type: EncodingStepType.U8, value: 0x02 });
    steps.push({ type: EncodingStepType.U8, value: packet.sessionPresent ? 1 : 0 });
    steps.push({ type: EncodingStepType.U8, value: packet.reasonCode });
}

function compute_publish_flags(packet: model.PublishPacketInternal) {
    let flags: number = 0;

    flags |= ((packet.qos & model.QOS_MASK) << model.PUBLISH_FLAGS_QOS_SHIFT);

    if (packet.retain) {
        flags |= model.PUBLISH_FLAGS_RETAIN;
    }

    if (packet.duplicate) {
        flags |= model.PUBLISH_FLAGS_DUPLICATE;
    }

    return flags;
}

function get_publish_packet_remaining_lengths311(packet: model.PublishPacketInternal) : number {
    let size: number = 2 + packet.topicName.byteLength;

    if (packet.qos > 0) {
        size += 2; // packet id
    }

    if (packet.payload) {
        size += packet.payload.byteLength;
    }

    return size;
}

function encode_publish_packet311(steps: Array<EncodingStep>, packet: model.PublishPacketInternal) {
    let flags = compute_publish_flags(packet);

    steps.push({ type: EncodingStepType.U8, value: flags | model.PACKET_TYPE_FIRST_BYTE_PUBLISH });
    steps.push({ type: EncodingStepType.VLI, value: get_publish_packet_remaining_lengths311(packet) });
    encode_16bit_array_buffer(steps, packet.topicName);

    if (packet.qos > 0) {
        steps.push({ type: EncodingStepType.U16, value: packet.packetId });
    }

    if (packet.payload && packet.payload.byteLength > 0) {
        steps.push({ type: EncodingStepType.BYTES, value: new DataView(packet.payload) });
    }
}

function encode_puback_packet311(steps: Array<EncodingStep>, packet: model.PubackPacketInternal) {
    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_PUBACK });
    steps.push({ type: EncodingStepType.U8, value: 0x02 });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });
}

function get_subscribe_packet_remaining_lengths311(packet: model.SubscribePacketInternal) : number {
    let size: number = 2 + packet.subscriptions.length * 3; // 3 == 2 bytes of topic length + 1 byte of qos

    for (let subscription of packet.subscriptions) {
        size += subscription.topicFilter.byteLength;
    }

    return size;
}

function encode_subscription311(steps: Array<EncodingStep>, subscription: model.SubscriptionInternal) {
    encode_required_16bit_array_buffer(steps, subscription.topicFilter);
    steps.push({ type: EncodingStepType.U8, value: subscription.qos });
}

function encode_subscribe_packet311(steps: Array<EncodingStep>, packet: model.SubscribePacketInternal) {
    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_SUBSCRIBE });
    steps.push({ type: EncodingStepType.VLI, value: get_subscribe_packet_remaining_lengths311(packet) });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    for (let subscription of packet.subscriptions) {
        encode_subscription311(steps, subscription);
    }
}

function get_suback_packet_remaining_lengths311(packet: model.SubackPacketInternal) : number {
    return 2 + packet.reasonCodes.length;
}

function encode_suback_packet311(steps: Array<EncodingStep>, packet: model.SubackPacketInternal) {
    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_SUBACK });
    steps.push({ type: EncodingStepType.VLI, value: get_suback_packet_remaining_lengths311(packet) });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    for (let reasonCode of packet.reasonCodes) {
        steps.push({ type: EncodingStepType.U8, value: reasonCode });
    }
}

function get_unsubscribe_packet_remaining_lengths311(packet: model.UnsubscribePacketInternal) : number {
    let size: number = 2 + packet.topicFilters.length * 2;

    for (let topicFilter of packet.topicFilters) {
        size += topicFilter.byteLength;
    }

    return size;
}

function encode_unsubscribe_packet311(steps: Array<EncodingStep>, packet: model.UnsubscribePacketInternal) {
    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_UNSUBSCRIBE });
    steps.push({ type: EncodingStepType.VLI, value: get_unsubscribe_packet_remaining_lengths311(packet) });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    for (let topicFilter of packet.topicFilters) {
        encode_required_16bit_array_buffer(steps, topicFilter);
    }
}

function encode_unsuback_packet311(steps: Array<EncodingStep>, packet: model.UnsubackPacketInternal) {
    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_UNSUBACK });
    steps.push({ type: EncodingStepType.U8, value: 2 });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });
}

function encode_pingreq_packet(steps: Array<EncodingStep>) {
    steps.push({ type: EncodingStepType.U16, value: model.PACKET_TYPE_PINGREQ_FULL_ENCODING });
}

function encode_pingresp_packet(steps: Array<EncodingStep>) {
    steps.push({ type: EncodingStepType.U16, value: model.PACKET_TYPE_PINGRESP_FULL_ENCODING });
}

function encode_disconnect_packet311(steps: Array<EncodingStep>, packet: model.DisconnectPacketInternal) {
    steps.push({ type: EncodingStepType.U16, value: model.PACKET_TYPE_DISCONNECT_FULL_ENCODING_311 });
}

function add_encoding_steps311(steps: Array<EncodingStep>, packet: model.IPacketInternal) {
    switch(packet.type) {
        case mqtt5_packet.PacketType.Connect:
            encode_connect_packet311(steps, packet as model.ConnectPacketInternal);
            break;
        case mqtt5_packet.PacketType.Connack:
            encode_connack_packet311(steps, packet as model.ConnackPacketInternal);
            break;
        case mqtt5_packet.PacketType.Publish:
            encode_publish_packet311(steps, packet as model.PublishPacketInternal);
            break;
        case mqtt5_packet.PacketType.Puback:
            encode_puback_packet311(steps, packet as model.PubackPacketInternal);
            break;
        case mqtt5_packet.PacketType.Subscribe:
            encode_subscribe_packet311(steps, packet as model.SubscribePacketInternal);
            break;
        case mqtt5_packet.PacketType.Suback:
            encode_suback_packet311(steps, packet as model.SubackPacketInternal);
            break;
        case mqtt5_packet.PacketType.Unsubscribe:
            encode_unsubscribe_packet311(steps, packet as model.UnsubscribePacketInternal);
            break;
        case mqtt5_packet.PacketType.Unsuback:
            encode_unsuback_packet311(steps, packet as model.UnsubackPacketInternal);
            break;
        case mqtt5_packet.PacketType.Pingreq:
            encode_pingreq_packet(steps);
            break;
        case mqtt5_packet.PacketType.Pingresp:
            encode_pingresp_packet(steps);
            break;
        case mqtt5_packet.PacketType.Disconnect:
            encode_disconnect_packet311(steps, packet as model.DisconnectPacketInternal);
            break;
        default:
            throw new CrtError("Unsupported packet type");
    }
}

function compute_user_properties_length(user_properties: Array<model.UserPropertyInternal> | undefined) : number {
    if (!user_properties) {
        return 0;
    }

    let length : number = 0;
    for (let property of user_properties) {
        // 5 = 1 for property code + 2 for name length + 2 for value length
        length += 5 + property.name.byteLength + property.value.byteLength;
    }

    return length;
}

function compute_will_properties_length(packet: model.ConnectPacketInternal) : number {
    if (!packet.will) {
        return 0;
    }

    let length : number = compute_user_properties_length(packet.will.userProperties);

    if (packet.willDelayIntervalSeconds) {
        length += 5;
    }

    if (packet.will.payloadFormat) {
        length += 2;
    }

    if (packet.will.messageExpiryIntervalSeconds) {
        length += 5;
    }

    if (packet.will.contentType) {
        length += 3 + packet.will.contentType.byteLength;
    }

    if (packet.will.responseTopic) {
        length += 3 + packet.will.responseTopic.byteLength;
    }

    if (packet.will.correlationData) {
        length += 3 + packet.will.correlationData.byteLength;
    }

    return length;
}

function compute_connect_properties_length(packet: model.ConnectPacketInternal) : number {
    let length : number = compute_user_properties_length(packet.userProperties);

    if (packet.sessionExpiryIntervalSeconds) {
        length += 5;
    }

    if (packet.receiveMaximum) {
        length += 3;
    }

    if (packet.maximumPacketSizeBytes) {
        length += 5;
    }

    if (packet.topicAliasMaximum) {
        length += 3;
    }

    if (packet.requestResponseInformation) {
        length += 2;
    }

    if (packet.requestProblemInformation) {
        length += 2;
    }

    if (packet.authenticationMethod) {
        length += 3 + packet.authenticationMethod.byteLength;
    }

    if (packet.authenticationData) {
        length += 3 + packet.authenticationData.byteLength;
    }

    return length;
}

function get_connect_packet_remaining_lengths5(packet: model.ConnectPacketInternal) : [number, number, number] {
    let remaining_length: number = 12; // 0x00, 0x04, "MQTT", 0x05, Flags byte, Keep Alive u16, Client Id Length u16
    let properties_length: number = compute_connect_properties_length(packet);
    let will_properties_length: number = compute_will_properties_length(packet);

    remaining_length += vli.get_vli_byte_length(properties_length) + properties_length;

    if (packet.clientId) {
        remaining_length += packet.clientId.byteLength;
    }

    if (packet.will) {
        remaining_length += vli.get_vli_byte_length(will_properties_length) + will_properties_length
        remaining_length += 2 + packet.will.topicName.byteLength;
        remaining_length += 2; // payload length
        if (packet.will.payload) {
            remaining_length += packet.will.payload.byteLength;
        }
    }

    if (packet.username) {
        remaining_length += 2 + packet.username.byteLength;
    }

    if (packet.password) {
        remaining_length += 2 + packet.password.byteLength;
    }

    return [remaining_length, properties_length, will_properties_length];
}

function encode_user_properties(steps: Array<EncodingStep>, user_properties: Array<model.UserPropertyInternal> | undefined) {
    if (!user_properties) {
        return;
    }

    for (let user_property of user_properties) {
        steps.push({ type: EncodingStepType.U8, value: model.USER_PROPERTY_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, user_property.name);
        encode_required_16bit_array_buffer(steps, user_property.value);
    }
}

function encode_connect_properties(steps: Array<EncodingStep>, packet: model.ConnectPacketInternal) {
    if (packet.sessionExpiryIntervalSeconds) {
        steps.push({ type: EncodingStepType.U8, value: model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.sessionExpiryIntervalSeconds });
    }

    if (packet.receiveMaximum) {
        steps.push({ type: EncodingStepType.U8, value: model.RECEIVE_MAXIMUM_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U16, value: packet.receiveMaximum });
    }

    if (packet.maximumPacketSizeBytes) {
        steps.push({ type: EncodingStepType.U8, value: model.MAXIMUM_PACKET_SIZE_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.maximumPacketSizeBytes });
    }

    if (packet.topicAliasMaximum) {
        steps.push({ type: EncodingStepType.U8, value: model.TOPIC_ALIAS_MAXIMUM_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U16, value: packet.topicAliasMaximum });
    }

    if (packet.requestResponseInformation) {
        steps.push({ type: EncodingStepType.U8, value: model.REQUEST_RESPONSE_INFORMATION_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.requestResponseInformation });
    }

    if (packet.requestProblemInformation) {
        steps.push({ type: EncodingStepType.U8, value: model.REQUEST_PROBLEM_INFORMATION_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.requestProblemInformation });
    }

    if (packet.authenticationMethod) {
        steps.push({ type: EncodingStepType.U8, value: model.AUTHENTICATION_METHOD_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.authenticationMethod);
    }

    if (packet.authenticationData) {
        steps.push({ type: EncodingStepType.U8, value: model.AUTHENTICATION_DATA_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.authenticationData);
    }

    encode_user_properties(steps, packet.userProperties);
}

function encode_will_properties(steps: Array<EncodingStep>, packet: model.ConnectPacketInternal) {
    if (!packet.will) {
        return;
    }

    if (packet.willDelayIntervalSeconds) {
        steps.push({ type: EncodingStepType.U8, value: model.WILL_DELAY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.willDelayIntervalSeconds });
    }

    if (packet.will.payloadFormat) {
        steps.push({ type: EncodingStepType.U8, value: model.PAYLOAD_FORMAT_INDICATOR_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.will.payloadFormat });
    }

    if (packet.will.messageExpiryIntervalSeconds) {
        steps.push({ type: EncodingStepType.U8, value: model.MESSAGE_EXPIRY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.will.messageExpiryIntervalSeconds });
    }

    if (packet.will.contentType) {
        steps.push({ type: EncodingStepType.U8, value: model.CONTENT_TYPE_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.will.contentType);
    }

    if (packet.will.responseTopic) {
        steps.push({ type: EncodingStepType.U8, value: model.RESPONSE_TOPIC_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.will.responseTopic);
    }

    if (packet.will.correlationData) {
        steps.push({ type: EncodingStepType.U8, value: model.CORRELATION_DATA_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.will.correlationData);
    }

    encode_user_properties(steps, packet.will.userProperties);
}

function encode_connect_packet5(steps: Array<EncodingStep>, packet: model.ConnectPacketInternal) {
    let [remaining_length, properties_length, will_properties_length] = get_connect_packet_remaining_lengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNECT });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: EncodingStepType.BYTES, value: model.connect5ProtocolDataView });
    steps.push({ type: EncodingStepType.U8, value: compute_connect_flags(packet) });
    steps.push({ type: EncodingStepType.U16, value: packet.keepAliveIntervalSeconds });

    steps.push({ type: EncodingStepType.VLI, value: properties_length });
    encode_connect_properties(steps, packet);

    encode_16bit_array_buffer(steps, packet.clientId);

    if (packet.will) {
        steps.push({type: EncodingStepType.VLI, value: will_properties_length});
        encode_will_properties(steps, packet);

        encode_required_16bit_array_buffer(steps, packet.will.topicName);
        encode_16bit_array_buffer(steps, packet.will.payload);
    }

    encode_optional_16bit_array_buffer(steps, packet.username);
    encode_optional_16bit_array_buffer(steps, packet.password);
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

    properties_length += compute_user_properties_length(packet.userProperties);

    remaining_length += vli.get_vli_byte_length(properties_length) + properties_length;

    return [remaining_length, properties_length];
}

function encode_connack_properties(steps: Array<EncodingStep>, packet: model.ConnackPacketInternal) {
    if (packet.sessionExpiryInterval) {
        steps.push({ type: EncodingStepType.U8, value: model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.sessionExpiryInterval });
    }

    if (packet.receiveMaximum) {
        steps.push({ type: EncodingStepType.U8, value: model.RECEIVE_MAXIMUM_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U16, value: packet.receiveMaximum });
    }

    if (packet.maximumQos) {
        steps.push({ type: EncodingStepType.U8, value: model.MAXIMUM_QOS_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.maximumQos });
    }

    if (packet.retainAvailable) {
        steps.push({ type: EncodingStepType.U8, value: model.RETAIN_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.retainAvailable });
    }

    if (packet.maximumPacketSize) {
        steps.push({ type: EncodingStepType.U8, value: model.MAXIMUM_PACKET_SIZE_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.maximumPacketSize });
    }

    if (packet.assignedClientIdentifier) {
        steps.push({ type: EncodingStepType.U8, value: model.ASSIGNED_CLIENT_IDENTIFIER_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.assignedClientIdentifier);
    }

    if (packet.topicAliasMaximum) {
        steps.push({ type: EncodingStepType.U8, value: model.TOPIC_ALIAS_MAXIMUM_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U16, value: packet.topicAliasMaximum });
    }

    if (packet.reasonString) {
        steps.push({ type: EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.reasonString);
    }

    if (packet.wildcardSubscriptionsAvailable) {
        steps.push({ type: EncodingStepType.U8, value: model.WILDCARD_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.wildcardSubscriptionsAvailable });
    }

    if (packet.subscriptionIdentifiersAvailable) {
        steps.push({ type: EncodingStepType.U8, value: model.SUBSCRIPTION_IDENTIFIERS_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.subscriptionIdentifiersAvailable });
    }

    if (packet.sharedSubscriptionsAvailable) {
        steps.push({ type: EncodingStepType.U8, value: model.SHARED_SUBSCRIPTIONS_AVAILABLE_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.sharedSubscriptionsAvailable });
    }

    if (packet.serverKeepAlive) {
        steps.push({ type: EncodingStepType.U8, value: model.SERVER_KEEP_ALIVE_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U16, value: packet.serverKeepAlive });
    }

    if (packet.responseInformation) {
        steps.push({ type: EncodingStepType.U8, value: model.RESPONSE_INFORMATION_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.responseInformation);
    }

    if (packet.serverReference) {
        steps.push({ type: EncodingStepType.U8, value: model.SERVER_REFERENCE_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.serverReference);
    }

    if (packet.authenticationMethod) {
        steps.push({ type: EncodingStepType.U8, value: model.AUTHENTICATION_METHOD_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.authenticationMethod);
    }

    if (packet.authenticationData) {
        steps.push({ type: EncodingStepType.U8, value: model.AUTHENTICATION_DATA_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.authenticationData);
    }

    encode_user_properties(steps, packet.userProperties);
}

function encode_connack_packet5(steps: Array<EncodingStep>, packet: model.ConnackPacketInternal) {
    let [remaining_length, properties_length] = get_connack_packet_remaining_lengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNACK });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: EncodingStepType.U8, value: packet.sessionPresent ? 1 : 0 });
    steps.push({ type: EncodingStepType.U8, value: packet.reasonCode });
    steps.push({ type: EncodingStepType.VLI, value: properties_length });

    encode_connack_properties(steps, packet);
}

function get_publish_packet_remaining_lengths5(packet: model.PublishPacketInternal) : [number, number] {
    let remaining_length: number = 2 + packet.topicName.byteLength;
    if (packet.qos != 0) {
        remaining_length += 2;
    }

    let properties_length: number = 0;

    if (packet.payloadFormat) {
        properties_length += 2;
    }

    if (packet.messageExpiryIntervalSeconds) {
        properties_length += 5;
    }

    if (packet.topicAlias) {
        properties_length += 3;
    }

    if (packet.responseTopic) {
        properties_length += 3 + packet.responseTopic.byteLength;
    }

    if (packet.correlationData) {
        properties_length += 3 + packet.correlationData.byteLength;
    }

    if (packet.subscriptionIdentifiers) {
        properties_length += packet.subscriptionIdentifiers.length; // each identifier is a separate property entry
        for (let subscription_identifier of packet.subscriptionIdentifiers) {
            properties_length += vli.get_vli_byte_length(subscription_identifier);
        }
    }

    if (packet.contentType) {
        properties_length += 3 + packet.contentType.byteLength;
    }

    properties_length += compute_user_properties_length(packet.userProperties);

    remaining_length += properties_length + vli.get_vli_byte_length(properties_length);
    if (packet.payload) {
        remaining_length += packet.payload.byteLength;
    }

    return [remaining_length, properties_length];
}

function encode_publish_packet_properties(steps: Array<EncodingStep>, packet: model.PublishPacketInternal) {
    if (packet.payloadFormat) {
        steps.push({ type: EncodingStepType.U8, value: model.PAYLOAD_FORMAT_INDICATOR_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.payloadFormat });
    }

    if (packet.messageExpiryIntervalSeconds) {
        steps.push({ type: EncodingStepType.U8, value: model.MESSAGE_EXPIRY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.messageExpiryIntervalSeconds });
    }

    if (packet.topicAlias) {
        steps.push({ type: EncodingStepType.U8, value: model.TOPIC_ALIAS_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U16, value: packet.topicAlias });
    }

    if (packet.responseTopic) {
        steps.push({ type: EncodingStepType.U8, value: model.RESPONSE_TOPIC_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.responseTopic);
    }

    if (packet.correlationData) {
        steps.push({ type: EncodingStepType.U8, value: model.CORRELATION_DATA_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.correlationData);
    }

    if (packet.subscriptionIdentifiers) {
        for (let subscription_identifier of packet.subscriptionIdentifiers) {
            steps.push({ type: EncodingStepType.U8, value: model.SUBSCRIPTION_IDENTIFIER_PROPERTY_CODE });
            steps.push({ type: EncodingStepType.VLI, value: subscription_identifier });
        }
    }

    if (packet.contentType) {
        steps.push({ type: EncodingStepType.U8, value: model.CONTENT_TYPE_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.contentType);
    }

    encode_user_properties(steps, packet.userProperties);
}

function encode_publish_packet5(steps: Array<EncodingStep>, packet: model.PublishPacketInternal) {
    let [remaining_length, properties_length] = get_publish_packet_remaining_lengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_PUBLISH | compute_publish_flags(packet) });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });
    encode_required_16bit_array_buffer(steps, packet.topicName);

    if (packet.qos > 0) {
        steps.push({ type: EncodingStepType.U16, value: packet.packetId });
    }

    steps.push({ type: EncodingStepType.VLI, value: properties_length });
    encode_publish_packet_properties(steps, packet);

    if (packet.payload && packet.payload.byteLength > 0) {
        steps.push({ type: EncodingStepType.BYTES, value: new DataView(packet.payload) });
    }
}

function get_puback_packet_remaining_lengths5(packet: model.PubackPacketInternal) : [number, number] {
    let remaining_length: number = 3; // packet id + reason code
    let properties_length: number = 0;

    if (packet.reasonString) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    properties_length += compute_user_properties_length(packet.userProperties);

    // note that the caller will adjust this down to 2 if the properties_length is 0 and the reason code is success
    remaining_length += properties_length + vli.get_vli_byte_length(properties_length);

    return [remaining_length, properties_length];
}

function encode_puback_properties(steps: Array<EncodingStep>, packet: model.PubackPacketInternal) {
    if (packet.reasonString) {
        steps.push({ type: EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.reasonString);
    }

    encode_user_properties(steps, packet.userProperties);
}

function encode_puback_packet5(steps: Array<EncodingStep>, packet: model.PubackPacketInternal) {
    let [remaining_length, properties_length] = get_puback_packet_remaining_lengths5(packet);
    let truncated_packet : boolean = properties_length == 0 && packet.reasonCode == mqtt5_packet.PubackReasonCode.Success;

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_PUBACK });
    if (truncated_packet) {
        steps.push({type: EncodingStepType.U8, value: 0x02});
    } else {
        steps.push({type: EncodingStepType.VLI, value: remaining_length});
    }
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    if (truncated_packet) {
        return;
    }

    steps.push({ type: EncodingStepType.U8, value: packet.reasonCode });

    steps.push({ type: EncodingStepType.VLI, value: properties_length });
    encode_puback_properties(steps, packet);
}

function get_subscribe_packet_remaining_lengths5(packet: model.SubscribePacketInternal) : [number, number] {
    let remaining_length: number = 2; // packet id
    let properties_length: number = 0;

    if (packet.subscriptionIdentifier) {
        properties_length += 1 + vli.get_vli_byte_length(packet.subscriptionIdentifier);
    }

    properties_length += compute_user_properties_length(packet.userProperties);

    remaining_length += properties_length + vli.get_vli_byte_length(properties_length);

    for (let subscription of packet.subscriptions) {
        remaining_length += 3 + subscription.topicFilter.byteLength;
    }

    return [remaining_length, properties_length];
}

function compute_subscription_flags5(subscription: model.SubscriptionInternal) : number {
    let flags : number = subscription.qos;
    if (subscription.noLocal) {
        flags |= model.SUBSCRIPTION_FLAGS_NO_LOCAL;
    }

    if (subscription.retainHandlingType) {
        flags |= (subscription.retainHandlingType << model.SUBSCRIPTION_FLAGS_RETAIN_HANDLING_TYPE_SHIFT);
    }

    if (subscription.retainAsPublished) {
        flags |= model.SUBSCRIPTION_FLAGS_RETAIN_AS_PUBLISHED;
    }

    return flags;
}

function encode_subscription5(steps: Array<EncodingStep>, subscription: model.SubscriptionInternal) {
    encode_required_16bit_array_buffer(steps, subscription.topicFilter);
    steps.push({ type: EncodingStepType.U8, value: compute_subscription_flags5(subscription) });
}

function encode_subscribe_properties(steps: Array<EncodingStep>, packet: model.SubscribePacketInternal) {
    if (packet.subscriptionIdentifier) {
        steps.push({ type: EncodingStepType.U8, value: model.SUBSCRIPTION_IDENTIFIER_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.VLI, value: packet.subscriptionIdentifier });
    }

    encode_user_properties(steps, packet.userProperties);
}

function encode_subscribe_packet5(steps: Array<EncodingStep>, packet: model.SubscribePacketInternal) {
    let [remaining_length, properties_length] = get_subscribe_packet_remaining_lengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_SUBSCRIBE });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    steps.push({ type: EncodingStepType.VLI, value: properties_length });
    encode_subscribe_properties(steps, packet);

    for (let subscription of packet.subscriptions) {
        encode_subscription5(steps, subscription);
    }
}

function get_suback_packet_remaining_lengths5(packet: model.SubackPacketInternal) : [number, number] {
    let remaining_length: number = 2; // packet id
    let properties_length: number = 0;

    if (packet.reasonString) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    properties_length += compute_user_properties_length(packet.userProperties);

    remaining_length += properties_length + vli.get_vli_byte_length(properties_length);
    remaining_length += packet.reasonCodes.length;

    return [remaining_length, properties_length];
}

function encode_suback_properties(steps: Array<EncodingStep>, packet: model.SubackPacketInternal) {
    if (packet.reasonString) {
        steps.push({ type: EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.reasonString);
    }

    encode_user_properties(steps, packet.userProperties);
}

function encode_suback_packet5(steps: Array<EncodingStep>, packet: model.SubackPacketInternal) {
    let [remaining_length, properties_length] = get_suback_packet_remaining_lengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_SUBACK });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    steps.push({ type: EncodingStepType.VLI, value: properties_length });
    encode_suback_properties(steps, packet);

    for (let reason_code of packet.reasonCodes) {
        steps.push({ type: EncodingStepType.U8, value: reason_code });
    }
}

function get_unsubscribe_packet_remaining_lengths5(packet: model.UnsubscribePacketInternal) : [number, number] {
    let remaining_length: number = 2; // packet id
    let properties_length: number = compute_user_properties_length(packet.userProperties);

    remaining_length += properties_length + vli.get_vli_byte_length(properties_length);

    for (let topic_filter of packet.topicFilters) {
        remaining_length += 2 + topic_filter.byteLength;
    }

    return [remaining_length, properties_length];
}

function encode_unsubscribe_properties(steps: Array<EncodingStep>, packet: model.UnsubscribePacketInternal) {
    encode_user_properties(steps, packet.userProperties);
}

function encode_unsubscribe_packet5(steps: Array<EncodingStep>, packet: model.UnsubscribePacketInternal) {
    let [remaining_length, properties_length] = get_unsubscribe_packet_remaining_lengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_UNSUBSCRIBE });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    steps.push({ type: EncodingStepType.VLI, value: properties_length });
    encode_unsubscribe_properties(steps, packet);

    for (let topic_filter of packet.topicFilters) {
        encode_required_16bit_array_buffer(steps, topic_filter);
    }
}

function get_unsuback_packet_remaining_lengths5(packet: model.UnsubackPacketInternal) : [number, number] {
    let remaining_length: number = 2; // packet id
    let properties_length: number = compute_user_properties_length(packet.userProperties);

    if (packet.reasonString) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    remaining_length += properties_length + vli.get_vli_byte_length(properties_length);
    remaining_length += packet.reasonCodes.length;

    return [remaining_length, properties_length];
}

function encode_unsuback_properties(steps: Array<EncodingStep>, packet: model.UnsubackPacketInternal) {
    if (packet.reasonString) {
        steps.push({ type: EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.reasonString);
    }

    encode_user_properties(steps, packet.userProperties);
}

function encode_unsuback_packet5(steps: Array<EncodingStep>, packet: model.UnsubackPacketInternal) {
    let [remaining_length, properties_length] = get_unsuback_packet_remaining_lengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_UNSUBACK });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    steps.push({ type: EncodingStepType.VLI, value: properties_length });
    encode_unsuback_properties(steps, packet);

    for (let reason_code of packet.reasonCodes) {
        steps.push({ type: EncodingStepType.U8, value: reason_code });
    }
}

function get_disconnect_packet_remaining_lengths5(packet: model.DisconnectPacketInternal) : [number, number] {
    let remaining_length: number = 0;
    let properties_length: number = compute_user_properties_length(packet.userProperties);

    if (packet.reasonString) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    if (packet.serverReference) {
        properties_length += 3 + packet.serverReference.byteLength;
    }

    if (packet.sessionExpiryIntervalSeconds) {
        properties_length += 5;
    }

    if (properties_length > 0) {
        remaining_length += 1 + properties_length + vli.get_vli_byte_length(properties_length); // include reason code unconditionally
    } else if (packet.reasonCode != mqtt5_packet.DisconnectReasonCode.NormalDisconnection) {
        remaining_length += 1;
    }

    return [remaining_length, properties_length];
}

function encode_disconnect_properties(steps: Array<EncodingStep>, packet: model.DisconnectPacketInternal) {
    if (packet.reasonString) {
        steps.push({ type: EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.reasonString);
    }

    if (packet.serverReference) {
        steps.push({ type: EncodingStepType.U8, value: model.SERVER_REFERENCE_PROPERTY_CODE });
        encode_required_16bit_array_buffer(steps, packet.serverReference);
    }

    if (packet.sessionExpiryIntervalSeconds) {
        steps.push({ type: EncodingStepType.U8, value: model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.sessionExpiryIntervalSeconds });
    }

    encode_user_properties(steps, packet.userProperties);
}

function encode_disconnect_packet5(steps: Array<EncodingStep>, packet: model.DisconnectPacketInternal) {
    let [remaining_length, properties_length] = get_disconnect_packet_remaining_lengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_DISCONNECT });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });

    if (remaining_length > 0) {
        steps.push({ type: EncodingStepType.U8, value: packet.reasonCode });
        if (remaining_length > 1) {
            steps.push({ type: EncodingStepType.VLI, value: properties_length });
            encode_disconnect_properties(steps, packet);
        }
    }
}

function add_encoding_steps5(steps: Array<EncodingStep>, packet: model.IPacketInternal) {
    switch(packet.type) {
        case mqtt5_packet.PacketType.Connect:
            encode_connect_packet5(steps, packet as model.ConnectPacketInternal);
            break;
        case mqtt5_packet.PacketType.Connack:
            encode_connack_packet5(steps, packet as model.ConnackPacketInternal);
            break;
        case mqtt5_packet.PacketType.Publish:
            encode_publish_packet5(steps, packet as model.PublishPacketInternal);
            break;
        case mqtt5_packet.PacketType.Puback:
            encode_puback_packet5(steps, packet as model.PubackPacketInternal);
            break;
        case mqtt5_packet.PacketType.Subscribe:
            encode_subscribe_packet5(steps, packet as model.SubscribePacketInternal);
            break;
        case mqtt5_packet.PacketType.Suback:
            encode_suback_packet5(steps, packet as model.SubackPacketInternal);
            break;
        case mqtt5_packet.PacketType.Unsubscribe:
            encode_unsubscribe_packet5(steps, packet as model.UnsubscribePacketInternal);
            break;
        case mqtt5_packet.PacketType.Unsuback:
            encode_unsuback_packet5(steps, packet as model.UnsubackPacketInternal);
            break;
        case mqtt5_packet.PacketType.Pingreq:
            encode_pingreq_packet(steps);
            break;
        case mqtt5_packet.PacketType.Pingresp:
            encode_pingresp_packet(steps);
            break;
        case mqtt5_packet.PacketType.Disconnect:
            encode_disconnect_packet5(steps, packet as model.DisconnectPacketInternal);
            break;
        default:
            throw new CrtError("Unsupported packet type");
    }
}

enum ProtocolMode {
    Mqtt311,
    Mqtt5
}

function add_encoding_steps(mode: ProtocolMode, steps: Array<EncodingStep>, packet: model.IPacketInternal) {
    if (steps.length > 0) {
        throw new CrtError("Encoding steps already exist");
    }

    switch (mode) {
        case ProtocolMode.Mqtt311:
            add_encoding_steps311(steps, packet);
            break;

        case ProtocolMode.Mqtt5:
            add_encoding_steps5(steps, packet);
            break;

        default:
            throw new CrtError("Unknown protocol mode");
    }
}

interface ApplyEncodingStepResult {
    nextBuffer: DataView,
    step?: EncodingStep
}

function apply_encoding_step(buffer: DataView, step: EncodingStep) : ApplyEncodingStepResult {
    switch (step.type) {
        case EncodingStepType.U8:
            buffer.setUint8(buffer.byteOffset, step.value as number);
            return {
                nextBuffer: new DataView(buffer.buffer, buffer.byteOffset + 1, buffer.byteLength - 1)
            };

        case EncodingStepType.U16:
            buffer.setUint16(buffer.byteOffset, step.value as number);
            return {
                nextBuffer: new DataView(buffer.buffer, buffer.byteOffset + 2, buffer.byteLength - 2)
            };

        case EncodingStepType.U32:
            buffer.setUint32(buffer.byteOffset, step.value as number);
            return {
                nextBuffer: new DataView(buffer.buffer, buffer.byteOffset + 4, buffer.byteLength - 4)
            };

        case EncodingStepType.VLI:
            return {
                nextBuffer: vli.encode_vli(buffer, step.value as number)
            };

        case EncodingStepType.BYTES:
            let source = step.value as DataView;
            let amountToCopy = Math.min(buffer.byteLength, source.byteLength);

            const destArray = new Uint8Array(buffer.buffer, buffer.byteOffset);
            const sourceArray = new Uint8Array(source.buffer, source.byteOffset, amountToCopy);
            destArray.set(sourceArray);
            let result : ApplyEncodingStepResult = {
                nextBuffer: new DataView(buffer.buffer, buffer.byteOffset + amountToCopy, buffer.byteLength - amountToCopy)
            };
            if (amountToCopy < source.byteLength) {
                result.step = {
                    type: EncodingStepType.BYTES,
                    value: new DataView(source.buffer, source.byteOffset + amountToCopy, source.byteLength - amountToCopy)
                };
            }
            return result;

        default:
            throw new CrtError("Unknown encoding step type");
    }
}

export enum ServiceResultType {
    Complete,
    InProgress
}

export interface ServiceResult {
    type: ServiceResultType;
    nextBuffer: DataView;
}

export class Encoder {
    private packet: model.IPacketInternal | null = null;
    private steps: Array<EncodingStep> = new Array<EncodingStep>();
    private currentStep: number = 0;

    constructor(private mode : ProtocolMode) {
    }

    // called after connection establishment
    reset() {
        this.packet = null;
        this.steps.length = 0;
        this.currentStep = 0;
    }

    // called on new packet ready and previous packet, if any, complete
    init_for_packet(packet: model.IPacketInternal) {
        this.packet = packet;
        this.steps.length = 0;
        this.currentStep = 0;
        add_encoding_steps(this.mode, this.steps, packet);
    }

    service(buffer: DataView) : ServiceResult {
        if (!this.packet) {
            return {
                type: ServiceResultType.Complete,
                nextBuffer: buffer
            };
        }

        while (this.currentStep < this.steps.length) {
            if (buffer.byteLength < 4) {
                return {
                    type: ServiceResultType.InProgress,
                    nextBuffer: buffer
                };
            }

            let step_result = apply_encoding_step(buffer, this.steps[this.currentStep]);
            buffer = step_result.nextBuffer;
            if (step_result.step) {
                this.steps[this.currentStep] = step_result.step;
            } else {
                this.currentStep += 1;
            }
        }

        return {
            type: ServiceResultType.Complete,
            nextBuffer: buffer
        };
    }
}