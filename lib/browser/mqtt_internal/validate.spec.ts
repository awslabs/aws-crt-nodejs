/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as model from "./model";
import * as mqtt5_common from "../../common/mqtt5";
import * as mqtt5_packet from "../../common/mqtt5_packet";
import * as validate from "./validate";

function doBinaryUserPropertyNameTooLongTest(packet: model.IPacketBinary) {
    let settings = createStandardNegotiatedSettings();

    // @ts-ignore
    packet.userProperties[0].name = new Uint8Array(65536);

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
}

function doBinaryUserPropertyValueTooLongTest(packet: model.IPacketBinary) {
    let settings = createStandardNegotiatedSettings();

    // @ts-ignore
    packet.userProperties[1].value = new Uint8Array(65536);

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
}

function doBinaryZeroPacketIdTest(packet: model.IPacketBinary) {
    let settings = createStandardNegotiatedSettings();

    // @ts-ignore
    packet.packetId = 0;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not a valid packetId");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a valid packetId");
}

function doBinaryUndefinedPacketIdTest(packet: model.IPacketBinary) {
    let settings = createStandardNegotiatedSettings();

    // @ts-ignore
    delete packet.packetId;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("must be defined");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("must be defined");
}

function doBadUserPropertiesTypeTest(packet: mqtt5_packet.IPacket) {
    // @ts-ignore
    packet.userProperties = true;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("is not an array");
}

function doBadUserPropertiesUndefinedNameTest(packet: mqtt5_packet.IPacket) {
    // @ts-ignore
    delete packet.userProperties[0].name;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
}

function doBadUserPropertiesBadNameTypeTest(packet: mqtt5_packet.IPacket) {
    // @ts-ignore
    packet.userProperties[0].name = false;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
}

function doBadUserPropertiesUndefinedValueTest(packet: mqtt5_packet.IPacket) {
    // @ts-ignore
    delete packet.userProperties[1].value;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
}

function doBadUserPropertiesBadValueTypeTest(packet: mqtt5_packet.IPacket) {
    // @ts-ignore
    packet.userProperties[1].value = 21;
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
}

// Publish Validation

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
    doBadUserPropertiesTypeTest(createExternalPublishPacketMaximal());
});

test('External publish packet validation - user properties name bad type', async () => {
    doBadUserPropertiesBadNameTypeTest(createExternalPublishPacketMaximal());
});

test('External publish packet validation - user properties name undefined type', async () => {
    doBadUserPropertiesUndefinedNameTest(createExternalPublishPacketMaximal());
});

test('External publish packet validation - bad user properties value type', async () => {
    doBadUserPropertiesBadValueTypeTest(createExternalPublishPacketMaximal());
});

test('External publish packet validation - user properties value undefined type', async () => {
    doBadUserPropertiesUndefinedValueTest(createExternalPublishPacketMaximal());
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
    doBinaryUserPropertyNameTooLongTest(createBinaryPublishPacketMaximal());
});

test('Binary publish packet validation - user property value too long', async () => {
    doBinaryUserPropertyValueTooLongTest(createBinaryPublishPacketMaximal());
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

test('Binary puback packet validation - zero packet id', async () => {
    doBinaryZeroPacketIdTest(createBinaryPubackPacketMaximal());
});

test('Binary puback packet validation - undefined packet id', async () => {
    doBinaryUndefinedPacketIdTest(createBinaryPubackPacketMaximal());
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

test('External subscribe packet validation - bad user properties type', async () => {
    doBadUserPropertiesTypeTest(createExternalSubscribePacketMaximal());
});

test('External subscribe packet validation - user properties name bad type', async () => {
    doBadUserPropertiesBadNameTypeTest(createExternalSubscribePacketMaximal());
});

test('External subscribe packet validation - user properties name undefined type', async () => {
    doBadUserPropertiesUndefinedNameTest(createExternalSubscribePacketMaximal());
});

test('External subscribe packet validation - bad user properties value type', async () => {
    doBadUserPropertiesBadValueTypeTest(createExternalSubscribePacketMaximal());
});

test('External subscribe packet validation - user properties value undefined type', async () => {
    doBadUserPropertiesUndefinedValueTest(createExternalSubscribePacketMaximal());
});

// Binary subscribes

function creatdBinarySubscribePacketMaximal() : model.SubscribePacketBinary {
    let packet = createExternalSubscribePacketMaximal();
    let binarySubscribe = model.convertInternalPacketToBinary(packet) as model.SubscribePacketBinary;

    binarySubscribe.packetId = 3;

    return binarySubscribe;
}

test('Binary subscribe packet validation - success', async () => {
    let packet = creatdBinarySubscribePacketMaximal();
    let settings = createStandardNegotiatedSettings();

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings);
});

test('Binary subscribe packet validation - packet length too long', async () => {
    let packet = creatdBinarySubscribePacketMaximal();
    let settings = createStandardNegotiatedSettings();
    settings.maximumPacketSizeToServer = 15;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("exceeds established maximum packet size");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("exceeds established maximum packet size");
});

test('Binary subscribe packet validation - zero packet id', async () => {
    doBinaryZeroPacketIdTest(creatdBinarySubscribePacketMaximal());
});

test('Binary subscribe packet validation - undefined packet id', async () => {
    doBinaryUndefinedPacketIdTest(creatdBinarySubscribePacketMaximal());
});

test('Binary subscribe packet validation - shared subs unavailable', async () => {
    let packet = creatdBinarySubscribePacketMaximal();
    let settings = createStandardNegotiatedSettings();

    let encoder = new TextEncoder();
    let sharedTopicFilter = "$share/0/foo/bar";
    packet.subscriptions[0].topicFilterAsString = sharedTopicFilter;
    packet.subscriptions[0].topicFilter = encoder.encode(sharedTopicFilter).buffer;
    settings.sharedSubscriptionsAvailable = false;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not supported by the server");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not supported by the server");
});

test('Binary subscribe packet validation - no local and shared', async () => {
    let packet = creatdBinarySubscribePacketMaximal();
    let settings = createStandardNegotiatedSettings();

    let encoder = new TextEncoder();
    let sharedTopicFilter = "$share/0/foo/bar";
    packet.subscriptions[0].topicFilterAsString = sharedTopicFilter;
    packet.subscriptions[0].topicFilter = encoder.encode(sharedTopicFilter).buffer;
    packet.subscriptions[0].noLocal = 1;

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("may not be set on a shared subscriptions");
});

test('Binary subscribe packet validation - wildcard subs unavailable', async () => {
    let packet = creatdBinarySubscribePacketMaximal();
    let settings = createStandardNegotiatedSettings();

    let encoder = new TextEncoder();
    let wildcardTopicFilter = "a/+/b/#";
    packet.subscriptions[0].topicFilterAsString = wildcardTopicFilter;
    packet.subscriptions[0].topicFilter = encoder.encode(wildcardTopicFilter).buffer;
    settings.wildcardSubscriptionsAvailable = false;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not supported by the server");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not supported by the server");
});

test('Binary subscribe packet validation - topic filter too long', async () => {
    let packet = creatdBinarySubscribePacketMaximal();
    let settings = createStandardNegotiatedSettings();

    let encoder = new TextEncoder();
    let newTopicFilter = "a".repeat(65536);
    packet.subscriptions[0].topicFilterAsString = newTopicFilter;
    packet.subscriptions[0].topicFilter = encoder.encode(newTopicFilter).buffer;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not a 16-bit length buffer");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary subscribe packet validation - user property name too long', async () => {
    doBinaryUserPropertyNameTooLongTest(creatdBinarySubscribePacketMaximal());
});

test('Binary subscribe packet validation - user property value too long', async () => {
    doBinaryUserPropertyValueTooLongTest(creatdBinarySubscribePacketMaximal());
});

// Suback Validation

// Inbound subacks

function createInternalSubackPacketMaximal() : model.SubackPacketInternal {
    return {
        type: mqtt5_packet.PacketType.Suback,
        packetId: 3,
        reasonCodes: [
            mqtt5_packet.SubackReasonCode.GrantedQoS0,
            mqtt5_packet.SubackReasonCode.GrantedQoS1,
            mqtt5_packet.SubackReasonCode.GrantedQoS2
        ],
        userProperties: [
            {name: "name", value: "value"},
            {name: "hello", value: "world"}
        ]
    };
}

test('Inbound suback packet validation - success', async () => {
    let packet = createInternalSubackPacketMaximal();

    validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311);
    validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5);
});

test('Inbound suback packet validation - zero packet id', async () => {
    let packet = createInternalSubackPacketMaximal();
    packet.packetId = 0;

    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid packetId");
    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid packetId");
});

test('Inbound suback packet validation - bad reason code', async () => {
    let packet = createInternalSubackPacketMaximal();
    packet.reasonCodes[0] = 3;

    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid MQTT311 SubackReasonCode");
    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid MQTT5 SubackReasonCode");
});

// Unsubscribe Validation

function createExternalUnsubscribePacketMaximal() : mqtt5_packet.UnsubscribePacket {
    return {
        type: mqtt5_packet.PacketType.Unsubscribe,
        topicFilters: [
            "hello/there",
            "device/a"
        ],
        userProperties: [
            { name: "key", value: "uffdah" },
            { name: "hello", value: "world" }
        ]
    };
}

// User-submitted unsubscribes

test('External unsubscribe packet validation - success', async () => {
    let packet = createExternalUnsubscribePacketMaximal();

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5);
});

test('External unsubscribe packet validation - undefined subscriptions', async () => {
    let packet = createExternalUnsubscribePacketMaximal();
    // @ts-ignore
    delete packet.topicFilters;

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("cannot be empty");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("cannot be empty");
});

test('External unsubscribe packet validation - empty subscriptions', async () => {
    let packet = createExternalUnsubscribePacketMaximal();
    packet.topicFilters = [];

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("cannot be empty");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("cannot be empty");
});

test('External unsubscribe packet validation - undefined topic filter', async () => {
    let packet = createExternalUnsubscribePacketMaximal();
    // @ts-ignore
    delete packet.topicFilters[0];

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid string");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External unsubscribe packet validation - null topic filter', async () => {
    let packet = createExternalUnsubscribePacketMaximal();
    // @ts-ignore
    packet.topicFilters[0] = null;

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid string");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External unsubscribe packet validation - topic filter bad type', async () => {
    let packet = createExternalUnsubscribePacketMaximal();
    // @ts-ignore
    packet.topicFilters[0] = 5;

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid string");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External unsubscribe packet validation - topic filter invalid', async () => {
    let packet = createExternalUnsubscribePacketMaximal();
    // @ts-ignore
    packet.topicFilters[0] = "#/a";

    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid topic filter");
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid topic filter");
});

test('External unsubscribe packet validation - bad user properties type', async () => {
    doBadUserPropertiesTypeTest(createExternalUnsubscribePacketMaximal());
});

test('External unsubscribe packet validation - user properties name bad type', async () => {
    doBadUserPropertiesBadNameTypeTest(createExternalUnsubscribePacketMaximal());
});

test('External unsubscribe packet validation - user properties name undefined type', async () => {
    doBadUserPropertiesUndefinedNameTest(createExternalUnsubscribePacketMaximal());
});

test('External unsubscribe packet validation - bad user properties value type', async () => {
    doBadUserPropertiesBadValueTypeTest(createExternalUnsubscribePacketMaximal());
});

test('External unsubscribe packet validation - user properties value undefined type', async () => {
    doBadUserPropertiesUndefinedValueTest(createExternalUnsubscribePacketMaximal());
});

// Binary unsubscribes

function creatdBinaryUnsubscribePacketMaximal() : model.UnsubscribePacketBinary {
    let packet = createExternalUnsubscribePacketMaximal();
    let binaryUnsubscribe = model.convertInternalPacketToBinary(packet) as model.UnsubscribePacketBinary;

    binaryUnsubscribe.packetId = 3;

    return binaryUnsubscribe;
}

test('Binary unsubscribe packet validation - success', async () => {
    let packet = creatdBinaryUnsubscribePacketMaximal();
    let settings = createStandardNegotiatedSettings();

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings);
});

test('Binary unsubscribe packet validation - packet length too long', async () => {
    let packet = creatdBinaryUnsubscribePacketMaximal();
    let settings = createStandardNegotiatedSettings();
    settings.maximumPacketSizeToServer = 15;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("exceeds established maximum packet size");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("exceeds established maximum packet size");
});

test('Binary unsubscribe packet validation - zero packet id', async () => {
    doBinaryZeroPacketIdTest(creatdBinaryUnsubscribePacketMaximal());
});

test('Binary unsubscribe packet validation - undefined packet id', async () => {
    doBinaryUndefinedPacketIdTest(creatdBinaryUnsubscribePacketMaximal());
});

test('Binary unsubscribe packet validation - topic filter too long', async () => {
    let packet = creatdBinaryUnsubscribePacketMaximal();
    let settings = createStandardNegotiatedSettings();

    let encoder = new TextEncoder();
    let newTopicFilter = "a".repeat(65536);
    packet.topicFiltersAsStrings[0] = newTopicFilter;
    packet.topicFilters[0] = encoder.encode(newTopicFilter).buffer;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not a 16-bit length buffer");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary unsubscribe packet validation - user property name too long', async () => {
    doBinaryUserPropertyNameTooLongTest(creatdBinaryUnsubscribePacketMaximal());
});

test('Binary unsubscribe packet validation - user property value too long', async () => {
    doBinaryUserPropertyValueTooLongTest(creatdBinaryUnsubscribePacketMaximal());
});

// Unsuback Validation

function createInternalUnsubackPacketMaximal() : model.UnsubackPacketInternal {
    return {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: 3,
        reasonCodes: [
            mqtt5_packet.UnsubackReasonCode.Success,
            mqtt5_packet.UnsubackReasonCode.NoSubscriptionExisted,
        ],
        userProperties: [
            {name: "name", value: "value"},
            {name: "hello", value: "world"}
        ]
    };
}

// Inbound unsubacks

test('Inbound unsuback packet validation - success', async () => {
    let packet = createInternalUnsubackPacketMaximal();

    validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311);
    validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5);
});

test('Inbound unsuback packet validation - zero packet id', async () => {
    let packet = createInternalUnsubackPacketMaximal();
    packet.packetId = 0;

    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311); }).toThrow("not a valid packetId");
    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid packetId");
});

test('Inbound unsuback packet validation - bad reason code', async () => {
    let packet = createInternalUnsubackPacketMaximal();
    packet.reasonCodes[0] = 3;

    validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateInboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid MQTT5 UnsubackReasonCode");
});

// Connect Validation

function createInternalConnectPacketMaximal() : model.ConnectPacketInternal {
    return {
        type: mqtt5_packet.PacketType.Connect,
        cleanStart: true,
        topicAliasMaximum: 10,
        authenticationMethod: "GSSAPI",
        authenticationData: new Uint8Array(10),
        keepAliveIntervalSeconds: 3600,
        clientId: "TerbTerberson",
        username: "terb",
        password: new Uint8Array(10),
        sessionExpiryIntervalSeconds: 3600,
        requestResponseInformation: true,
        requestProblemInformation: true,
        receiveMaximum: 10,
        maximumPacketSizeBytes: 128 * 1024,
        willDelayIntervalSeconds: 60,
        will: {
            topicName: "hello/there",
            qos: mqtt5_packet.QoS.AtLeastOnce,
            retain: false,
            payload: new Uint8Array(10),
            payloadFormat: mqtt5_packet.PayloadFormatIndicator.Bytes,
            messageExpiryIntervalSeconds: 10,
            responseTopic: "hello/there",
            correlationData: new Uint8Array(10),
            contentType: "rest/json",
        },
        userProperties: [
            {name: "name", value: "value"},
            {name: "hello", value: "world"}
        ]
    };
}

function createBinaryConnectPacketMaximal() : model.ConnectPacketBinary {
    let packet = createInternalConnectPacketMaximal();
    return model.convertInternalPacketToBinary(packet) as model.ConnectPacketBinary;
}

// Binary connects

test('Binary connect packet validation - success', async () => {
    let packet = createBinaryConnectPacketMaximal();
    let settings = createStandardNegotiatedSettings();

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings);
});

test('Binary connect packet validation - packet length too long', async () => {
    let packet = createBinaryConnectPacketMaximal();
    let settings = createStandardNegotiatedSettings();
    settings.maximumPacketSizeToServer = 15;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("exceeds established maximum packet size");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("exceeds established maximum packet size");
});

test('Binary connect packet validation - client id too long', async () => {
    let packet = createBinaryConnectPacketMaximal();
    let settings = createStandardNegotiatedSettings();

    let encoder = new TextEncoder();
    let newClientId = "a".repeat(65536);
    packet.clientId = encoder.encode(newClientId).buffer;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not a 16-bit length buffer");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary connect packet validation - username too long', async () => {
    let packet = createBinaryConnectPacketMaximal();
    let settings = createStandardNegotiatedSettings();

    let encoder = new TextEncoder();
    let newUsername = "o".repeat(65536);
    packet.username = encoder.encode(newUsername).buffer;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not a 16-bit length buffer");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary connect packet validation - password too long', async () => {
    let packet = createBinaryConnectPacketMaximal();
    let settings = createStandardNegotiatedSettings();

    let encoder = new TextEncoder();
    let newPassword = "o".repeat(65536);
    packet.password = encoder.encode(newPassword).buffer;

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("not a 16-bit length buffer");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary connect packet validation - authentication method too long', async () => {
    let packet = createBinaryConnectPacketMaximal();
    let settings = createStandardNegotiatedSettings();

    let encoder = new TextEncoder();
    let newMethod = "a".repeat(65536);
    packet.authenticationMethod = encoder.encode(newMethod).buffer;

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary connect packet validation - authentication data too long', async () => {
    let packet = createBinaryConnectPacketMaximal();
    let settings = createStandardNegotiatedSettings();

    packet.authenticationData = new Uint8Array(65537);

    validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings);
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("not a 16-bit length buffer");
});

test('Binary connect packet validation - user property name too long', async () => {
    doBinaryUserPropertyNameTooLongTest(createBinaryConnectPacketMaximal());
});

test('Binary connect packet validation - user property value too long', async () => {
    doBinaryUserPropertyValueTooLongTest(createBinaryConnectPacketMaximal());
});

test('Binary connect packet validation - will too long', async () => {
    let packet = createBinaryConnectPacketMaximal();
    let settings = createStandardNegotiatedSettings();

    // @ts-ignore
    packet.will.payload = new Uint8Array(65537);

    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt311, settings); }).toThrow("exceeds established maximum packet size");
    expect(() => { validate.validateBinaryOutboundPacket(packet, model.ProtocolMode.Mqtt5, settings); }).toThrow("exceeds established maximum packet size");
});

// Disconnect Validation

function createExternalDisconnectPacketMaximal() : mqtt5_packet.DisconnectPacket {
    return {
        type: mqtt5_packet.PacketType.Disconnect,
        sessionExpiryIntervalSeconds: 3600,
        reasonCode: mqtt5_packet.DisconnectReasonCode.DisconnectWithWillMessage,
        reasonString: "Imtired",
        serverReference: "somewhere.over.therainbow",
        userProperties: [
            {name: "name", value: "value"},
            {name: "hello", value: "world"}
        ]
    };
}

// user-submitted disconnects

test('External disconnect packet validation - isValid', async () => {
    validate.validateUserSubmittedOutboundPacket(createExternalDisconnectPacketMaximal(), model.ProtocolMode.Mqtt311);
    validate.validateUserSubmittedOutboundPacket(createExternalDisconnectPacketMaximal(), model.ProtocolMode.Mqtt5);
});

test('External disconnect packet validation - undefined reason code', async () => {
    let packet = createExternalDisconnectPacketMaximal();
    // @ts-ignore
    delete packet.reasonCode;

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u8");
});

test('External disconnect packet validation - reason code bad type', async () => {
    let packet = createExternalDisconnectPacketMaximal();
    // @ts-ignore
    packet.reasonCode = "Success";

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u8");
});

test('External disconnect packet validation - reason code bad value', async () => {
    let packet = createExternalDisconnectPacketMaximal();
    // @ts-ignore
    packet.reasonCode = 127;

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid MQTT5 DisconnectReasonCode");
});

test('External disconnect packet validation - session expiry bad type', async () => {
    let packet = createExternalDisconnectPacketMaximal();
    // @ts-ignore
    packet.sessionExpiryIntervalSeconds = "Tomorrow";

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u32");
});

test('External disconnect packet validation - session expiry too large', async () => {
    let packet = createExternalDisconnectPacketMaximal();
    packet.sessionExpiryIntervalSeconds = 256 * 256 * 256 * 256;

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u32");
});

test('External disconnect packet validation - session expiry too small', async () => {
    let packet = createExternalDisconnectPacketMaximal();
    packet.sessionExpiryIntervalSeconds = -1;

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid u32");
});

test('External disconnect packet validation - reason string bad type', async () => {
    let packet = createExternalDisconnectPacketMaximal();
    // @ts-ignore
    packet.reasonString = {};

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External disconnect packet validation - server reference bad type', async () => {
    let packet = createExternalDisconnectPacketMaximal();
    // @ts-ignore
    packet.serverReference = [];

    validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt311);
    expect(() => { validate.validateUserSubmittedOutboundPacket(packet, model.ProtocolMode.Mqtt5); }).toThrow("not a valid string");
});

test('External disconnect packet validation - bad user properties type', async () => {
    doBadUserPropertiesTypeTest(createExternalDisconnectPacketMaximal());
});

test('External disconnect packet validation - user properties name bad type', async () => {
    doBadUserPropertiesBadNameTypeTest(createExternalDisconnectPacketMaximal());
});

test('External disconnect packet validation - user properties name undefined type', async () => {
    doBadUserPropertiesUndefinedNameTest(createExternalDisconnectPacketMaximal());
});

test('External disconnect packet validation - bad user properties value type', async () => {
    doBadUserPropertiesBadValueTypeTest(createExternalDisconnectPacketMaximal());
});

test('External disconnect packet validation - user properties value undefined type', async () => {
    doBadUserPropertiesUndefinedValueTest(createExternalDisconnectPacketMaximal());
});

// binary disconnects

// inbound disconnects