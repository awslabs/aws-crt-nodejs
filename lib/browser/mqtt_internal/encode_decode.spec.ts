/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import * as decoder from "./decoder";
import * as encoder from "./encoder";
import * as model from "./model";
import * as test_mqtt_internal_client from "@test/mqtt_internal_client";
import * as mqtt5_packet from "../../common/mqtt5_packet";

function appendView(dest: DataView, source: DataView) : DataView {
    if (source.byteLength > dest.byteLength) {
        throw new CrtError("Buffer overrun");
    }

    for (let i = 0; i < source.byteLength; i++) {
        dest.setUint8(i, source.getUint8(i));
    }

    return new DataView(dest.buffer, dest.byteOffset + source.byteLength, dest.byteLength - source.byteLength);
}

function doSingleRoundTripEncodeDecodeTest(packet: mqtt5_packet.IPacket, mode: model.ProtocolMode, packet_count: number, encode_buffer_size: number, decode_view_size: number) {
    let encoder_set = encoder.buildClientEncodingFunctionSet(mode);
    test_mqtt_internal_client.applyDebugEncodersToEncodingFunctionSet(encoder_set, mode);

    let packet_encoder = new encoder.Encoder(encoder_set);

    let decoder_set = decoder.buildClientDecodingFunctionSet(mode);
    test_mqtt_internal_client.applyDebugDecodersToDecodingFunctionSet(decoder_set, mode);

    let packet_decoder = new decoder.Decoder(decoder_set);
    let binary_packet = test_mqtt_internal_client.convertDebugPacketToBinary(packet);

    let stream_destination = new ArrayBuffer(1024 * 1024);
    let stream_view = new DataView(stream_destination);

    let encode_buffer = new ArrayBuffer(encode_buffer_size);
    let encode_view = new DataView(encode_buffer);

    for (let i = 0; i < packet_count; i++) {
        packet_encoder.initForPacket(binary_packet);

        let encode_result_state = encoder.ServiceResultType.InProgress;
        while (encode_result_state != encoder.ServiceResultType.Complete) {
            let encode_result = packet_encoder.service(encode_view);
            encode_result_state = encode_result.type;
            if (encode_result_state == encoder.ServiceResultType.Complete) {
                encode_view = encode_result.nextView;
            } else {
                encode_view = new DataView(encode_buffer);
            }

            if (encode_result.encodedView) {
                stream_view = appendView(stream_view, encode_result.encodedView);
            }
        }
    }

    let packets = new Array<mqtt5_packet.IPacket>();
    let encoded_block = new DataView(stream_destination, 0, stream_view.byteOffset);
    let current_index = 0;
    while (current_index < encoded_block.byteLength) {
        let slice_length = Math.min(decode_view_size, encoded_block.byteLength - current_index);
        let decode_view = new DataView(encoded_block.buffer, current_index, slice_length);
        let decoded_packets = packet_decoder.decode(decode_view);
        for (let packet of decoded_packets) {
            packets.push(packet);
        }

        current_index += decode_view_size;
    }

    expect(packets.length).toBe(packet_count);
    for (let decoded_packet of packets) {
        expect(test_mqtt_internal_client.arePacketsEqual(packet, decoded_packet)).toBe(true);
    }
}

function doFragmentedRoundTripEncodeDecodeTest(packet: mqtt5_packet.IPacket, mode: model.ProtocolMode, packet_count: number) {
    let encode_buffer_sizes = [4, 7, 13, 31, 127, 1027];
    let decode_view_sizes = [1, 2, 3, 5, 9, 17];

    for (let encode_buffer_size of encode_buffer_sizes) {
        for (let decode_view_size of decode_view_sizes) {
            doSingleRoundTripEncodeDecodeTest(packet, mode, packet_count, encode_buffer_size, decode_view_size);
        }
    }
}

test('Pingreq - 311', () => {
    let pingreq : model.PingreqPacketBinary = {
        type: mqtt5_packet.PacketType.Pingreq
    };

    doFragmentedRoundTripEncodeDecodeTest(pingreq, model.ProtocolMode.Mqtt311, 20);
});

test('Pingreq - 5', () => {
    let pingreq : model.PingreqPacketBinary = {
        type: mqtt5_packet.PacketType.Pingreq
    };

    doFragmentedRoundTripEncodeDecodeTest(pingreq, model.ProtocolMode.Mqtt5, 20);
});

test('Pingresp - 311', () => {
    let pingreq : model.PingrespPacketInternal = {
        type: mqtt5_packet.PacketType.Pingreq
    };

    doFragmentedRoundTripEncodeDecodeTest(pingreq, model.ProtocolMode.Mqtt311, 20);
});

test('Pingresp - 5', () => {
    let pingreq : model.PingrespPacketInternal = {
        type: mqtt5_packet.PacketType.Pingreq
    };

    doFragmentedRoundTripEncodeDecodeTest(pingreq, model.ProtocolMode.Mqtt5, 20);
});

test('Puback - 311', () => {
    let puback : model.PubackPacketInternal = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 5,
        reasonCode: mqtt5_packet.PubackReasonCode.Success
    };

    doFragmentedRoundTripEncodeDecodeTest(puback, model.ProtocolMode.Mqtt311, 20);
});

test('Puback - Minimal 5', () => {
    let puback : model.PubackPacketInternal = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 5,
        reasonCode: mqtt5_packet.PubackReasonCode.Success
    };

    doFragmentedRoundTripEncodeDecodeTest(puback, model.ProtocolMode.Mqtt5, 20);
});

test('Puback - Minimal With Non-Zero ReasonCode 5', () => {
    let puback : model.PubackPacketInternal = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 5,
        reasonCode: mqtt5_packet.PubackReasonCode.NotAuthorized
    };

    doFragmentedRoundTripEncodeDecodeTest(puback, model.ProtocolMode.Mqtt5, 20);
});

function createDummyUserProperties() : Array<mqtt5_packet.UserProperty> {
    return new Array<mqtt5_packet.UserProperty>(
        {name: "First", value: "1"},
        {name: "Hello", value: "World"},
        {name: "Pineapple", value: "Sorbet"},
    );
}

test('Puback - Maximal 5', () => {
    let puback : model.PubackPacketInternal = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 37,
        reasonCode: mqtt5_packet.PubackReasonCode.UnspecifiedError,
        reasonString: "LooksFunny",
        userProperties: createDummyUserProperties()
    };

    doFragmentedRoundTripEncodeDecodeTest(puback, model.ProtocolMode.Mqtt5, 20);
});

test('Puback - Maximal Falsy 5', () => {
    let puback : model.PubackPacketInternal = {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 37,
        reasonCode: mqtt5_packet.PubackReasonCode.UnspecifiedError,
        reasonString: "",
        userProperties: createDummyUserProperties()
    };

    doFragmentedRoundTripEncodeDecodeTest(puback, model.ProtocolMode.Mqtt5, 20);
});

test('Publish - Empty Payload 311', () => {
    let publish : model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        qos: mqtt5_packet.QoS.AtMostOnce,
        topicName: "foo/bar",
        duplicate: true,
        retain: true
    };

    doFragmentedRoundTripEncodeDecodeTest(publish, model.ProtocolMode.Mqtt311, 20);
});

test('Publish - With Payload 311', () => {
    let encoder = new TextEncoder();
    let payload = encoder.encode("Something").buffer;

    let publish : model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        packetId: 7,
        qos: mqtt5_packet.QoS.AtLeastOnce,
        topicName: "hello/world",
        duplicate: false,
        retain: false,
        payload: payload
    };

    doFragmentedRoundTripEncodeDecodeTest(publish, model.ProtocolMode.Mqtt311, 20);
});

test('Publish - Minimal Empty Payload 5', () => {
    let publish : model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        qos: mqtt5_packet.QoS.ExactlyOnce,
        packetId: 47,
        topicName: "uff/dah",
        duplicate: true,
        retain: false
    };

    doFragmentedRoundTripEncodeDecodeTest(publish, model.ProtocolMode.Mqtt5, 20);
});

test('Publish - Minimal With Payload 5', () => {
    let encoder = new TextEncoder();
    let payload = encoder.encode("Very Important Data").buffer;

    let publish : model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        qos: mqtt5_packet.QoS.ExactlyOnce,
        packetId: 47,
        topicName: "uff/dah/2",
        duplicate: true,
        retain: false,
        payload: payload
    };

    doFragmentedRoundTripEncodeDecodeTest(publish, model.ProtocolMode.Mqtt5, 20);
});

test('Publish - Maximal Empty Payload 5', () => {
    let publish : model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        qos: mqtt5_packet.QoS.AtMostOnce,
        topicName: "uff/dah",
        duplicate: true,
        retain: false,
        payloadFormat: mqtt5_packet.PayloadFormatIndicator.Utf8,
        messageExpiryIntervalSeconds: 1020,
        topicAlias: 5,
        responseTopic: "uff/dah/accepted",
        subscriptionIdentifiers: new Array<number>(32, 255, 128 * 128 * 128 - 1, 128 * 128 * 128 + 1),
        correlationData: new Uint8Array([1, 2, 3, 4, 5]).buffer,
        contentType: "application/json",
        userProperties: createDummyUserProperties()
    };

    doFragmentedRoundTripEncodeDecodeTest(publish, model.ProtocolMode.Mqtt5, 20);
});

test('Publish - Maximal Empty Payload Falsy 5', () => {
    let publish : model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        qos: mqtt5_packet.QoS.AtMostOnce,
        topicName: "uff/dah",
        duplicate: false,
        retain: false,
        payloadFormat: mqtt5_packet.PayloadFormatIndicator.Bytes,
        messageExpiryIntervalSeconds: 0,
        topicAlias: 0, // protocol error, but doesn't matter here
        responseTopic: "",
        subscriptionIdentifiers: new Array<number>(0, 255, 128 * 128 * 128 - 1, 128 * 128 * 128 + 1),
        correlationData: new Uint8Array([]).buffer,
        contentType: "",
        userProperties: createDummyUserProperties()
    };

    doFragmentedRoundTripEncodeDecodeTest(publish, model.ProtocolMode.Mqtt5, 20);
});

test('Publish - Maximal With Payload 5', () => {
    let encoder = new TextEncoder();
    let payload = encoder.encode("Very Important Data").buffer;

    let publish : model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        qos: mqtt5_packet.QoS.ExactlyOnce,
        packetId: 47,
        topicName: "uff/dah/api",
        duplicate: false,
        retain: true,
        payload: payload,
        payloadFormat: mqtt5_packet.PayloadFormatIndicator.Bytes,
        messageExpiryIntervalSeconds: 53281,
        topicAlias: 2,
        responseTopic: "uff/dah/rejected",
        subscriptionIdentifiers: new Array<number>(1, 128 * 128 * 128 - 1, 128 * 128 * 128 + 1, 255),
        correlationData: new Uint8Array([5, 4, 3, 2, 1]).buffer,
        contentType: "application/xml",
        userProperties: createDummyUserProperties()
    };

    doFragmentedRoundTripEncodeDecodeTest(publish, model.ProtocolMode.Mqtt5, 20);
});

test('Publish - Maximal With Payload Falsy 5', () => {
    let payload = new Uint8Array([0]).buffer;

    let publish : model.PublishPacketInternal = {
        type: mqtt5_packet.PacketType.Publish,
        qos: mqtt5_packet.QoS.ExactlyOnce,
        packetId: 47,
        topicName: "",
        duplicate: false,
        retain: true,
        payload: payload,
        payloadFormat: mqtt5_packet.PayloadFormatIndicator.Bytes,
        messageExpiryIntervalSeconds: 0,
        topicAlias: 2,
        responseTopic: "",
        subscriptionIdentifiers: new Array<number>(),
        correlationData: new Uint8Array([]).buffer,
        contentType: "",
        userProperties: new Array<mqtt5_packet.UserProperty>()
    };

    doFragmentedRoundTripEncodeDecodeTest(publish, model.ProtocolMode.Mqtt5, 20);
});

test('Disconnect - 311', () => {
    let disconnect : model.DisconnectPacketInternal = {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection,
    };

    doFragmentedRoundTripEncodeDecodeTest(disconnect, model.ProtocolMode.Mqtt311, 20);
});

test('Disconnect - Minimal zero reason code 5', () => {
    let disconnect : model.DisconnectPacketInternal = {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection,
    };

    doFragmentedRoundTripEncodeDecodeTest(disconnect, model.ProtocolMode.Mqtt5, 20);
});

test('Disconnect - Minimal non-zero reason code 5', () => {
    let disconnect : model.DisconnectPacketInternal = {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: mqtt5_packet.DisconnectReasonCode.KeepAliveTimeout,
    };

    doFragmentedRoundTripEncodeDecodeTest(disconnect, model.ProtocolMode.Mqtt5, 20);
});

test('Disconnect - Maximal 5', () => {
    let disconnect : model.DisconnectPacketInternal = {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection,
        reasonString: "Looks funny",
        serverReference: "Somewhere else",
        sessionExpiryIntervalSeconds: 255,
        userProperties: createDummyUserProperties()
    };

    doFragmentedRoundTripEncodeDecodeTest(disconnect, model.ProtocolMode.Mqtt5, 20);
});

test('Disconnect - Maximal Falsy 5', () => {
    let disconnect : model.DisconnectPacketInternal = {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: mqtt5_packet.DisconnectReasonCode.DisconnectWithWillMessage,
        reasonString: "",
        serverReference: "",
        sessionExpiryIntervalSeconds: 0,
        userProperties: createDummyUserProperties()
    };

    doFragmentedRoundTripEncodeDecodeTest(disconnect, model.ProtocolMode.Mqtt5, 20);
});

test('Subscribe - 311', () => {
    let subscribe : model.SubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Subscribe,
        packetId: 12,
        subscriptions: new Array<mqtt5_packet.Subscription>(
            {topicFilter: "three", qos: mqtt5_packet.QoS.AtLeastOnce},
            {topicFilter: "fortysix/and/two", qos: mqtt5_packet.QoS.AtMostOnce},
            {topicFilter: "five", qos: mqtt5_packet.QoS.ExactlyOnce},
        )
    };

    doFragmentedRoundTripEncodeDecodeTest(subscribe, model.ProtocolMode.Mqtt311, 20);
});

test('Subscribe - Minimal 5', () => {
    let subscribe : model.SubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Subscribe,
        packetId: 42,
        subscriptions: new Array<mqtt5_packet.Subscription>(
            {topicFilter: "up", qos: mqtt5_packet.QoS.AtLeastOnce},
            {topicFilter: "fortysix/and/two", qos: mqtt5_packet.QoS.AtMostOnce},
            {topicFilter: "down", qos: mqtt5_packet.QoS.ExactlyOnce},
        )
    };

    doFragmentedRoundTripEncodeDecodeTest(subscribe, model.ProtocolMode.Mqtt5, 20);
});

test('Subscribe - Maximal 5', () => {
    let subscribe : model.SubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Subscribe,
        packetId: 42,
        subscriptions: new Array<mqtt5_packet.Subscription>(
            {topicFilter: "up", qos: mqtt5_packet.QoS.AtLeastOnce, noLocal: true, retainAsPublished : true, retainHandlingType: mqtt5_packet.RetainHandlingType.SendOnSubscribe},
            {topicFilter: "fortysix/and/two", qos: mqtt5_packet.QoS.AtMostOnce, noLocal: false, retainAsPublished : false, retainHandlingType: mqtt5_packet.RetainHandlingType.SendOnSubscribeIfNew},
            {topicFilter: "down", qos: mqtt5_packet.QoS.ExactlyOnce, noLocal: true, retainAsPublished : false, retainHandlingType: mqtt5_packet.RetainHandlingType.DontSend},
        ),
        userProperties: createDummyUserProperties(),
        subscriptionIdentifier: 47,
    };

    doFragmentedRoundTripEncodeDecodeTest(subscribe, model.ProtocolMode.Mqtt5, 20);
});

test('Subscribe - Maximal Falsy 5', () => {
    let subscribe : model.SubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Subscribe,
        packetId: 0,
        subscriptions: new Array<mqtt5_packet.Subscription>(
            {topicFilter: "", qos: mqtt5_packet.QoS.AtLeastOnce, noLocal: true, retainAsPublished : true, retainHandlingType: mqtt5_packet.RetainHandlingType.SendOnSubscribe},
            {topicFilter: "fortysix/and/two", qos: mqtt5_packet.QoS.AtMostOnce, noLocal: false, retainAsPublished : false, retainHandlingType: mqtt5_packet.RetainHandlingType.SendOnSubscribeIfNew},
            {topicFilter: "down", qos: mqtt5_packet.QoS.ExactlyOnce, noLocal: true, retainAsPublished : false, retainHandlingType: mqtt5_packet.RetainHandlingType.DontSend},
        ),
        userProperties: createDummyUserProperties(),
        subscriptionIdentifier: 0,
    };

    doFragmentedRoundTripEncodeDecodeTest(subscribe, model.ProtocolMode.Mqtt5, 20);
});

test('Suback - 311', () => {
    let suback : model.SubackPacketInternal = {
        type: mqtt5_packet.PacketType.Suback,
        packetId: 12,
        reasonCodes: new Array<mqtt5_packet.SubackReasonCode>(
            mqtt5_packet.SubackReasonCode.GrantedQoS1,
            mqtt5_packet.SubackReasonCode.GrantedQoS0,
            mqtt5_packet.SubackReasonCode.GrantedQoS2,
            128
        )
    };

    doFragmentedRoundTripEncodeDecodeTest(suback, model.ProtocolMode.Mqtt311, 20);
});

test('Suback - Minimal 5', () => {
    let suback : model.SubackPacketInternal = {
        type: mqtt5_packet.PacketType.Suback,
        packetId: 53280,
        reasonCodes: new Array<mqtt5_packet.SubackReasonCode>(
            mqtt5_packet.SubackReasonCode.GrantedQoS1,
            mqtt5_packet.SubackReasonCode.GrantedQoS0,
            mqtt5_packet.SubackReasonCode.NotAuthorized,
            mqtt5_packet.SubackReasonCode.TopicFilterInvalid,
        )
    };

    doFragmentedRoundTripEncodeDecodeTest(suback, model.ProtocolMode.Mqtt5, 20);
});

test('Suback - Maximal 5', () => {
    let suback : model.SubackPacketInternal = {
        type: mqtt5_packet.PacketType.Suback,
        packetId: 53280,
        reasonCodes: new Array<mqtt5_packet.SubackReasonCode>(
            mqtt5_packet.SubackReasonCode.GrantedQoS1,
            mqtt5_packet.SubackReasonCode.GrantedQoS0,
            mqtt5_packet.SubackReasonCode.NotAuthorized,
            mqtt5_packet.SubackReasonCode.TopicFilterInvalid,
        ),
        reasonString: "Not well",
        userProperties: createDummyUserProperties(),
    };

    doFragmentedRoundTripEncodeDecodeTest(suback, model.ProtocolMode.Mqtt5, 20);
});

test('Suback - Maximal Falsy 5', () => {
    let suback : model.SubackPacketInternal = {
        type: mqtt5_packet.PacketType.Suback,
        packetId: 0,
        reasonCodes: new Array<mqtt5_packet.SubackReasonCode>(
            mqtt5_packet.SubackReasonCode.GrantedQoS1,
            mqtt5_packet.SubackReasonCode.GrantedQoS0,
            mqtt5_packet.SubackReasonCode.NotAuthorized,
            mqtt5_packet.SubackReasonCode.TopicFilterInvalid,
        ),
        reasonString: "",
        userProperties: new Array<mqtt5_packet.UserProperty>(),
    };

    doFragmentedRoundTripEncodeDecodeTest(suback, model.ProtocolMode.Mqtt5, 20);
});

test('Unsubscribe - 311', () => {
    let unsubscribe : model.UnsubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        packetId: 12,
        topicFilters: new Array<string>("three", "fortysix/and/two", "squarepants")
    };

    doFragmentedRoundTripEncodeDecodeTest(unsubscribe, model.ProtocolMode.Mqtt311, 20);
});

test('Unsubscribe - Minimal 5', () => {
    let unsubscribe : model.UnsubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        packetId: 12,
        topicFilters: new Array<string>("three", "fortysix/and/two", "squidward")
    };

    doFragmentedRoundTripEncodeDecodeTest(unsubscribe, model.ProtocolMode.Mqtt5, 20);
});

test('Unsubscribe - Maximal 5', () => {
    let unsubscribe : model.UnsubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        packetId: 12,
        topicFilters: new Array<string>("three", "fortysix/and/two", "five"),
        userProperties: createDummyUserProperties()
    };

    doFragmentedRoundTripEncodeDecodeTest(unsubscribe, model.ProtocolMode.Mqtt5, 20);
});

test('Unsubscribe - Falsy 5', () => {
    let unsubscribe : model.UnsubscribePacketInternal = {
        type: mqtt5_packet.PacketType.Unsubscribe,
        packetId: 0,
        topicFilters: new Array<string>("three", "fortysix/and/two", "patrickstar"),
        userProperties: new Array<mqtt5_packet.UserProperty>()
    };

    doFragmentedRoundTripEncodeDecodeTest(unsubscribe, model.ProtocolMode.Mqtt5, 20);
});

test('Unsuback - 311', () => {
    let unsuback : model.UnsubackPacketInternal = {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: 12,
        reasonCodes: new Array<mqtt5_packet.UnsubackReasonCode>()
    };

    doFragmentedRoundTripEncodeDecodeTest(unsuback, model.ProtocolMode.Mqtt311, 20);
});

test('Unsuback - Minimal 5', () => {
    let unsuback : model.UnsubackPacketInternal = {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: 12,
        reasonCodes: new Array<mqtt5_packet.UnsubackReasonCode>(
            mqtt5_packet.UnsubackReasonCode.Success,
            mqtt5_packet.UnsubackReasonCode.NoSubscriptionExisted,
            mqtt5_packet.UnsubackReasonCode.NotAuthorized,
            mqtt5_packet.UnsubackReasonCode.TopicFilterInvalid,
        )
    };

    doFragmentedRoundTripEncodeDecodeTest(unsuback, model.ProtocolMode.Mqtt5, 20);
});

test('Unsuback - Maximal 5', () => {
    let unsuback : model.UnsubackPacketInternal = {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: 12,
        reasonCodes: new Array<mqtt5_packet.UnsubackReasonCode>(
            mqtt5_packet.UnsubackReasonCode.Success,
            mqtt5_packet.UnsubackReasonCode.NoSubscriptionExisted,
            mqtt5_packet.UnsubackReasonCode.NotAuthorized,
            mqtt5_packet.UnsubackReasonCode.TopicFilterInvalid,
        ),
        reasonString: "Ihavenoidea",
        userProperties: createDummyUserProperties()
    };

    doFragmentedRoundTripEncodeDecodeTest(unsuback, model.ProtocolMode.Mqtt5, 20);
});

test('Unsuback - Maximal Falsy 5', () => {
    let unsuback : model.UnsubackPacketInternal = {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: 0,
        reasonCodes: new Array<mqtt5_packet.UnsubackReasonCode>(
            mqtt5_packet.UnsubackReasonCode.Success,
        ),
        reasonString: "",
        userProperties: new Array<mqtt5_packet.UserProperty>()
    };

    doFragmentedRoundTripEncodeDecodeTest(unsuback, model.ProtocolMode.Mqtt5, 20);
});

test('Connect - Minimal 311', () => {
    let connect : model.ConnectPacketInternal = {
        type: mqtt5_packet.PacketType.Connect,
        cleanStart: true,
        keepAliveIntervalSeconds: 1200
    };

    doFragmentedRoundTripEncodeDecodeTest(connect, model.ProtocolMode.Mqtt311, 20);
});

test('Connect - Maximal 311', () => {
    let connect : model.ConnectPacketInternal = {
        type: mqtt5_packet.PacketType.Connect,
        cleanStart: true,
        keepAliveIntervalSeconds: 1200,
        clientId: "Spongebob",
        username: "KrabbyPatty",
        password: new Uint8Array([0, 1, 2, 3, 4]).buffer,
        will: {
            type: mqtt5_packet.PacketType.Publish,
            topicName: "Bikini/Bottom",
            payload: new Uint8Array([5, 6, 7, 8, 9]).buffer,
            qos: mqtt5_packet.QoS.AtLeastOnce,
            retain: true
        },
    };

    doFragmentedRoundTripEncodeDecodeTest(connect, model.ProtocolMode.Mqtt311, 20);
});

test('Connect - Maximal Falsy 311', () => {
    let connect : model.ConnectPacketInternal = {
        type: mqtt5_packet.PacketType.Connect,
        cleanStart: false,
        keepAliveIntervalSeconds: 0,
        clientId: "",
        username: "",
        password: new Uint8Array([]).buffer,
        will: {
            type: mqtt5_packet.PacketType.Publish,
            topicName: "",
            payload: new Uint8Array([]).buffer,
            qos: mqtt5_packet.QoS.AtMostOnce,
            retain: false
        },
    };

    doFragmentedRoundTripEncodeDecodeTest(connect, model.ProtocolMode.Mqtt311, 20);
});

test('Connect - Minimal 5', () => {
    let connect : model.ConnectPacketInternal = {
        type: mqtt5_packet.PacketType.Connect,
        cleanStart: true,
        keepAliveIntervalSeconds: 1200
    };

    doFragmentedRoundTripEncodeDecodeTest(connect, model.ProtocolMode.Mqtt5, 20);
});

test('Connect - Maximal 5', () => {
    let connect : model.ConnectPacketInternal = {
        type: mqtt5_packet.PacketType.Connect,
        cleanStart: true,
        keepAliveIntervalSeconds: 1200,
        clientId: "Spongebob",
        username: "KrabbyPatty",
        password: new Uint8Array([0, 1, 2, 3, 4]).buffer,
        topicAliasMaximum: 20,
        authenticationMethod: "Secrethandshake",
        authenticationData: new Uint8Array([40, 41, 42, 43, 44]).buffer,
        willDelayIntervalSeconds: 30,
        sessionExpiryIntervalSeconds: 600,
        requestResponseInformation: true,
        requestProblemInformation: false,
        receiveMaximum: 100,
        maximumPacketSizeBytes: 128 * 1024,
        userProperties: createDummyUserProperties(),
        will: {
            type: mqtt5_packet.PacketType.Publish,
            topicName: "Bikini/Bottom",
            payload: new Uint8Array([5, 6, 7, 8, 9]).buffer,
            qos: mqtt5_packet.QoS.AtLeastOnce,
            retain: true,
            payloadFormat: mqtt5_packet.PayloadFormatIndicator.Utf8,
            messageExpiryIntervalSeconds: 3600,
            contentType: "application/json",
            responseTopic: "Krusty/Krab",
            correlationData: new Uint8Array([65, 66, 68]).buffer,
            userProperties: createDummyUserProperties(),
        },
    };

    doFragmentedRoundTripEncodeDecodeTest(connect, model.ProtocolMode.Mqtt5, 20);
});

test('Connect - Maximal Falsy 5', () => {
    let connect : model.ConnectPacketInternal = {
        type: mqtt5_packet.PacketType.Connect,
        cleanStart: true,
        keepAliveIntervalSeconds: 0,
        clientId: "",
        username: "",
        password: new Uint8Array([]).buffer,
        topicAliasMaximum: 0,
        authenticationMethod: "",
        authenticationData: new Uint8Array([]).buffer,
        willDelayIntervalSeconds: 0,
        sessionExpiryIntervalSeconds: 0,
        requestResponseInformation: false,
        requestProblemInformation: false,
        receiveMaximum: 0,
        maximumPacketSizeBytes: 0,
        userProperties: new Array<mqtt5_packet.UserProperty>(),
        will: {
            type: mqtt5_packet.PacketType.Publish,
            topicName: "",
            qos: mqtt5_packet.QoS.AtMostOnce,
            retain: false,
            payloadFormat: mqtt5_packet.PayloadFormatIndicator.Bytes,
            messageExpiryIntervalSeconds: 0,
            contentType: "",
            responseTopic: "",
            correlationData: new Uint8Array([]).buffer,
            userProperties: new Array<mqtt5_packet.UserProperty>(),
        },
    };

    doFragmentedRoundTripEncodeDecodeTest(connect, model.ProtocolMode.Mqtt5, 20);
});

test('Connack - 311', () => {
    let connack : model.ConnackPacketInternal = {
        type: mqtt5_packet.PacketType.Connack,
        reasonCode: mqtt5_packet.ConnectReasonCode.Success,
        sessionPresent: true
    };

    doFragmentedRoundTripEncodeDecodeTest(connack, model.ProtocolMode.Mqtt311, 20);
});

test('Connack - Minimal 5', () => {
    let connack : model.ConnackPacketInternal = {
        type: mqtt5_packet.PacketType.Connack,
        reasonCode: mqtt5_packet.ConnectReasonCode.NotAuthorized,
        sessionPresent: false
    };

    doFragmentedRoundTripEncodeDecodeTest(connack, model.ProtocolMode.Mqtt5, 20);
});

test('Connack - Maximal 5', () => {
    let connack : model.ConnackPacketInternal = {
        type: mqtt5_packet.PacketType.Connack,
        reasonCode: mqtt5_packet.ConnectReasonCode.Success,
        sessionPresent: true,
        authenticationMethod: "Piglatin",
        authenticationData: new Uint8Array([40, 41, 42, 43, 44]).buffer,
        sessionExpiryInterval: 3600,
        receiveMaximum: 100,
        maximumQos: 1,
        retainAvailable: true,
        maximumPacketSize: 128 * 1024,
        assignedClientIdentifier: "SpongebobSquarepants",
        topicAliasMaximum: 20,
        reasonString: "Nice",
        wildcardSubscriptionsAvailable: true,
        subscriptionIdentifiersAvailable: true,
        sharedSubscriptionsAvailable: true,
        serverKeepAlive: 1200,
        responseInformation: "this/topic",
        serverReference: "Guam.com",
        userProperties: createDummyUserProperties()
    };

    doFragmentedRoundTripEncodeDecodeTest(connack, model.ProtocolMode.Mqtt5, 20);
});

test('Connack - Maximal Falsy 5', () => {
    let connack : model.ConnackPacketInternal = {
        type: mqtt5_packet.PacketType.Connack,
        reasonCode: mqtt5_packet.ConnectReasonCode.Success,
        sessionPresent: false,
        authenticationMethod: "",
        authenticationData: new Uint8Array([]).buffer,
        sessionExpiryInterval: 0,
        receiveMaximum: 0,
        maximumQos: 0,
        retainAvailable: false,
        maximumPacketSize: 0,
        assignedClientIdentifier: "",
        topicAliasMaximum: 0,
        reasonString: "",
        wildcardSubscriptionsAvailable: false,
        subscriptionIdentifiersAvailable: false,
        sharedSubscriptionsAvailable: false,
        serverKeepAlive: 0,
        responseInformation: "",
        serverReference: "",
        userProperties: new Array<mqtt5_packet.UserProperty>()
    };

    doFragmentedRoundTripEncodeDecodeTest(connack, model.ProtocolMode.Mqtt5, 20);
});
