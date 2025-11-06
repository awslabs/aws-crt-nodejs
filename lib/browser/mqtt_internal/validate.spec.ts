/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as model from "./model";
import * as mqtt5_common from "../../common/mqtt5";
import * as mqtt5_packet from "../../common/mqtt5_packet";
import * as validate from "./validate";

function createExternalPublishPacketMaximal() : mqtt5_packet.PublishPacket {
    return {
        type: mqtt5_packet.PacketType.Publish,
        topicName: "my/topic",
        qos: mqtt5_packet.QoS.AtLeastOnce,
        payload: new Uint8Array(0),
        retain: true,
        payloadFormat: mqtt5_packet.PayloadFormatIndicator.Utf8,
        messageExpiryIntervalSeconds: 123,
        topicAlias: 123,
        responseTopic: "response/Topic",
        correlationData: new Uint8Array(0),
        contentType: "rest-json",
        userProperties: [
            {name: "name", value: "value"},
            {name: "hello", value: "world"}
        ]
    };
}

// Publish Validation

// user-submitted publishes

test('External publish packet validation - isValid', async () => {
    validate.validateUserSubmittedOutboundPacket(createExternalPublishPacketMaximal(), model.ProtocolMode.Mqtt311);
    validate.validateUserSubmittedOutboundPacket(createExternalPublishPacketMaximal(), model.ProtocolMode.Mqtt5);
});

test('External publish packet validation - undefined topic', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    delete packet.topicName;
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid string");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External publish packet validation - bad topic type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.topicName = 6;
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid string");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External publish packet validation - bad topic value', async () => {
    let packet = createExternalPublishPacketMaximal();
    packet.topicName = "#/#";
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid topic");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid topic");
});

test('External publish packet validation - undefined qos', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    delete packet.qos;
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid u8");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u8");
});

test('External publish packet validation - bad qos type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.qos = "hi";
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid u8");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u8");
});

test('External publish packet validation - bad qos value', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.qos = 3;
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid QualityOfService");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid QualityOfService");
});

test('External publish packet validation - bad payload type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.payload = [3, "derp"];
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("Invalid payload value");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("Invalid payload value");
});

test('External publish packet validation - bad payload format type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.payloadFormat = "hi";
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u8");
});

test('External publish packet validation - bad payload format value', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.payloadFormat = 2;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid PayloadFormatIndicator");
});

test('External publish packet validation - bad message expiry interval type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.messageExpiryIntervalSeconds = "hi";
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u32");
});

test('External publish packet validation - bad message expiry interval value', async () => {
    let packet = createExternalPublishPacketMaximal();
    packet.messageExpiryIntervalSeconds = -5;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u32");
});

test('External publish packet validation - bad topic alias type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.topicAlias = "hi";
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u16");
});

test('External publish packet validation - bad topic alias value', async () => {
    let packet = createExternalPublishPacketMaximal();
    packet.topicAlias = 0;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("cannot be 0");
});


test('External publish packet validation - bad response topic type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.responseTopic = 3;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External publish packet validation - bad response topic value', async () => {
    let packet = createExternalPublishPacketMaximal();
    packet.responseTopic = "#/+";
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid topic");
});

test('External publish packet validation - bad correlation data type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.correlationData = [3, "derp"];
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not valid binary data");
});

test('External publish packet validation - bad content type type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.contentType = false;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External publish packet validation - bad user properties type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.userProperties = true;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("is not an array");
});

test('External publish packet validation - bad user properties name type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    packet.userProperties[0].name = false;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External publish packet validation - bad user properties name type', async () => {
    let packet = createExternalPublishPacketMaximal();
    // @ts-ignore
    delete packet.userProperties[1].value;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

// binary publish

function createBinaryPublishPacketMaximal() : model.PublishPacketBinary {
    let packet = createExternalPublishPacketMaximal();
    let binaryPacket = model.convertInternalPacketToBinary(packet) as model.PublishPacketBinary;

    binaryPacket.duplicate = 0;
    binaryPacket.packetId = 7;

    return binaryPacket;
}

function createStandardNegotiatedSettings() : mqtt5_common.NegotiatedSettings {
    return {
        maximumQos: mqtt5_packet.QoS.AtLeastOnce,
        sessionExpiryInterval: 1200,
        receiveMaximumFromServer: 100,
        maximumPacketSizeToServer: 128 * 1024,
        topicAliasMaximumToServer: 200,
        topicAliasMaximumToClient: 20,
        serverKeepAlive: 3600,
        retainAvailable: true,
        wildcardSubscriptionsAvailable: true,
        subscriptionIdentifiersAvailable: true,
        sharedSubscriptionsAvailable: true,
        rejoinedSession: false,
        clientId: "Spongebob"
    };
}

test('Binary publish packet validation - success', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings);
});

test('Binary publish packet validation - packet too long', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.payload = new Uint8Array(128 * 1024 + 1);

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("exceeds established maximum packet size");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("exceeds established maximum packet size");
});

test('Binary publish packet validation - qos 0 packet id', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.qos = 0;
    packet.packetId = 5;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("packetId must not be set");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("packetId must not be set");
});

test('Binary publish packet validation - qos 1 no packet id', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.qos = 1;
    delete packet.packetId;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("must be defined");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("must be defined");
});

test('Binary publish packet validation - qos 1 zero-valued packet id', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.qos = 1;
    packet.packetId = 0;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not a valid packetId");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a valid packetId");
});

test('Binary publish packet validation - qos 1 too-large packet id', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.qos = 65536;
    packet.packetId = 0;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not a valid packetId");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a valid packetId");
});

test('Binary publish packet validation - retain not available', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.retain = 1;
    settings.retainAvailable = false;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("does not support retained messages");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("does not support retained messages");
});

test('Binary publish packet validation - qos exceeds maximum', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.qos = 2;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("greater than the maximum QoS");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("greater than the maximum QoS");
});

test('Binary publish packet validation - topic too long', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.topicName = new Uint8Array(65536);

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not a 16-bit length buffer");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary publish packet validation - subscription identifiers set', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.subscriptionIdentifiers = [1];

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("may not be set on outbound publish packets");
});

test('Binary publish packet validation - topic alias zero', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.topicAlias = 0;

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("cannot be zero");
});

test('Binary publish packet validation - topic alias too big', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.topicAlias = 256;

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("greater than the maximum topic alias");
});

test('Binary publish packet validation - response topic too long', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.responseTopic = new Uint8Array(65536);

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary publish packet validation - correlation data too long', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.correlationData = new Uint8Array(65536);

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary publish packet validation - content type too long', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.contentType = new Uint8Array(65536);

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary publish packet validation - user property name too long', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    // @ts-ignore
    packet.userProperties[0].name = new Uint8Array(65536);

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary publish packet validation - user property value too long', async () => {
    let packet = createBinaryPublishPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    // @ts-ignore
    packet.userProperties[1].value = new Uint8Array(65536);

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

// inbound publish

function createInternalPublishPacketMaximal() : model.PublishPacketInternal {
    return {
        type: mqtt5_packet.PacketType.Publish,
        topicName: "my/topic",
        qos: mqtt5_packet.QoS.AtLeastOnce,
        duplicate: false,
        packetId: 5,
        payload: new Uint8Array(0),
        retain: true,
        payloadFormat: mqtt5_packet.PayloadFormatIndicator.Utf8,
        messageExpiryIntervalSeconds: 123,
        topicAlias: 123,
        responseTopic: "response/Topic",
        correlationData: new Uint8Array(0),
        contentType: "rest-json",
        userProperties: [
            {name: "name", value: "value"},
            {name: "hello", value: "world"}
        ]
    };
}

test('Inbound publish packet validation - success', async () => {
    let packet = createInternalPublishPacketMaximal();

    validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311);
    validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5);
});

test('Inbound publish packet validation - invalid qos', async () => {
    let packet = createInternalPublishPacketMaximal();
    // @ts-ignore
    packet.qos = 255;

    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid QualityOfService");
    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid QualityOfService");
});

test('Inbound publish packet validation - qos 1 with zero packet id', async () => {
    let packet = createInternalPublishPacketMaximal();
    // @ts-ignore
    packet.packetId = 0;

    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid packetId");
    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid packetId");
});

test('Inbound publish packet validation - unresolved topic alias', async () => {
    let packet = createInternalPublishPacketMaximal();
    packet.topicName = "";

    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("topicName is empty");
    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("topicName is empty");
});

// Puback Validation

// Binary pubacks
function createInternalPubackPacketMaximal() : model.PubackPacketInternal {
    return {
        type: mqtt5_packet.PacketType.Puback,
        packetId: 5,
        reasonCode: mqtt5_packet.PubackReasonCode.Success,
        reasonString: "well formed",
        userProperties: [
            {name: "name", value: "value"},
            {name: "hello", value: "world"}
        ]
    };
}

function createBinaryPubackPacketMaximal() : model.PubackPacketBinary {
    let packet = createInternalPubackPacketMaximal();
    let binaryPacket = model.convertInternalPacketToBinary(packet) as model.PubackPacketBinary;

    return binaryPacket;
}

test('Binary puback packet validation - success', async () => {
    let packet = createBinaryPubackPacketMaximal();
    let settings = createStandardNegotiatedSettings();

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings);
});

test('Binary puback packet validation - packet too long', async () => {
    let packet = createBinaryPubackPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    settings.maximumPacketSizeToServer = 1;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("exceeds established maximum packet size");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("exceeds established maximum packet size");
});

test('Binary puback packet validation - invalid packet id', async () => {
    let packet = createBinaryPubackPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.packetId = 0;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not a valid packetId");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a valid packetId");
});

test('Binary puback packet validation - reason string too long', async () => {
    let packet = createBinaryPubackPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    packet.reasonString = new Uint8Array(65536);

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary puback packet validation - user property name too long', async () => {
    let packet = createBinaryPubackPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    // @ts-ignore
    packet.userProperties[0].name = new Uint8Array(65536);

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary puback packet validation - user property value too long', async () => {
    let packet = createBinaryPubackPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    // @ts-ignore
    packet.userProperties[1].value = new Uint8Array(65536);

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

// Inbound pubacks

test('Inbound puback packet validation - success', async () => {
    let packet = createInternalPubackPacketMaximal();

    validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311);
    validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5);
});

test('Inbound puback packet validation - bad packet id', async () => {
    let packet = createInternalPubackPacketMaximal();
    packet.packetId = 0;

    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid packetId");
    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid packetId");
});

test('Inbound puback packet validation - bad reason code', async () => {
    let packet = createInternalPubackPacketMaximal();
    packet.reasonCode = 255;

    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid MQTT5 PubackReasonCode");
});

// Subscribe Validation

function createExternalSubscribePacketMaximal() : mqtt5_packet.SubscribePacket {
    return {
        type: mqtt5_packet.PacketType.Subscribe,
        subscriptions: [
            {
                topicFilter: "hello/there",
                qos: mqtt5_packet.QoS.ExactlyOnce,
            },
            {
                topicFilter: "device/a",
                qos: mqtt5_packet.QoS.AtMostOnce,
                noLocal: false,
                retainAsPublished: true,
                retainHandlingType: mqtt5_packet.RetainHandlingType.SendOnSubscribeIfNew
            }
        ],
        subscriptionIdentifier: 37,
        userProperties: [
            { name: "key", value: "uffdah" },
            { name: "hello", value: "world" }
        ]
    };
}

// User-submitted subscribes

test('External subscribe packet validation - success', async () => {
    let packet = createExternalSubscribePacketMaximal();

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5);
});

test('External subscribe packet validation - undefined subscriptions', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    delete packet.subscriptions;

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("must be an array");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("must be an array");
});

test('External subscribe packet validation - subscriptions bad type', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    packet.subscriptions = "oops";

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("must be an array");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("must be an array");
});

test('External subscribe packet validation - empty subscriptions', async () => {
    let packet = createExternalSubscribePacketMaximal();
    packet.subscriptions = [];

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("cannot be empty");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("cannot be empty");
});

test('External subscribe packet validation - undefined topic filter', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    delete packet.subscriptions[0].topicFilter;

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid string");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External subscribe packet validation - topic filter bad type', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    packet.subscriptions[0].topicFilter = 0;

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid string");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External subscribe packet validation - topic filter invalid', async () => {
    let packet = createExternalSubscribePacketMaximal();
    packet.subscriptions[0].topicFilter = "###";

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid topic filter");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid topic filter");
});

test('External subscribe packet validation - undefined qos', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    delete packet.subscriptions[0].qos;

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid u8");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u8");
});

test('External subscribe packet validation - qos bad type', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    packet.subscriptions[0].qos = "qos";

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid u8");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u8");
});

test('External subscribe packet validation - qos invalid', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    packet.subscriptions[0].qos = 4;

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid QualityOfService");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid QualityOfService");
});

test('External subscribe packet validation - retain handling type bad type', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    packet.subscriptions[1].retainHandlingType = "qos";

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u8");
});

test('External subscribe packet validation - retain handling type invalid', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    packet.subscriptions[1].retainHandlingType = 7;

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid RetainHandlingType");
});

test('External subscribe packet validation - subscription identifier wrong type', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    packet.subscriptionIdentifier = "uffdah";

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("cannot be VLI-encoded");
});

test('External subscribe packet validation - subscription identifier too big', async () => {
    let packet = createExternalSubscribePacketMaximal();
    packet.subscriptionIdentifier = 256 * 256 * 256 * 128;

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("cannot be VLI-encoded");
});

test('External subscribe packet validation - user properties bad type', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    packet.userProperties = "not an array";

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not an array");
});

test('External subscribe packet validation - user properties name undefined', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    delete packet.userProperties[0].name;

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External subscribe packet validation - user properties name bad type', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    packet.userProperties[0].name = 5;

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External subscribe packet validation - user properties value undefined', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    delete packet.userProperties[1].value;

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External subscribe packet validation - user properties value bad type', async () => {
    let packet = createExternalSubscribePacketMaximal();
    // @ts-ignore
    packet.userProperties[1].value = 5;

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

// Binary subscribes

// Suback Validation

// Inbound subacks

// Unsubscribe Validation

// User-submitted unsubscribes

// Binary unsubscribes

// Unsuback Validation

// Inbound unsubacks

// Connect Validation

// Binary connects

// Disconnect Validation

// user-submitted disconnects

// binary disconnects

// inbound disconnects