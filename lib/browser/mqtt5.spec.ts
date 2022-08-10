/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5 from "./mqtt5";
import * as test_utils from "@test/mqtt5";
import * as mqtt5_packet from "../common/mqtt5_packet";
import {PayloadFormatIndicator, QoS} from "../common/mqtt5_packet";
import * as mqtt5_common from "../common/mqtt5";
import {v4 as uuid} from "uuid";
import url from "url";
import {HttpsProxyAgent} from "https-proxy-agent";

jest.setTimeout(10000);

function createBrowserSpecificTestConfig (testType: test_utils.SuccessfulConnectionTestType) : mqtt5.Mqtt5ClientConfig {

    let wsOptions : any = {}

    if (test_utils.ClientEnvironmentalConfig.doesTestUseProxy(testType)) {
        let urlOptions: url.UrlWithStringQuery = url.parse(`http://${test_utils.ClientEnvironmentalConfig.PROXY_HOST}:${test_utils.ClientEnvironmentalConfig.PROXY_PORT}`);
        let agent: HttpsProxyAgent  = new HttpsProxyAgent(urlOptions);

        wsOptions.agent = agent;
    }

    let urlFactoryOptions : mqtt5.Mqtt5WebsocketUrlFactoryOptions;
    if (test_utils.ClientEnvironmentalConfig.doesTestUseTls(testType)) {
        urlFactoryOptions = { urlFactory: mqtt5.Mqtt5WebsocketUrlFactoryType.Wss };
        wsOptions.rejectUnauthorized = false;
    } else {
        urlFactoryOptions = { urlFactory: mqtt5.Mqtt5WebsocketUrlFactoryType.Ws };
    }

    return {
        hostName: "unknown",
        port: 0,

        websocketOptions: {
            urlFactoryOptions: urlFactoryOptions,
            wsOptions: wsOptions
        }
    };
}

function makeMaximalConfig() : mqtt5.Mqtt5ClientConfig {

    let urlOptions: url.UrlWithStringQuery = url.parse(`http://${test_utils.ClientEnvironmentalConfig.PROXY_HOST}:${test_utils.ClientEnvironmentalConfig.PROXY_PORT}`);
    let agent: HttpsProxyAgent  = new HttpsProxyAgent(urlOptions);

    return {
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_TLS_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_TLS_PORT,
        sessionBehavior: mqtt5_common.ClientSessionBehavior.RejoinPostSuccess,
        retryJitterMode: mqtt5_common.RetryJitterType.Decorrelated,
        minReconnectDelayMs: 2000,
        maxReconnectDelayMs: 180000,
        minConnectedTimeToResetReconnectDelayMs: 60000,
        connectProperties: {
            keepAliveIntervalSeconds : 1800,
            clientId: `test${uuid()}`,
            username: 'notusingbasicauth',
            password: Buffer.from('notapassword', 'utf-8'),
            sessionExpiryIntervalSeconds: 3600,
            requestResponseInformation: true,
            requestProblemInformation: true,
            receiveMaximum: 100,
            maximumPacketSizeBytes: 256 * 1024,
            willDelayIntervalSeconds: 60,
            will: {
                topicName: `will/topic${uuid()}`,
                payload: Buffer.from("WillPayload", "utf-8"),
                qos: QoS.AtLeastOnce,
                retain: false,
                payloadFormat: PayloadFormatIndicator.Utf8,
                messageExpiryIntervalSeconds: 60,
                responseTopic: "talk/to/me",
                correlationData: Buffer.from("Sekrits", "utf-8"),
                contentType: "not-json",
                userProperties: [
                    {name:"will-name", value:"will-value"}
                ]
            },
            userProperties: [
                {name: "hello", value: "there"}
            ]
        },
        connectTimeoutMs: 30000,
        websocketOptions: {
            urlFactoryOptions: {
                urlFactory: mqtt5.Mqtt5WebsocketUrlFactoryType.Wss
            },
            wsOptions: {
                rejectUnauthorized: false,
                agent : agent
            }
        }
    };
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Connection Success - Websocket Mqtt', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT, createBrowserSpecificTestConfig);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH))('Connection Success - Websocket Mqtt with basic authentication', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH, createBrowserSpecificTestConfig);
});


test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS))('Connection Success - Websocket Mqtt with TLS', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS, createBrowserSpecificTestConfig);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY))('Connection Success - Websocket Mqtt with tls through an http proxy', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY, createBrowserSpecificTestConfig);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY))('Connection Success - Websocket Mqtt with everything set', async () => {
    let maximalConfig : mqtt5.Mqtt5ClientConfig = makeMaximalConfig();

    // @ts-ignore
    await test_utils.testConnect(new mqtt5.Mqtt5Client(maximalConfig));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Connection Failure - Websocket MQTT Bad host', async () => {
    // @ts-ignore
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: 'localhst',
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Connection Failure - Websocket MQTT Bad port', async () => {
    // @ts-ignore
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: 1
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT))('Connection Failure - Websocket MQTT protocol mismatch', async () => {
    // @ts-ignore
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_PORT
    }));
});

test('Connection Failure - Websocket MQTT socket timeout', async () => {
    // @ts-ignore
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: "example.com",
        port: 81,
        connectTimeoutMs: 3000,
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS))('Connection Failure - Websocket MQTT Expected TLS', async () => {
    // @ts-ignore
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_TLS_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_TLS_PORT
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Connection Failure - Websocket MQTT Expected Plain text', async () => {
    // @ts-ignore
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        websocketOptions: {
            urlFactoryOptions: {
                urlFactory: mqtt5.Mqtt5WebsocketUrlFactoryType.Wss
            }
        }
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH))('Connection Failure - Websocket Mqtt connection with basic authentication bad credentials', async () => {
    // @ts-ignore
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_BASIC_AUTH_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_BASIC_AUTH_PORT,
        connectProperties : {
            keepAliveIntervalSeconds: 1200,
            username: "Wrong",
            password: Buffer.from("NotAPassword", "utf-8")
        }
    }));
});

function testFailedClientConstruction(config: mqtt5.Mqtt5ClientConfig) {
    expect(() => {
        new mqtt5.Mqtt5Client(config);
    }).toThrow();
}

function getBaseConstructionFailureConfig() : mqtt5.Mqtt5ClientConfig {
    return {
        hostName : "localhost",
        port : 1883,
        connectProperties: {
            keepAliveIntervalSeconds: 1200,
        }
    }
}

test('Client construction failure - bad config, keep alive underflow', async () => {
    let config : mqtt5.Mqtt5ClientConfig = getBaseConstructionFailureConfig();
    // @ts-ignore
    config.connectProperties.keepAliveIntervalSeconds = -1000;
    testFailedClientConstruction(config);
});

test('Client construction failure - bad config, keep alive overflow', async () => {
    let config : mqtt5.Mqtt5ClientConfig = getBaseConstructionFailureConfig();
    // @ts-ignore
    config.connectProperties.keepAliveIntervalSeconds = 65536;
    testFailedClientConstruction(config);
});

test('Client construction failure - bad config, session expiry underflow', async () => {
    let config : mqtt5.Mqtt5ClientConfig = getBaseConstructionFailureConfig();
    // @ts-ignore
    config.connectProperties.sessionExpiryIntervalSeconds = -1000;
    testFailedClientConstruction(config);
});

test('Client construction failure - bad config, session expiry overflow', async () => {
    let config : mqtt5.Mqtt5ClientConfig = getBaseConstructionFailureConfig();
    // @ts-ignore
    config.connectProperties.sessionExpiryIntervalSeconds = 4294967296;
    testFailedClientConstruction(config);
});

test('Client construction failure - bad config, receive maximum underflow', async () => {
    let config : mqtt5.Mqtt5ClientConfig = getBaseConstructionFailureConfig();
    // @ts-ignore
    config.connectProperties.receiveMaximum = -1000;
    testFailedClientConstruction(config);
});

test('Client construction failure - bad config, receive maximum overflow', async () => {
    let config : mqtt5.Mqtt5ClientConfig = getBaseConstructionFailureConfig();
    // @ts-ignore
    config.connectProperties.receiveMaximum = 65536;
    testFailedClientConstruction(config);
});

test('Client construction failure - bad config, maximum packet size underflow', async () => {
    let config : mqtt5.Mqtt5ClientConfig = getBaseConstructionFailureConfig();
    // @ts-ignore
    config.connectProperties.maximumPacketSizeBytes = 0;
    testFailedClientConstruction(config);
});

test('Client construction failure - bad config, maximum packet size overflow', async () => {
    let config : mqtt5.Mqtt5ClientConfig = getBaseConstructionFailureConfig();
    // @ts-ignore
    config.connectProperties.maximumPacketSizeBytes = 4294967296;
    testFailedClientConstruction(config);
});

test('Client construction failure - bad config, will delay interval underflow', async () => {
    let config : mqtt5.Mqtt5ClientConfig = getBaseConstructionFailureConfig();
    // @ts-ignore
    config.connectProperties.willDelayIntervalSeconds = -5;
    // @ts-ignore
    config.connectProperties.will = {
        topicName: "derp",
        qos: mqtt5_packet.QoS.AtLeastOnce
    }
    testFailedClientConstruction(config);
});

test('Client construction failure - bad config, will delay interval overflow', async () => {
    let config : mqtt5.Mqtt5ClientConfig = getBaseConstructionFailureConfig();
    // @ts-ignore
    config.connectProperties.willDelayIntervalSeconds = 4294967296;
    // @ts-ignore
    config.connectProperties.will = {
        topicName: "derp",
        qos: mqtt5_packet.QoS.AtLeastOnce
    }
    testFailedClientConstruction(config);
});


function createOperationFailureClient() : mqtt5.Mqtt5Client {
    let config : mqtt5.Mqtt5ClientConfig = {
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT
    }

    return new mqtt5.Mqtt5Client(config);
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Disconnection failure - session expiry underflow', async () => {
    // @ts-ignore
    await test_utils.testDisconnectValidationFailure(createOperationFailureClient(), -5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Disconnection failure - session expiry overflow', async () => {
    // @ts-ignore
    await test_utils.testDisconnectValidationFailure(createOperationFailureClient(), 4294967296);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Publish failure - message expiry underflow', async () => {
    // @ts-ignore
    await test_utils.testPublishValidationFailure(createOperationFailureClient(), -5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Publish failure - message expiry overflow', async () => {
    // @ts-ignore
    await test_utils.testPublishValidationFailure(createOperationFailureClient(), 4294967297);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Subscribe failure - subscription identifier underflow', async () => {
    // @ts-ignore
    await test_utils.testSubscribeValidationFailure(createOperationFailureClient(), -5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Subscribe failure - subscription identifier overflow', async () => {
    // @ts-ignore
    await test_utils.testSubscribeValidationFailure(createOperationFailureClient(), 4294967297);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Negotiated settings - minimal', async () => {
    let client: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        connectProperties: {
            keepAliveIntervalSeconds: 1500
        }
    });

    // @ts-ignore
    let settings : mqtt5_common.NegotiatedSettings = await test_utils.testNegotiatedSettings(client);

    expect(settings.serverKeepAlive).toEqual(1500);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Negotiated settings - maximal', async () => {
    let clientId : string = "test-" + Math.floor(Math.random() * 100000000);
    let client: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        connectProperties: {
            keepAliveIntervalSeconds: 1800,
            sessionExpiryIntervalSeconds: 600,
            clientId: clientId
        }
    });

    // @ts-ignore
    let settings : mqtt5_common.NegotiatedSettings = await test_utils.testNegotiatedSettings(client);

    expect(settings.serverKeepAlive).toEqual(1800);
    expect(settings.sessionExpiryInterval).toEqual(600);
    expect(settings.clientId).toEqual(clientId);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Sub - Pub QoS 0 - Unsub', async () => {
    let clientId : string = `test-${uuid()}`;
    let topic : string = `test-${uuid()}`;
    let testPayload : Buffer = Buffer.from("Derp", "utf-8");

    let client : mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        connectProperties: {
            keepAliveIntervalSeconds: 1200,
            clientId: clientId
        }
    });

    let qos : mqtt5_packet.QoS = QoS.AtMostOnce;
    let receivedCount : number = 0;
    client.on('messageReceived', (packet: mqtt5_packet.PublishPacket) => {
        expect(packet.qos).toEqual(qos);
        expect(packet.payload).toEqual(testPayload);
        expect(packet.topicName).toEqual(topic);
        receivedCount++;
    });

    // @ts-ignore
    await test_utils.subPubUnsubTest(client, qos, topic, testPayload);

    expect(receivedCount).toEqual(1);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Sub - Pub QoS 1 - Unsub', async () => {
    let clientId : string = `test-${uuid()}`;
    let topic : string = `test-${uuid()}`;
    let testPayload : Buffer = Buffer.from("Derp", "utf-8");

    let client : mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        connectProperties: {
            keepAliveIntervalSeconds: 1200,
            clientId: clientId
        }
    });

    let qos : mqtt5_packet.QoS = QoS.AtLeastOnce;
    let receivedCount : number = 0;
    client.on('messageReceived', (packet: mqtt5_packet.PublishPacket) => {
        expect(packet.qos).toEqual(qos);
        expect(packet.payload).toEqual(testPayload);
        expect(packet.topicName).toEqual(topic);
        receivedCount++;
    });

    // @ts-ignore
    await test_utils.subPubUnsubTest(client, qos, topic, testPayload);

    expect(receivedCount).toEqual(1);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Will test', async () => {
    let publisherClientId : string = `publisher-${uuid()}`;
    let subscriberClientId : string = `subscriber-${uuid()}`;
    let willPayload : Buffer = Buffer.from("ToMyChildrenIBequeathNothing", "utf-8");
    let willTopic : string = `will/test${uuid()}`;

    let publisher : mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        connectProperties: {
            keepAliveIntervalSeconds: 1200,
            clientId: publisherClientId,
            willDelayIntervalSeconds : 0,
            will : {
                topicName: willTopic,
                qos: QoS.AtLeastOnce,
                payload: willPayload
            }
        }
    });

    let subscriber : mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        connectProperties: {
            keepAliveIntervalSeconds: 1200,
            clientId: subscriberClientId
        }
    });

    let willReceived : boolean = false;
    subscriber.on('messageReceived', (packet: mqtt5_packet.PublishPacket) => {
        expect(packet.qos).toEqual(QoS.AtLeastOnce);
        expect(new Buffer(packet.payload as ArrayBuffer)).toEqual(willPayload);
        expect(packet.topicName).toEqual(willTopic);
        willReceived = true;
    });

    // @ts-ignore
    await test_utils.willTest(publisher, subscriber, willTopic);

    expect(willReceived).toEqual(true);
});

function createNullOperationClient() : mqtt5.Mqtt5Client {
    return new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        connectProperties: {
            keepAliveIntervalSeconds: 1800,
            clientId: `null-${uuid()}`
        }
    });
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Operation failure - null subscribe', async () => {
    // @ts-ignore
    await test_utils.nullSubscribeTest(createNullOperationClient());
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Operation failure - null unsubscribe', async () => {
    // @ts-ignore
    await test_utils.nullUnsubscribeTest(createNullOperationClient());
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Operation failure - null publish', async () => {
    // @ts-ignore
    await test_utils.nullPublishTest(createNullOperationClient());
});