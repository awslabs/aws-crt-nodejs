/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as test_utils from "@test/mqtt5";
import * as mqtt5 from "./mqtt5";
import {ClientBootstrap, ClientTlsContext, SocketDomain, SocketOptions, SocketType, TlsContextOptions} from "./io";
import {HttpProxyAuthenticationType, HttpProxyConnectionType, HttpRequest} from "./http";
import * as mqtt5_packet from "../common/mqtt5_packet";
import {PayloadFormatIndicator, QoS} from "../common/mqtt5_packet";
import * as mqtt5_common from "../common/mqtt5";
import {v4 as uuid} from "uuid";

jest.setTimeout(10000);

function createNodeSpecificTestConfig (testType: test_utils.SuccessfulConnectionTestType) : mqtt5.Mqtt5ClientConfig {

    let tlsCtx = undefined;

    if (test_utils.ClientEnvironmentalConfig.doesTestUseTls(testType)) {
        let tls_ctx_opt = new TlsContextOptions();
        tls_ctx_opt.verify_peer = false;

        tlsCtx = new ClientTlsContext(tls_ctx_opt);
    }

    let wsTransform = undefined;
    if (test_utils.ClientEnvironmentalConfig.doesTestUseWebsockets(testType)) {
        wsTransform = (request: HttpRequest, done: (error_code?: number) => void) =>
        {
            done(0);
        };
    }

    let proxyOptions = undefined;
    if (test_utils.ClientEnvironmentalConfig.doesTestUseProxy(testType)) {
        proxyOptions = new mqtt5.HttpProxyOptions(
            test_utils.ClientEnvironmentalConfig.PROXY_HOST,
            test_utils.ClientEnvironmentalConfig.PROXY_PORT,
            HttpProxyAuthenticationType.None,
            undefined,
            undefined,
            undefined,
            HttpProxyConnectionType.Tunneling);
    }

    return {
        hostName: "unknown",
        port: 0,
        tlsCtx: tlsCtx,
        httpProxyOptions: proxyOptions,
        websocketHandshakeTransform: wsTransform
    };
}

function makeMaximalConfig() : mqtt5.Mqtt5ClientConfig {
    let tls_ctx_opt = new TlsContextOptions();
    tls_ctx_opt.verify_peer = false;

    return {
        hostName: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_TLS_HOST,
        port: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_TLS_PORT,
        sessionBehavior: mqtt5_common.ClientSessionBehavior.RejoinPostSuccess,
        retryJitterMode: mqtt5_common.RetryJitterType.Decorrelated,
        minReconnectDelayMs: 2000,
        maxReconnectDelayMs: 180000,
        minConnectedTimeToResetReconnectDelayMs: 60000,
        connackTimeoutMs: 20000,
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
        offlineQueueBehavior: mqtt5.ClientOperationQueueBehavior.FailQos0PublishOnDisconnect,
        pingTimeoutMs: 30000,
        operationTimeoutSeconds: 90,
        clientBootstrap: new ClientBootstrap(),
        socketOptions: new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 10000, true, 60, 60, 3),
        tlsCtx: new ClientTlsContext(tls_ctx_opt),
        httpProxyOptions: new mqtt5.HttpProxyOptions(
            test_utils.ClientEnvironmentalConfig.PROXY_HOST,
            test_utils.ClientEnvironmentalConfig.PROXY_PORT,
            HttpProxyAuthenticationType.None,
            undefined,
            undefined,
            undefined,
            HttpProxyConnectionType.Tunneling),
        extendedValidationAndFlowControlOptions: mqtt5.ClientExtendedValidationAndFlowControl.AwsIotCoreDefaults
    };
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT))('Connection Success - Direct Mqtt', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT, createNodeSpecificTestConfig);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH))('Connection Success - Direct Mqtt with basic authentication', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH, createNodeSpecificTestConfig);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS))('Connection Success - Direct Mqtt with TLS', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS, createNodeSpecificTestConfig);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY))('Connection Success - Direct Mqtt with tls through an http proxy', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY, createNodeSpecificTestConfig);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY))('Connection Success - Direct Mqtt with everything set', async () => {
    let maximalConfig : mqtt5.Mqtt5ClientConfig = makeMaximalConfig();

    await test_utils.testConnect(new mqtt5.Mqtt5Client(maximalConfig));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Connection Success - Websocket Mqtt', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT, createNodeSpecificTestConfig);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH))('Connection Success - Websocket Mqtt with basic authentication', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH, createNodeSpecificTestConfig);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS))('Connection Success - Websocket Mqtt with TLS', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS, createNodeSpecificTestConfig);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY))('Connection Success - Websocket Mqtt with tls through an http proxy', async () => {
    await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY, createNodeSpecificTestConfig);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY))('Connection Success - Websocket Mqtt with everything set', async () => {
    let maximalConfig : mqtt5.Mqtt5ClientConfig = makeMaximalConfig();
    maximalConfig.hostName = test_utils.ClientEnvironmentalConfig.WS_MQTT_TLS_HOST;
    maximalConfig.port = test_utils.ClientEnvironmentalConfig.WS_MQTT_TLS_PORT;
    maximalConfig.websocketHandshakeTransform = (request: HttpRequest, done: (error_code?: number) => void) => { done(0); };

    await test_utils.testConnect(new mqtt5.Mqtt5Client(maximalConfig));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT))('Connection Failure - Direct MQTT Bad host', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: 'localhst',
        port: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_PORT
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT))('Connection Failure - Direct MQTT Bad port', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_HOST,
        port: 1
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Connection Failure - Direct MQTT protocol mismatch', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT
    }));
});

test('Connection Failure - Direct MQTT socket timeout', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: "example.com",
        port: 81,
        socketOptions: new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 2000)
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS))('Connection Failure - Direct MQTT Expected TLS', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_TLS_HOST,
        port: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_TLS_PORT
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT))('Connection Failure - Direct MQTT Expected Plain text', async () => {
    let tls_ctx_opt : TlsContextOptions = new TlsContextOptions();
    tls_ctx_opt.verify_peer = false;

    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_PORT,
        tlsCtx : new ClientTlsContext(tls_ctx_opt),
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH))('Connection Failure - Direct Mqtt connection with basic authentication bad credentials', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_BASIC_AUTH_HOST,
        port: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_BASIC_AUTH_PORT,
        connectProperties : {
            keepAliveIntervalSeconds: 1200,
            username: "Wrong",
            password: Buffer.from("NotAPassword", "utf-8")
        }
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Connection Failure - Websocket MQTT Bad host', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: 'localhst',
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Connection Failure - Websocket MQTT Bad port', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: 1
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.DIRECT_MQTT))('Connection Failure - Websocket MQTT protocol mismatch', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.DIRECT_MQTT_PORT,
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); }
    }));
});

test('Connection Failure - Websocket MQTT socket timeout', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: "example.com",
        port: 81,
        socketOptions: new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 2000),
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); }
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS))('Connection Failure - Websocket MQTT Expected TLS', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_TLS_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_TLS_PORT,
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); }
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Connection Failure - Websocket MQTT Expected Plain text', async () => {
    let tls_ctx_opt : TlsContextOptions = new TlsContextOptions();
    tls_ctx_opt.verify_peer = false;

    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        tlsCtx : new ClientTlsContext(tls_ctx_opt),
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); }
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH))('Connection Failure - Websocket Mqtt connection with basic authentication bad credentials', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_BASIC_AUTH_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_BASIC_AUTH_PORT,
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); },
        connectProperties : {
            keepAliveIntervalSeconds: 1200,
            username: "Wrong",
            password: Buffer.from("NotAPassword", "utf-8")
        }
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Connection Failure - Websocket MQTT Bad Handshake', async () => {
    let tls_ctx_opt : TlsContextOptions = new TlsContextOptions();
    tls_ctx_opt.verify_peer = false;

    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        tlsCtx : new ClientTlsContext(tls_ctx_opt),
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => {
            request.method = 'PUT';
            done(0);
        }
    }));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Connection Failure - Websocket MQTT Failed Handshake', async () => {
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(1); }
    }));
});

function testFailedClientConstruction(config: mqtt5.Mqtt5ClientConfig) {
    expect(() => { new mqtt5.Mqtt5Client(config); }).toThrow();
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
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); }
    }

    return new mqtt5.Mqtt5Client(config);
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Disconnection failure - session expiry underflow', async () => {
    await test_utils.testDisconnectValidationFailure(createOperationFailureClient(), -5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Disconnection failure - session expiry overflow', async () => {
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
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); },
        connectProperties: {
            keepAliveIntervalSeconds: 1500
        }
    });

    let settings : mqtt5_common.NegotiatedSettings = await test_utils.testNegotiatedSettings(client);

    expect(settings.serverKeepAlive).toEqual(1500);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Negotiated settings - maximal', async () => {
    let clientId : string = "test-" + Math.floor(Math.random() * 100000000);
    let client: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); },
        connectProperties: {
            keepAliveIntervalSeconds: 1800,
            sessionExpiryIntervalSeconds: 600,
            clientId: clientId
        }
    });

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
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); },
        connectProperties: {
            keepAliveIntervalSeconds: 1200,
            clientId: clientId
        }
    });

    let qos : mqtt5_packet.QoS = QoS.AtMostOnce;
    let receivedCount : number = 0;
    client.on('messageReceived', (packet: mqtt5_packet.PublishPacket) => {
        expect(packet.qos).toEqual(qos);
        expect(Buffer.from(packet.payload as ArrayBuffer)).toEqual(testPayload);
        expect(packet.topicName).toEqual(topic);
        receivedCount++;
    });

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
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); },
        connectProperties: {
            keepAliveIntervalSeconds: 1200,
            clientId: clientId
        }
    });

    let qos : mqtt5_packet.QoS = QoS.AtLeastOnce;
    let receivedCount : number = 0;
    client.on('messageReceived', (packet: mqtt5_packet.PublishPacket) => {
        expect(packet.qos).toEqual(qos);
        expect(Buffer.from(packet.payload as ArrayBuffer)).toEqual(testPayload);
        expect(packet.topicName).toEqual(topic);
        receivedCount++;
    });

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
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); },
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
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); },
        connectProperties: {
            keepAliveIntervalSeconds: 1200,
            clientId: subscriberClientId
        }
    });

    let willReceived : boolean = false;
    subscriber.on('messageReceived', (packet: mqtt5_packet.PublishPacket) => {
        expect(packet.qos).toEqual(QoS.AtLeastOnce);
        expect(Buffer.from(packet.payload as ArrayBuffer)).toEqual(willPayload);
        expect(packet.topicName).toEqual(willTopic);
        willReceived = true;
    });

    await test_utils.willTest(publisher, subscriber, willTopic);

    expect(willReceived).toEqual(true);
});

function createNullOperationClient() : mqtt5.Mqtt5Client {
    return new mqtt5.Mqtt5Client({
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); },
        connectProperties: {
            keepAliveIntervalSeconds: 1800,
            clientId: `null-${uuid()}`
        }
    });
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Operation failure - null subscribe', async () => {
    await test_utils.nullSubscribeTest(createNullOperationClient());
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Operation failure - null unsubscribe', async () => {
    await test_utils.nullUnsubscribeTest(createNullOperationClient());
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Operation failure - null publish', async () => {
    await test_utils.nullPublishTest(createNullOperationClient());
});