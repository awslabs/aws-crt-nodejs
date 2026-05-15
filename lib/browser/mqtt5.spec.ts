/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5 from "./mqtt5";
import * as test_utils from "@test/mqtt5";
import * as retry from "@test/retry";
import {v4 as uuid} from "uuid";
import url from "url";
import {HttpsProxyAgent} from "https-proxy-agent";
import * as auth from "./auth";
import {once} from "events";
import * as model from "./mqtt_internal/model";
import * as mqtt_server from "@test/mqtt_server";
import * as promise from "../common/promise";
import * as mqtt_shared from "../common/mqtt_shared";
import * as mqtt5_packet from "../common/mqtt5_packet";

jest.setTimeout(30000);

function createBrowserSpecificTestConfig (testType: test_utils.SuccessfulConnectionTestType) : mqtt5.Mqtt5ClientConfig {

    let wsOptions : any = {
        perMessageDeflate: false
    }

    if (test_utils.ClientEnvironmentalConfig.doesTestUseProxy(testType)) {
        let urlOptions: url.UrlWithStringQuery = url.parse(`http://${test_utils.ClientEnvironmentalConfig.PROXY_HOST}:${test_utils.ClientEnvironmentalConfig.PROXY_PORT}`);
        let agent = new HttpsProxyAgent(urlOptions.href!);

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
    let agent = new HttpsProxyAgent(urlOptions.href!);

    return {
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_TLS_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_TLS_PORT,
        sessionBehavior: mqtt5.ClientSessionBehavior.RejoinPostSuccess,
        retryJitterMode: mqtt5.RetryJitterType.Decorrelated,
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
                qos: mqtt5.QoS.AtLeastOnce,
                retain: false,
                payloadFormat: mqtt5.PayloadFormatIndicator.Utf8,
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
    await retry.networkTimeoutRetryWrapper( async () => {
        await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT, createBrowserSpecificTestConfig);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH))('Connection Success - Websocket Mqtt with basic authentication', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH, createBrowserSpecificTestConfig);
    })
});


test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS))('Connection Success - Websocket Mqtt with TLS', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS, createBrowserSpecificTestConfig);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY))('Connection Success - Websocket Mqtt with tls through an http proxy', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        await test_utils.testSuccessfulConnection(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY, createBrowserSpecificTestConfig);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY))('Connection Success - Websocket Mqtt with everything set', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        let maximalConfig: mqtt5.Mqtt5ClientConfig = makeMaximalConfig();

        // @ts-ignore
        await test_utils.testConnect(new mqtt5.Mqtt5Client(maximalConfig));
    })
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
        port: 9999
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
        qos: mqtt5.QoS.AtLeastOnce
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
        qos: mqtt5.QoS.AtLeastOnce
    }
    testFailedClientConstruction(config);
});

function createWsIotCoreClientConfig() : mqtt5.Mqtt5ClientConfig {
    let provider: auth.StaticCredentialProvider = new auth.StaticCredentialProvider({
        aws_access_id: test_utils.ClientEnvironmentalConfig.AWS_IOT_ACCESS_KEY_ID,
        aws_secret_key: test_utils.ClientEnvironmentalConfig.AWS_IOT_SECRET_ACCESS_KEY,
        aws_sts_token: test_utils.ClientEnvironmentalConfig.AWS_IOT_SESSION_TOKEN,
        aws_region: "us-east-1"
    });

    let websocketConfig: mqtt5.Mqtt5WebsocketConfig = {
        urlFactoryOptions: {
            urlFactory: mqtt5.Mqtt5WebsocketUrlFactoryType.Sigv4,
            region: "us-east-1",
            credentialsProvider: provider
        }
    };

    let config : mqtt5.Mqtt5ClientConfig = {
        hostName: test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        port: 443,
        connectProperties: {
            keepAliveIntervalSeconds: 1200
        },
        websocketOptions: websocketConfig
    }

    return config;
}

function createOperationFailureClient() : mqtt5.IMqtt5Client {
    return new mqtt5.Mqtt5Client(createWsIotCoreClientConfig());
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Disconnection failure - session expiry underflow', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        // @ts-ignore
        await test_utils.testDisconnectValidationFailure(createOperationFailureClient() as mqtt5.Mqtt5Client, -5);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Disconnection failure - session expiry overflow', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        // @ts-ignore
        await test_utils.testDisconnectValidationFailure(createOperationFailureClient() as mqtt5.Mqtt5Client, 4294967296);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Publish failure - message expiry underflow', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        // @ts-ignore
        await test_utils.testPublishValidationFailure(createOperationFailureClient(), -5);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Publish failure - message expiry overflow', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        // @ts-ignore
        await test_utils.testPublishValidationFailure(createOperationFailureClient(), 4294967297);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Subscribe failure - subscription identifier underflow', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        // @ts-ignore
        await test_utils.testSubscribeValidationFailure(createOperationFailureClient(), -5);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Subscribe failure - subscription identifier overflow', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        // @ts-ignore
        await test_utils.testSubscribeValidationFailure(createOperationFailureClient(), 4294967297);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Negotiated settings - minimal', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        let config: mqtt5.Mqtt5ClientConfig = createWsIotCoreClientConfig();

        if (config.connectProperties) {
            config.connectProperties.keepAliveIntervalSeconds = 600;
        }

        let client: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(config);

        // @ts-ignore
        let settings: mqtt5_common.NegotiatedSettings = await test_utils.testNegotiatedSettings(client);

        expect(settings.serverKeepAlive).toEqual(600);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Negotiated settings - maximal', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        let clientId: string = "test-" + Math.floor(Math.random() * 100000000);

        let config: mqtt5.Mqtt5ClientConfig = createWsIotCoreClientConfig();

        if (config.connectProperties) {
            config.connectProperties.keepAliveIntervalSeconds = 600;
            config.connectProperties.sessionExpiryIntervalSeconds = 700
            config.connectProperties.clientId = clientId;
        }

        let client: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(config);

        // @ts-ignore
        let settings: mqtt5_common.NegotiatedSettings = await test_utils.testNegotiatedSettings(client);

        expect(settings.serverKeepAlive).toEqual(600);
        // expect(settings.sessionExpiryInterval).toEqual(700); TODO: restore once IoT Core fixes session expiry
        expect(settings.clientId).toEqual(clientId);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Negotiated settings - always rejoin session', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        let clientId: string = `test-${uuid()}`;
        let config: mqtt5.Mqtt5ClientConfig = createWsIotCoreClientConfig();
        config.connectProperties = {
            clientId: clientId,
            keepAliveIntervalSeconds: 600,
            sessionExpiryIntervalSeconds: 3600,
        };

        let client: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(config);

        // @ts-ignore
        await test_utils.testNegotiatedSettings(client, false);

        config.sessionBehavior = mqtt5.ClientSessionBehavior.RejoinAlways;
        let forcedRejoinClient: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(config);

        // @ts-ignore
        await test_utils.testNegotiatedSettings(forcedRejoinClient, true);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Sub - Pub QoS 0 - Unsub', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        let topic: string = `test/${uuid()}`;
        let testPayload: Buffer = Buffer.from("Derp", "utf-8");

        let client: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(createWsIotCoreClientConfig());

        let qos: mqtt5.QoS = mqtt5.QoS.AtMostOnce;
        let receivedCount: number = 0;
        client.on('messageReceived', (eventData: mqtt5.MessageReceivedEvent) => {
            let packet: mqtt5.PublishPacket = eventData.message;

            expect(packet.qos).toEqual(qos);
            expect(packet.payload).toEqual(testPayload);
            expect(packet.topicName).toEqual(topic);
            receivedCount++;
        });

        // @ts-ignore
        await test_utils.subPubUnsubTest(client, qos, topic, testPayload);

        expect(receivedCount).toEqual(1);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Sub - Pub QoS 1 - Unsub', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        let topic: string = `test/${uuid()}`;
        let testPayload: Buffer = Buffer.from("Derp", "utf-8");

        let client: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(createWsIotCoreClientConfig());

        let qos: mqtt5.QoS = mqtt5.QoS.AtLeastOnce;
        let receivedCount: number = 0;
        client.on('messageReceived', (eventData: mqtt5.MessageReceivedEvent) => {
            let packet: mqtt5.PublishPacket = eventData.message;

            expect(packet.qos).toEqual(qos);
            expect(packet.payload).toEqual(testPayload);
            expect(packet.topicName).toEqual(topic);
            receivedCount++;
        });

        // @ts-ignore
        await test_utils.subPubUnsubTest(client, qos, topic, testPayload);

        expect(receivedCount).toEqual(1);
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Will test', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        let willPayload: Buffer = Buffer.from("ToMyChildrenIBequeathNothing", "utf-8");
        let willTopic: string = `test/will/test${uuid()}`;

        let publisherConfig: mqtt5.Mqtt5ClientConfig = createWsIotCoreClientConfig();

        if (publisherConfig.connectProperties) {
            publisherConfig.connectProperties.willDelayIntervalSeconds = 0;
            publisherConfig.connectProperties.will = {
                topicName: willTopic,
                qos: mqtt5.QoS.AtLeastOnce,
                payload: willPayload
            };
        }

        let publisher: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(publisherConfig);

        let subscriber: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(createWsIotCoreClientConfig());

        let willReceived: boolean = false;
        subscriber.on('messageReceived', (eventData: mqtt5.MessageReceivedEvent) => {
            let packet: mqtt5.PublishPacket = eventData.message;

            expect(packet.qos).toEqual(mqtt5.QoS.AtLeastOnce);
            expect(Buffer.from(packet.payload as ArrayBuffer)).toEqual(willPayload);
            expect(packet.topicName).toEqual(willTopic);
            willReceived = true;
        });

        // @ts-ignore
        await test_utils.willTest(publisher, subscriber, willTopic);

        expect(willReceived).toEqual(true);
    })
});

function createNullOperationClient() : mqtt5.Mqtt5Client {
    return new mqtt5.Mqtt5Client(createWsIotCoreClientConfig())
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Operation failure - null subscribe', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        // @ts-ignore
        await test_utils.nullSubscribeTest(createNullOperationClient());
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Operation failure - null unsubscribe', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        // @ts-ignore
        await test_utils.nullUnsubscribeTest(createNullOperationClient());
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Operation failure - null publish', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        // @ts-ignore
        await test_utils.nullPublishTest(createNullOperationClient());
    })
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Retain test', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        let config: mqtt5.Mqtt5ClientConfig = createWsIotCoreClientConfig();

        // @ts-ignore
        await test_utils.doRetainTest(new mqtt5.Mqtt5Client(config), new mqtt5.Mqtt5Client(config), new mqtt5.Mqtt5Client(config));
    })
});

class ClientTestFixture {

    private server : mqtt_server.MqttServer;

    constructor(config: mqtt_server.MqttServerConfig) {
        this.server = new mqtt_server.MqttServer(config);
    }

    async start() {
        await this.server.start();
    }

    getServer() : mqtt_server.MqttServer { return this.server; }
}

function buildDefaultClientConfig(fixture : ClientTestFixture) : mqtt5.Mqtt5ClientConfig {
    return {
        hostName: "localhost",
        port: fixture.getServer().getPort(),
        sessionBehavior: mqtt5.ClientSessionBehavior.Default,
        connectProperties: {
            keepAliveIntervalSeconds: 120
        },
        connectTimeoutMs: 10000,
        websocketOptions: {
            urlFactoryOptions: {
                urlFactory: mqtt5.Mqtt5WebsocketUrlFactoryType.Ws
            }
        }
    };
}

test('Manual Puback - Acquire', async () => {
    let config: mqtt_server.MqttServerConfig = {
        protocolVersion: model.ProtocolMode.Mqtt5
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let clientConfig = buildDefaultClientConfig(fixture);
    let client = new mqtt5.Mqtt5Client(clientConfig);

    let connectionSuccess = once(client, "connectionSuccess");
    let stopped = once(client, "stopped");

    client.start();
    await connectionSuccess;

    let pubackReceived : boolean = false;
    let ackHandlePromise : promise.LiftedPromise<mqtt_shared.PublishAcknowledgementHandle> = promise.newLiftedPromise<mqtt_shared.PublishAcknowledgementHandle>();

    client.addListener(mqtt5.Mqtt5Client.MESSAGE_RECEIVED, (event : mqtt5.MessageReceivedEvent) => {
        if (event.message.qos != mqtt5_packet.QoS.AtMostOnce) {
            expect(event.acknowledgementControl).toBeDefined();

            // @ts-ignore
            ackHandlePromise.resolve(event.acknowledgementControl.acquireHandle());
        }
    });

    let serverPuback= promise.newLiftedPromise<mqtt5_packet.PubackPacket>();
    fixture.getServer().addListener('packetReceived', (packet : mqtt5_packet.IPacket) => {
        if (packet.type == mqtt5_packet.PacketType.Puback) {
            pubackReceived = true;
            serverPuback.resolve(packet as mqtt5_packet.PubackPacket);
        }
    });

    await client.publish({
        topicName: "test/topic",
        qos: mqtt5_packet.QoS.AtLeastOnce
    });

    let ackHandle : mqtt_shared.PublishAcknowledgementHandle = await ackHandlePromise.promise;

    // Awkward way of trying to check that a puback didn't get automatically sent.  We wait for a generous period of
    // time and verify that the flag is still false (we can't check the promise for non-resolution).
    await new Promise((resolve, reject) => setTimeout(resolve, 1000));

    expect(pubackReceived).toBe(false);

    ackHandle.invokeAcknowledgement();

    await serverPuback.promise;
    expect(pubackReceived).toBe(true);

    client.stop();
    await stopped;

    fixture.getServer().stop();
});

test('Manual Puback - No Acquire', async () => {
    let config: mqtt_server.MqttServerConfig = {
        protocolVersion: model.ProtocolMode.Mqtt5
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let clientConfig = buildDefaultClientConfig(fixture);
    let client = new mqtt5.Mqtt5Client(clientConfig);

    let connectionSuccess = once(client, "connectionSuccess");
    let stopped = once(client, "stopped");

    client.start();
    await connectionSuccess;

    let pubackReceived : boolean = false;
    let serverPuback= promise.newLiftedPromise<mqtt5_packet.PubackPacket>();
    fixture.getServer().addListener('packetReceived', (packet : mqtt5_packet.IPacket) => {
        if (packet.type == mqtt5_packet.PacketType.Puback) {
            pubackReceived = true;
            serverPuback.resolve(packet as mqtt5_packet.PubackPacket);
        }
    });

    await client.publish({
        topicName: "test/topic",
        qos: mqtt5_packet.QoS.AtLeastOnce
    });

    await serverPuback.promise;
    expect(pubackReceived).toBe(true);

    client.stop();
    await stopped;

    fixture.getServer().stop();
});