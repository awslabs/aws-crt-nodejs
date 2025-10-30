/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import * as model from "./model";
import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as vli from "./vli";

/**
 * The encoder works similarly to the native MQTT5 client in aws-c-mqtt:
 *
 * Encoding is a two-step process.
 *
 * The first step takes the finalized packet and pushes one or more "steps"
 * onto a queue.  Each step represents the encoding of a single primitive integer or range of bytes.
 *
 * The second step involves iterating the encoding steps and performing them on a mutable buffer that represents
 * a range of bytes to write to the socket.
 *
 * If the buffer fills up, encoding is halted (byte ranges are clipped in place) and the buffer is considered
 * ready to send to the socket.  The client only has one buffer in-flight at once (the write completion callback
 * must be invoked in order to continue encoding).
 *
 * There isn't a pressing need to do it this way other than familiarity (the minimal allocation and hot-buffer
 * properties probably aren't particular impactful in JS).
 */

// Encoding step model and helpers
export enum EncodingStepType {
    U8,
    U16,
    U32,
    VLI,
    BYTES
}

export interface EncodingStep {
    type: EncodingStepType,
    value: number | DataView
}

export function encodeLengthPrefixedArrayBuffer(steps: Array<EncodingStep>, source: ArrayBuffer | undefined) {
    if (source) {
        steps.push({ type: EncodingStepType.U16, value: source.byteLength });
        steps.push({ type: EncodingStepType.BYTES, value: new DataView(source) });
    } else {
        steps.push({ type: EncodingStepType.U16, value: 0 });
    }
}

export function encodeOptionalLengthPrefixedArrayBuffer(steps: Array<EncodingStep>, source: ArrayBuffer | undefined) {
    if (source) {
        steps.push({ type: EncodingStepType.U16, value: source.byteLength });
        steps.push({ type: EncodingStepType.BYTES, value: new DataView(source) });
    }
}

export function encodeRequiredLengthPrefixedArrayBuffer(steps: Array<EncodingStep>, source: ArrayBuffer) {
    steps.push({ type: EncodingStepType.U16, value: source.byteLength });
    steps.push({ type: EncodingStepType.BYTES, value: new DataView(source) });
}

// MQTT 311 packet encoders

function getConnectPacketRemainingLengths311(packet: model.ConnectPacketBinary) : number {
    let size: number = 12; // 0x00, 0x04, "MQTT", 0x04, Flags byte, Keep Alive u16, Client Id Length u16

    if (packet.clientId) {
        size += packet.clientId.byteLength;
    }

    if (packet.will) {
        size += 2 + packet.will.topicName.byteLength;
        size += 2; // payload length which is 16 bit and not a VLI
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

function computeConnectFlags(packet: model.ConnectPacketBinary) : number {
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

function encodeConnectPacket311(steps: Array<EncodingStep>, packet: model.ConnectPacketBinary) {
    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNECT });
    steps.push({ type: EncodingStepType.VLI, value: getConnectPacketRemainingLengths311(packet) });
    steps.push({ type: EncodingStepType.BYTES, value: model.CONNECT_311_PROTOCOL_DATAVIEW });
    steps.push({ type: EncodingStepType.U8, value: computeConnectFlags(packet) });
    steps.push({ type: EncodingStepType.U16, value: packet.keepAliveIntervalSeconds });
    encodeLengthPrefixedArrayBuffer(steps, packet.clientId);

    if (packet.will) {
        encodeLengthPrefixedArrayBuffer(steps, packet.will.topicName);
        encodeLengthPrefixedArrayBuffer(steps, packet.will.payload);
    }

    encodeOptionalLengthPrefixedArrayBuffer(steps, packet.username);
    encodeOptionalLengthPrefixedArrayBuffer(steps, packet.password);
}

function computePublishFlags(packet: model.PublishPacketBinary) {
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

function getPublishPacketRemainingLengths311(packet: model.PublishPacketBinary) : number {
    let size: number = 2 + packet.topicName.byteLength;

    if (packet.qos > 0) {
        size += 2; // packet id
    }

    if (packet.payload) {
        size += packet.payload.byteLength;
    }

    return size;
}

function encodePublishPacket311(steps: Array<EncodingStep>, packet: model.PublishPacketBinary) {
    let flags = computePublishFlags(packet);

    steps.push({ type: EncodingStepType.U8, value: flags | model.PACKET_TYPE_FIRST_BYTE_PUBLISH });
    steps.push({ type: EncodingStepType.VLI, value: getPublishPacketRemainingLengths311(packet) });
    encodeLengthPrefixedArrayBuffer(steps, packet.topicName);

    if (packet.qos > 0) {
        if (packet.packetId) {
            steps.push({type: EncodingStepType.U16, value: packet.packetId});
        } else {
            throw new CrtError("Publish(311) packet with non-zero qos and invalid or missing packet id");
        }
    }

    if (packet.payload && packet.payload.byteLength > 0) {
        steps.push({ type: EncodingStepType.BYTES, value: new DataView(packet.payload) });
    }
}

function encodePubackPacket311(steps: Array<EncodingStep>, packet: model.PubackPacketBinary) {
    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_PUBACK });
    steps.push({ type: EncodingStepType.U8, value: 0x02 });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });
}

function getSubscribePacketRemainingLengths311(packet: model.SubscribePacketBinary) : number {
    let size: number = 2 + packet.subscriptions.length * 3; // 3 == 2 bytes of topic length + 1 byte of qos

    for (let subscription of packet.subscriptions) {
        size += subscription.topicFilter.byteLength;
    }

    return size;
}

function encodeSubscription311(steps: Array<EncodingStep>, subscription: model.SubscriptionBinary) {
    encodeRequiredLengthPrefixedArrayBuffer(steps, subscription.topicFilter);
    steps.push({ type: EncodingStepType.U8, value: subscription.qos });
}

function encodeSubscribePacket311(steps: Array<EncodingStep>, packet: model.SubscribePacketBinary) {
    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_SUBSCRIBE });
    steps.push({ type: EncodingStepType.VLI, value: getSubscribePacketRemainingLengths311(packet) });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    for (let subscription of packet.subscriptions) {
        encodeSubscription311(steps, subscription);
    }
}

function getUnsubscribePacketRemainingLengths311(packet: model.UnsubscribePacketBinary) : number {
    let size: number = 2 + packet.topicFilters.length * 2;

    for (let topicFilter of packet.topicFilters) {
        size += topicFilter.byteLength;
    }

    return size;
}

function encodeUnsubscribePacket311(steps: Array<EncodingStep>, packet: model.UnsubscribePacketBinary) {
    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_UNSUBSCRIBE });
    steps.push({ type: EncodingStepType.VLI, value: getUnsubscribePacketRemainingLengths311(packet) });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    for (let topicFilter of packet.topicFilters) {
        encodeRequiredLengthPrefixedArrayBuffer(steps, topicFilter);
    }
}

function encodePingreqPacket(steps: Array<EncodingStep>) {
    steps.push({ type: EncodingStepType.U16, value: model.PACKET_TYPE_PINGREQ_FULL_ENCODING });
}

function encodeDisconnectPacket311(steps: Array<EncodingStep>, packet: model.DisconnectPacketBinary) {
    steps.push({ type: EncodingStepType.U16, value: model.PACKET_TYPE_DISCONNECT_FULL_ENCODING_311 });
}

// MQTT 5 packet encoders

export function computeUserPropertiesLength(user_properties: Array<model.UserPropertyBinary> | undefined) : number {
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

export function encodeUserProperties(steps: Array<EncodingStep>, user_properties: Array<model.UserPropertyBinary> | undefined) {
    if (!user_properties) {
        return;
    }

    for (let user_property of user_properties) {
        steps.push({ type: EncodingStepType.U8, value: model.USER_PROPERTY_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, user_property.name);
        encodeRequiredLengthPrefixedArrayBuffer(steps, user_property.value);
    }
}

function computeWillPropertiesLength(packet: model.ConnectPacketBinary) : number {
    if (!packet.will) {
        return 0;
    }

    let length : number = computeUserPropertiesLength(packet.will.userProperties);

    if (packet.willDelayIntervalSeconds != undefined) {
        length += 5;
    }

    if (packet.will.payloadFormat != undefined) {
        length += 2;
    }

    if (packet.will.messageExpiryIntervalSeconds != undefined) {
        length += 5;
    }

    if (packet.will.contentType != undefined) {
        length += 3 + packet.will.contentType.byteLength;
    }

    if (packet.will.responseTopic != undefined) {
        length += 3 + packet.will.responseTopic.byteLength;
    }

    if (packet.will.correlationData != undefined) {
        length += 3 + packet.will.correlationData.byteLength;
    }

    return length;
}

function computeConnectPropertiesLength(packet: model.ConnectPacketBinary) : number {
    let length : number = computeUserPropertiesLength(packet.userProperties);

    if (packet.sessionExpiryIntervalSeconds != undefined) {
        length += 5;
    }

    if (packet.receiveMaximum != undefined) {
        length += 3;
    }

    if (packet.maximumPacketSizeBytes != undefined) {
        length += 5;
    }

    if (packet.topicAliasMaximum != undefined) {
        length += 3;
    }

    if (packet.requestResponseInformation != undefined) {
        length += 2;
    }

    if (packet.requestProblemInformation != undefined) {
        length += 2;
    }

    if (packet.authenticationMethod != undefined) {
        length += 3 + packet.authenticationMethod.byteLength;
    }

    if (packet.authenticationData != undefined) {
        length += 3 + packet.authenticationData.byteLength;
    }

    return length;
}

function getConnectPacketRemainingLengths5(packet: model.ConnectPacketBinary) : [number, number, number] {
    let remaining_length: number = 12; // 0x00, 0x04, "MQTT", 0x05, Flags byte, Keep Alive u16, Client Id Length u16
    let properties_length: number = computeConnectPropertiesLength(packet);
    let will_properties_length: number = computeWillPropertiesLength(packet);

    remaining_length += vli.getVliByteLength(properties_length) + properties_length;

    if (packet.clientId) {
        remaining_length += packet.clientId.byteLength;
    }

    if (packet.will) {
        remaining_length += vli.getVliByteLength(will_properties_length) + will_properties_length
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

function encodeConnectProperties(steps: Array<EncodingStep>, packet: model.ConnectPacketBinary) {
    if (packet.sessionExpiryIntervalSeconds != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.sessionExpiryIntervalSeconds });
    }

    if (packet.receiveMaximum != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.RECEIVE_MAXIMUM_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U16, value: packet.receiveMaximum });
    }

    if (packet.maximumPacketSizeBytes != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.MAXIMUM_PACKET_SIZE_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.maximumPacketSizeBytes });
    }

    if (packet.topicAliasMaximum != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.TOPIC_ALIAS_MAXIMUM_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U16, value: packet.topicAliasMaximum });
    }

    if (packet.requestResponseInformation != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.REQUEST_RESPONSE_INFORMATION_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.requestResponseInformation });
    }

    if (packet.requestProblemInformation != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.REQUEST_PROBLEM_INFORMATION_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.requestProblemInformation });
    }

    if (packet.authenticationMethod != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.AUTHENTICATION_METHOD_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.authenticationMethod);
    }

    if (packet.authenticationData != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.AUTHENTICATION_DATA_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.authenticationData);
    }

    encodeUserProperties(steps, packet.userProperties);
}

function encodeWillProperties(steps: Array<EncodingStep>, packet: model.ConnectPacketBinary) {
    if (!packet.will) {
        return;
    }

    if (packet.willDelayIntervalSeconds != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.WILL_DELAY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.willDelayIntervalSeconds });
    }

    if (packet.will.payloadFormat != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.PAYLOAD_FORMAT_INDICATOR_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.will.payloadFormat });
    }

    if (packet.will.messageExpiryIntervalSeconds != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.MESSAGE_EXPIRY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.will.messageExpiryIntervalSeconds });
    }

    if (packet.will.contentType != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.CONTENT_TYPE_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.will.contentType);
    }

    if (packet.will.responseTopic != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.RESPONSE_TOPIC_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.will.responseTopic);
    }

    if (packet.will.correlationData != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.CORRELATION_DATA_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.will.correlationData);
    }

    encodeUserProperties(steps, packet.will.userProperties);
}

function encodeConnectPacket5(steps: Array<EncodingStep>, packet: model.ConnectPacketBinary) {
    let [remaining_length, properties_length, will_properties_length] = getConnectPacketRemainingLengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_CONNECT });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: EncodingStepType.BYTES, value: model.CONNECT_5_PROTOCOL_DATAVIEW });
    steps.push({ type: EncodingStepType.U8, value: computeConnectFlags(packet) });
    steps.push({ type: EncodingStepType.U16, value: packet.keepAliveIntervalSeconds });

    steps.push({ type: EncodingStepType.VLI, value: properties_length });
    encodeConnectProperties(steps, packet);

    encodeLengthPrefixedArrayBuffer(steps, packet.clientId);

    if (packet.will) {
        steps.push({type: EncodingStepType.VLI, value: will_properties_length});
        encodeWillProperties(steps, packet);

        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.will.topicName);
        encodeLengthPrefixedArrayBuffer(steps, packet.will.payload);
    }

    encodeOptionalLengthPrefixedArrayBuffer(steps, packet.username);
    encodeOptionalLengthPrefixedArrayBuffer(steps, packet.password);
}

function getPublishPacketRemainingLengths5(packet: model.PublishPacketBinary) : [number, number] {
    let remaining_length: number = 2 + packet.topicName.byteLength;
    if (packet.qos != 0) {
        remaining_length += 2;
    }

    let properties_length: number = 0;

    if (packet.payloadFormat != undefined) {
        properties_length += 2;
    }

    if (packet.messageExpiryIntervalSeconds != undefined) {
        properties_length += 5;
    }

    if (packet.topicAlias != undefined) {
        properties_length += 3;
    }

    if (packet.responseTopic != undefined) {
        properties_length += 3 + packet.responseTopic.byteLength;
    }

    if (packet.correlationData != undefined) {
        properties_length += 3 + packet.correlationData.byteLength;
    }

    if (packet.subscriptionIdentifiers != undefined) {
        properties_length += packet.subscriptionIdentifiers.length; // each identifier is a separate property entry
        for (let subscription_identifier of packet.subscriptionIdentifiers) {
            properties_length += vli.getVliByteLength(subscription_identifier);
        }
    }

    if (packet.contentType != undefined) {
        properties_length += 3 + packet.contentType.byteLength;
    }

    properties_length += computeUserPropertiesLength(packet.userProperties);

    remaining_length += properties_length + vli.getVliByteLength(properties_length);
    if (packet.payload) {
        remaining_length += packet.payload.byteLength;
    }

    return [remaining_length, properties_length];
}

function encodePublishPacketProperties(steps: Array<EncodingStep>, packet: model.PublishPacketBinary) {
    if (packet.payloadFormat != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.PAYLOAD_FORMAT_INDICATOR_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U8, value: packet.payloadFormat });
    }

    if (packet.messageExpiryIntervalSeconds != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.MESSAGE_EXPIRY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.messageExpiryIntervalSeconds });
    }

    if (packet.topicAlias != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.TOPIC_ALIAS_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U16, value: packet.topicAlias });
    }

    if (packet.responseTopic != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.RESPONSE_TOPIC_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.responseTopic);
    }

    if (packet.correlationData != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.CORRELATION_DATA_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.correlationData);
    }

    if (packet.subscriptionIdentifiers != undefined) {
        for (let subscription_identifier of packet.subscriptionIdentifiers) {
            steps.push({ type: EncodingStepType.U8, value: model.SUBSCRIPTION_IDENTIFIER_PROPERTY_CODE });
            steps.push({ type: EncodingStepType.VLI, value: subscription_identifier });
        }
    }

    if (packet.contentType != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.CONTENT_TYPE_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.contentType);
    }

    encodeUserProperties(steps, packet.userProperties);
}

function encodePublishPacket5(steps: Array<EncodingStep>, packet: model.PublishPacketBinary) {
    let [remaining_length, properties_length] = getPublishPacketRemainingLengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_PUBLISH | computePublishFlags(packet) });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });
    encodeRequiredLengthPrefixedArrayBuffer(steps, packet.topicName);

    if (packet.qos > 0) {
        if (packet.packetId) {
            steps.push({type: EncodingStepType.U16, value: packet.packetId});
        } else {
            throw new CrtError("Publish(5) packet with non-zero qos and invalid or missing packet id");
        }
    }

    steps.push({ type: EncodingStepType.VLI, value: properties_length });
    encodePublishPacketProperties(steps, packet);

    if (packet.payload && packet.payload.byteLength > 0) {
        steps.push({ type: EncodingStepType.BYTES, value: new DataView(packet.payload) });
    }
}

function getPubackPacketRemainingLengths5(packet: model.PubackPacketBinary) : [number, number] {
    let remaining_length: number = 3; // packet id + reason code
    let properties_length: number = 0;

    if (packet.reasonString != undefined) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    properties_length += computeUserPropertiesLength(packet.userProperties);

    // note that the caller will adjust this down to 2 if the properties_length is 0 and the reason code is success
    remaining_length += properties_length + vli.getVliByteLength(properties_length);

    return [remaining_length, properties_length];
}

function encodePubackProperties(steps: Array<EncodingStep>, packet: model.PubackPacketBinary) {
    if (packet.reasonString != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.reasonString);
    }

    encodeUserProperties(steps, packet.userProperties);
}

function encodePubackPacket5(steps: Array<EncodingStep>, packet: model.PubackPacketBinary) {
    let [remaining_length, properties_length] = getPubackPacketRemainingLengths5(packet);
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
    encodePubackProperties(steps, packet);
}

function getSubscribePacketRemainingLengths5(packet: model.SubscribePacketBinary) : [number, number] {
    let remaining_length: number = 2; // packet id
    let properties_length: number = 0;

    if (packet.subscriptionIdentifier != undefined) {
        properties_length += 1 + vli.getVliByteLength(packet.subscriptionIdentifier);
    }

    properties_length += computeUserPropertiesLength(packet.userProperties);

    remaining_length += properties_length + vli.getVliByteLength(properties_length);

    for (let subscription of packet.subscriptions) {
        remaining_length += 3 + subscription.topicFilter.byteLength;
    }

    return [remaining_length, properties_length];
}

function computeSubscriptionFlags5(subscription: model.SubscriptionBinary) : number {
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

function encodeSubscription5(steps: Array<EncodingStep>, subscription: model.SubscriptionBinary) {
    encodeRequiredLengthPrefixedArrayBuffer(steps, subscription.topicFilter);
    steps.push({ type: EncodingStepType.U8, value: computeSubscriptionFlags5(subscription) });
}

function encodeSubscribeProperties(steps: Array<EncodingStep>, packet: model.SubscribePacketBinary) {
    if (packet.subscriptionIdentifier != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.SUBSCRIPTION_IDENTIFIER_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.VLI, value: packet.subscriptionIdentifier });
    }

    encodeUserProperties(steps, packet.userProperties);
}

function encodeSubscribePacket5(steps: Array<EncodingStep>, packet: model.SubscribePacketBinary) {
    let [remaining_length, properties_length] = getSubscribePacketRemainingLengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_SUBSCRIBE });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    steps.push({ type: EncodingStepType.VLI, value: properties_length });
    encodeSubscribeProperties(steps, packet);

    for (let subscription of packet.subscriptions) {
        encodeSubscription5(steps, subscription);
    }
}

function getUnsubscribePacketRemainingLengths5(packet: model.UnsubscribePacketBinary) : [number, number] {
    let remaining_length: number = 2; // packet id
    let properties_length: number = computeUserPropertiesLength(packet.userProperties);

    remaining_length += properties_length + vli.getVliByteLength(properties_length);

    for (let topic_filter of packet.topicFilters) {
        remaining_length += 2 + topic_filter.byteLength;
    }

    return [remaining_length, properties_length];
}

function encodeUnsubscribeProperties(steps: Array<EncodingStep>, packet: model.UnsubscribePacketBinary) {
    encodeUserProperties(steps, packet.userProperties);
}

function encodeUnsubscribePacket5(steps: Array<EncodingStep>, packet: model.UnsubscribePacketBinary) {
    let [remaining_length, properties_length] = getUnsubscribePacketRemainingLengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_UNSUBSCRIBE });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });
    steps.push({ type: EncodingStepType.U16, value: packet.packetId });

    steps.push({ type: EncodingStepType.VLI, value: properties_length });
    encodeUnsubscribeProperties(steps, packet);

    for (let topic_filter of packet.topicFilters) {
        encodeRequiredLengthPrefixedArrayBuffer(steps, topic_filter);
    }
}

function getDisconnectPacketRemainingLengths5(packet: model.DisconnectPacketBinary) : [number, number] {
    let remaining_length: number = 0;
    let properties_length: number = computeUserPropertiesLength(packet.userProperties);

    if (packet.reasonString != undefined) {
        properties_length += 3 + packet.reasonString.byteLength;
    }

    if (packet.serverReference != undefined) {
        properties_length += 3 + packet.serverReference.byteLength;
    }

    if (packet.sessionExpiryIntervalSeconds != undefined) {
        properties_length += 5;
    }

    if (properties_length > 0) {
        remaining_length += 1 + properties_length + vli.getVliByteLength(properties_length); // include reason code unconditionally
    } else if (packet.reasonCode != mqtt5_packet.DisconnectReasonCode.NormalDisconnection) {
        remaining_length += 1;
    }

    return [remaining_length, properties_length];
}

function encodeDisconnectProperties(steps: Array<EncodingStep>, packet: model.DisconnectPacketBinary) {
    if (packet.reasonString != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.REASON_STRING_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.reasonString);
    }

    if (packet.serverReference != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.SERVER_REFERENCE_PROPERTY_CODE });
        encodeRequiredLengthPrefixedArrayBuffer(steps, packet.serverReference);
    }

    if (packet.sessionExpiryIntervalSeconds != undefined) {
        steps.push({ type: EncodingStepType.U8, value: model.SESSION_EXPIRY_INTERVAL_PROPERTY_CODE });
        steps.push({ type: EncodingStepType.U32, value: packet.sessionExpiryIntervalSeconds });
    }

    encodeUserProperties(steps, packet.userProperties);
}

function encodeDisconnectPacket5(steps: Array<EncodingStep>, packet: model.DisconnectPacketBinary) {
    let [remaining_length, properties_length] = getDisconnectPacketRemainingLengths5(packet);

    steps.push({ type: EncodingStepType.U8, value: model.PACKET_TYPE_FIRST_BYTE_DISCONNECT });
    steps.push({ type: EncodingStepType.VLI, value: remaining_length });

    if (remaining_length > 0) {
        steps.push({ type: EncodingStepType.U8, value: packet.reasonCode });
        if (remaining_length > 1) {
            steps.push({ type: EncodingStepType.VLI, value: properties_length });
            encodeDisconnectProperties(steps, packet);
        }
    }
}

// Encoding Implementation

export type EncodingFunction = (steps: Array<EncodingStep>, packet: model.IPacketBinary) => void;
export type EncodingFunctionSet = Map<mqtt5_packet.PacketType, EncodingFunction>;

// Encoders for packets sent by the client.  Packets sent by the server have encoders defined in the spec file.
export function buildClientEncodingFunctionSet(mode: model.ProtocolMode) : EncodingFunctionSet {
    switch (mode) {
        case model.ProtocolMode.Mqtt311:
            return new Map<mqtt5_packet.PacketType, EncodingFunction>([
                [mqtt5_packet.PacketType.Connect, (steps, packet) => { encodeConnectPacket311(steps, packet as model.ConnectPacketBinary); }],
                [mqtt5_packet.PacketType.Subscribe, (steps, packet) => { encodeSubscribePacket311(steps, packet as model.SubscribePacketBinary); }],
                [mqtt5_packet.PacketType.Unsubscribe, (steps, packet) => { encodeUnsubscribePacket311(steps, packet as model.UnsubscribePacketBinary); }],
                [mqtt5_packet.PacketType.Publish, (steps, packet) => { encodePublishPacket311(steps, packet as model.PublishPacketBinary); }],
                [mqtt5_packet.PacketType.Puback, (steps, packet) => { encodePubackPacket311(steps, packet as model.PubackPacketBinary); }],
                [mqtt5_packet.PacketType.Disconnect, (steps, packet) => { encodeDisconnectPacket311(steps, packet as model.DisconnectPacketBinary); }],
                [mqtt5_packet.PacketType.Pingreq, (steps, packet) => { encodePingreqPacket(steps); }],
            ]);

        case model.ProtocolMode.Mqtt5:
            return new Map<mqtt5_packet.PacketType, EncodingFunction>([
                [mqtt5_packet.PacketType.Connect, (steps, packet) => { encodeConnectPacket5(steps, packet as model.ConnectPacketBinary); }],
                [mqtt5_packet.PacketType.Subscribe, (steps, packet) => { encodeSubscribePacket5(steps, packet as model.SubscribePacketBinary); }],
                [mqtt5_packet.PacketType.Unsubscribe, (steps, packet) => { encodeUnsubscribePacket5(steps, packet as model.UnsubscribePacketBinary); }],
                [mqtt5_packet.PacketType.Publish, (steps, packet) => { encodePublishPacket5(steps, packet as model.PublishPacketBinary); }],
                [mqtt5_packet.PacketType.Puback, (steps, packet) => { encodePubackPacket5(steps, packet as model.PubackPacketBinary); }],
                [mqtt5_packet.PacketType.Disconnect, (steps, packet) => { encodeDisconnectPacket5(steps, packet as model.DisconnectPacketBinary); }],
                [mqtt5_packet.PacketType.Pingreq, (steps, packet) => { encodePingreqPacket(steps); }],
            ]);

    }

    throw new CrtError("Unsupported protocol");
}

function addEncodingSteps(encoders: EncodingFunctionSet, steps: Array<EncodingStep>, packet: model.IPacketBinary) {
    if (steps.length > 0) {
        throw new CrtError("Encoding steps already exist");
    }

    if (!packet.type) {
        throw new CrtError("Undefined packet type for encoding");
    }

    let encoder = encoders.get(packet.type);
    if (!encoder) {
        throw new CrtError("Unsupported packet type for encoding");
    }

    encoder(steps, packet);
}

interface ApplyEncodingStepResult {
    nextBuffer: DataView,
    step?: EncodingStep
}

function applyEncodingStep(buffer: DataView, step: EncodingStep) : ApplyEncodingStepResult {
    switch (step.type) {
        case EncodingStepType.U8:
            buffer.setUint8(0, step.value as number);
            return {
                nextBuffer: new DataView(buffer.buffer, buffer.byteOffset + 1, buffer.byteLength - 1)
            };

        case EncodingStepType.U16:
            buffer.setUint16(0, step.value as number);
            return {
                nextBuffer: new DataView(buffer.buffer, buffer.byteOffset + 2, buffer.byteLength - 2)
            };

        case EncodingStepType.U32:
            buffer.setUint32(0, step.value as number);
            return {
                nextBuffer: new DataView(buffer.buffer, buffer.byteOffset + 4, buffer.byteLength - 4)
            };

        case EncodingStepType.VLI:
            return {
                nextBuffer: vli.encodeVli(buffer, step.value as number)
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
                // ran out of room.  Clip the step.  It's the caller's responsibility to push the clipped step back
                // into the queue.
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
    encodedView?: DataView;
    nextView: DataView;
}

/**
 * Encoder implementation.  All failures are surfaced as exceptions and considered protocol-fatal.
 *
 * The implementation assumes full, stringent validation has been performed prior to encoding (ie all packets are
 * protocol-compliant).
 */
export class Encoder {
    private packet: model.IPacketBinary | null = null;
    private steps: Array<EncodingStep> = new Array<EncodingStep>();
    private currentStep: number = 0;

    constructor(private encoders : EncodingFunctionSet) {
    }

    // called after connection establishment
    reset() {
        this.packet = null;
        this.steps.length = 0;
        this.currentStep = 0;
    }

    // called on new packet ready and previous packet, if any, complete
    initForPacket(packet: model.IPacketBinary) {
        this.packet = packet;
        this.steps.length = 0;
        this.currentStep = 0;
        addEncodingSteps(this.encoders, this.steps, packet);
    }

    service(dest: DataView) : ServiceResult {
        if (!this.packet) {
            return {
                type: ServiceResultType.Complete,
                nextView: dest
            };
        }

        let startingOffset : number = dest.byteOffset;
        let resultType : ServiceResultType = ServiceResultType.Complete;

        while (this.currentStep < this.steps.length) {
            if (dest.byteLength < 4) {
                resultType = ServiceResultType.InProgress;
                break;
            }

            let step_result = applyEncodingStep(dest, this.steps[this.currentStep]);
            dest = step_result.nextBuffer;
            if (step_result.step) {
                this.steps[this.currentStep] = step_result.step;
            } else {
                this.currentStep += 1;
            }
        }

        return {
            type: resultType,
            encodedView: new DataView(dest.buffer, startingOffset, dest.byteOffset - startingOffset),
            nextView: dest
        };
    }
}