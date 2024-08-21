/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5 from "@awscrt/mqtt5";
import {once} from "events";
import {v4 as uuid} from "uuid";
import {CrtError} from "@awscrt";

export enum SuccessfulConnectionTestType {
    DIRECT_MQTT = 0,
    DIRECT_MQTT_WITH_BASIC_AUTH = 1,
    DIRECT_MQTT_WITH_TLS = 2,
    DIRECT_MQTT_WITH_TLS_VIA_PROXY = 3,
    WS_MQTT = 4,
    WS_MQTT_WITH_BASIC_AUTH = 5,
    WS_MQTT_WITH_TLS = 6,
    WS_MQTT_WITH_TLS_VIA_PROXY = 7
}

export enum ConnectionFailureTestType {
    DIRECT_MQTT_BAD_HOST,
    DIRECT_MQTT_BAD_PORT,
    DIRECT_MQTT_PROTOCOL_MISMATCH,
    DIRECT_MQTT_TRANSPORT_MISMATCH,
    DIRECT_MQTT_SOCKET_TIMEOUT,
    DIRECT_MQTT_BASIC_AUTH_BAD_CREDS,
    WS_MQTT_BAD_HOST,
    WS_MQTT_BAD_PORT,
    WS_MQTT_PROTOCOL_MISMATCH,
    WS_MQTT_TRANSPORT_MISMATCH,
    WS_MQTT_SOCKET_TIMEOUT,
    WS_MQTT_BASIC_AUTH_BAD_CREDS,
    WS_MQTT_HANDSHAKE_TRANSFORM_BAD,
    WS_MQTT_HANDSHAKE_TRANSFORM_FAILURE
}

export type CreateBaseMqtt5ClientConfig = (testType: SuccessfulConnectionTestType) => mqtt5.Mqtt5ClientConfig;

export class ClientEnvironmentalConfig {

    public static AWS_IOT_HOST = process.env.AWS_TEST_MQTT5_IOT_CORE_HOST ?? "";

    public static AWS_IOT_CERTIFICATE_PATH = process.env.AWS_TEST_MQTT5_IOT_CORE_RSA_CERT ?? "";
    public static AWS_IOT_KEY_PATH = process.env.AWS_TEST_MQTT5_IOT_CORE_RSA_KEY ?? "";

    public static AWS_IOT_ACCESS_KEY_ID = process.env.AWS_TEST_MQTT5_ROLE_CREDENTIAL_ACCESS_KEY ?? "";
    public static AWS_IOT_SECRET_ACCESS_KEY = process.env.AWS_TEST_MQTT5_ROLE_CREDENTIAL_SECRET_ACCESS_KEY ?? "";
    public static AWS_IOT_SESSION_TOKEN = process.env.AWS_TEST_MQTT5_ROLE_CREDENTIAL_SESSION_TOKEN ?? "";

    public static AWS_IOT_NO_SIGNING_AUTHORIZER_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_NAME ?? "";
    public static AWS_IOT_NO_SIGNING_AUTHORIZER_USERNAME = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static AWS_IOT_NO_SIGNING_AUTHORIZER_PASSWORD = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_PASSWORD ?? "";

    public static AWS_IOT_SIGNING_AUTHORIZER_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_NAME ?? "";
    public static AWS_IOT_SIGNING_AUTHORIZER_USERNAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static AWS_IOT_SIGNING_AUTHORIZER_PASSWORD = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_PASSWORD ?? "";
    public static AWS_IOT_SIGNING_AUTHORIZER_TOKEN = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN ?? "";
    public static AWS_IOT_SIGNING_AUTHORIZER_TOKEN_SIGNATURE = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_SIGNATURE ?? "";
    public static AWS_IOT_SIGNING_AUTHORIZER_TOKEN_SIGNATURE_UNENCODED = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_SIGNATURE_UNENCODED ?? "";
    public static AWS_IOT_SIGNING_AUTHORIZER_TOKEN_KEY_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_KEY_NAME ?? "";

    public static hasIoTCoreEnvironmentCred()
    {
        return ClientEnvironmentalConfig.AWS_IOT_HOST !== "" &&
            ClientEnvironmentalConfig.AWS_IOT_ACCESS_KEY_ID !== "" &&
            ClientEnvironmentalConfig.AWS_IOT_SECRET_ACCESS_KEY !== "" &&
            ClientEnvironmentalConfig.AWS_IOT_SESSION_TOKEN !== "";
    }

    public static hasIotCoreEnvironment() {
        return ClientEnvironmentalConfig.AWS_IOT_HOST !== "" &&
            ClientEnvironmentalConfig.AWS_IOT_CERTIFICATE_PATH !== "" &&
            ClientEnvironmentalConfig.AWS_IOT_KEY_PATH !== "";
    }

    public static hasCustomAuthEnvironment() {
        return ClientEnvironmentalConfig.AWS_IOT_HOST !== "" &&
            ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_NAME != "" &&
            ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_USERNAME != "" &&
            ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_PASSWORD != "" &&
            ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_NAME != "" &&
            ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_USERNAME != "" &&
            ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_PASSWORD != "" &&
            ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN != "" &&
            ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_SIGNATURE != "" &&
            ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_KEY_NAME != "";
    }

    public static DIRECT_MQTT_HOST = process.env.AWS_TEST_MQTT5_DIRECT_MQTT_HOST ?? "";
    public static DIRECT_MQTT_PORT = parseInt(process.env.AWS_TEST_MQTT5_DIRECT_MQTT_PORT ?? "0");
    public static DIRECT_MQTT_BASIC_AUTH_HOST = process.env.AWS_TEST_MQTT5_DIRECT_MQTT_BASIC_AUTH_HOST ?? "";
    public static DIRECT_MQTT_BASIC_AUTH_PORT = parseInt(process.env.AWS_TEST_MQTT5_DIRECT_MQTT_BASIC_AUTH_PORT ?? "0");
    public static DIRECT_MQTT_TLS_HOST = process.env.AWS_TEST_MQTT5_DIRECT_MQTT_TLS_HOST ?? "";
    public static DIRECT_MQTT_TLS_PORT = parseInt(process.env.AWS_TEST_MQTT5_DIRECT_MQTT_TLS_PORT ?? "0");
    public static WS_MQTT_HOST = process.env.AWS_TEST_MQTT5_WS_MQTT_HOST ?? "";
    public static WS_MQTT_PORT = parseInt(process.env.AWS_TEST_MQTT5_WS_MQTT_PORT ?? "0");
    public static WS_MQTT_BASIC_AUTH_HOST = process.env.AWS_TEST_MQTT5_WS_MQTT_BASIC_AUTH_HOST ?? "";
    public static WS_MQTT_BASIC_AUTH_PORT = parseInt(process.env.AWS_TEST_MQTT5_WS_MQTT_BASIC_AUTH_PORT ?? "0");
    public static WS_MQTT_TLS_HOST = process.env.AWS_TEST_MQTT5_WS_MQTT_TLS_HOST ?? "";
    public static WS_MQTT_TLS_PORT = parseInt(process.env.AWS_TEST_MQTT5_WS_MQTT_TLS_PORT ?? "0");

    public static BASIC_AUTH_USERNAME = process.env.AWS_TEST_MQTT5_BASIC_AUTH_USERNAME ?? "";
    public static BASIC_AUTH_PASSWORD = Buffer.from(process.env.AWS_TEST_MQTT5_BASIC_AUTH_USERNAME ?? "", "utf-8");

    public static PROXY_HOST = process.env.AWS_TEST_MQTT5_PROXY_HOST ?? "";
    public static PROXY_PORT = parseInt(process.env.AWS_TEST_MQTT5_PROXY_PORT ?? "0");

    private static getSuccessfulConnectionTestHost(testType : SuccessfulConnectionTestType) : string {
        if (testType == SuccessfulConnectionTestType.DIRECT_MQTT) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_HOST;
        } else if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_BASIC_AUTH_HOST;
        } else if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_TLS_HOST;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT) {
            return ClientEnvironmentalConfig.WS_MQTT_HOST;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH) {
            return ClientEnvironmentalConfig.WS_MQTT_BASIC_AUTH_HOST;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return ClientEnvironmentalConfig.WS_MQTT_TLS_HOST;
        }

        return "";
    }

    private static getSuccessfulConnectionTestPort(testType : SuccessfulConnectionTestType) : number {
        if (testType == SuccessfulConnectionTestType.DIRECT_MQTT) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_PORT;
        } else if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_BASIC_AUTH_PORT;
        } else if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_TLS_PORT;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT) {
            return ClientEnvironmentalConfig.WS_MQTT_PORT;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH) {
            return ClientEnvironmentalConfig.WS_MQTT_BASIC_AUTH_PORT;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return ClientEnvironmentalConfig.WS_MQTT_TLS_PORT;
        }

        return 0;
    }

    private static isTestBasicAuth(testType: SuccessfulConnectionTestType) : boolean {
        if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH) {
            return true;
        }

        return false;
    }

    public static doesTestUseTls(testType: SuccessfulConnectionTestType) : boolean {
        if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return true;
        }

        return false;
    }

    public static doesTestUseWebsockets(testType: SuccessfulConnectionTestType) : boolean {
        if (testType == SuccessfulConnectionTestType.WS_MQTT ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return true;
        }

        return false;
    }

    public static doesTestUseProxy(testType: SuccessfulConnectionTestType) : boolean {
        if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return true;
        }

        return false;
    }

    public static hasValidSuccessfulConnectionTestConfig(testType : SuccessfulConnectionTestType) : boolean {
        return ClientEnvironmentalConfig.getSuccessfulConnectionTestHost(testType) !== "" &&
            ClientEnvironmentalConfig.getSuccessfulConnectionTestPort(testType) != 0;
    }

    public static getSuccessfulConnectionTestConfig(testType : SuccessfulConnectionTestType, createConfigCallback: CreateBaseMqtt5ClientConfig) : mqtt5.Mqtt5ClientConfig {
        let config : mqtt5.Mqtt5ClientConfig = createConfigCallback(testType);

        config.hostName = ClientEnvironmentalConfig.getSuccessfulConnectionTestHost(testType);
        config.port = ClientEnvironmentalConfig.getSuccessfulConnectionTestPort(testType);

        if (ClientEnvironmentalConfig.isTestBasicAuth(testType)) {
            config.connectProperties = {
                keepAliveIntervalSeconds : 1200,
                username : ClientEnvironmentalConfig.BASIC_AUTH_USERNAME,
                password : ClientEnvironmentalConfig.BASIC_AUTH_PASSWORD
            }
        }

        return config;
    }
}

export const conditional_test = (condition : boolean) => condition ? it : it.skip;

export async function testConnect(client : mqtt5.Mqtt5Client) {

    const attemptingConnect = once(client, "attemptingConnect");
    const connectionSuccess = once(client, "connectionSuccess");

    client.start();

    await attemptingConnect;
    let connectionSuccessEvent: mqtt5.ConnectionSuccessEvent = (await connectionSuccess)[0];

    expect(connectionSuccessEvent.settings).toBeDefined();
    expect(connectionSuccessEvent.connack).toBeDefined();

    const disconnection = once(client, "disconnection");
    const stopped = once(client, "stopped");

    client.stop();

    await disconnection;
    await stopped;

    client.close();
}

export async function testSuccessfulConnection(testType : SuccessfulConnectionTestType, createConfigCallback: CreateBaseMqtt5ClientConfig) {

    const client_config : mqtt5.Mqtt5ClientConfig = ClientEnvironmentalConfig.getSuccessfulConnectionTestConfig(testType, createConfigCallback);

    await testConnect(new mqtt5.Mqtt5Client(client_config));
}

export async function testFailedConnection(client : mqtt5.Mqtt5Client) {
    const attemptingConnect = once(client, "attemptingConnect");
    const connectionFailure = once(client, "connectionFailure");

    client.start();

    await attemptingConnect;
    let connectionFailureEvent: mqtt5.ConnectionFailureEvent = (await connectionFailure)[0];

    expect(connectionFailureEvent.error).toBeDefined();
    if (connectionFailureEvent.connack !== undefined) {
        expect(connectionFailureEvent.connack?.reasonCode).toBeGreaterThanOrEqual(128);
    }

    const stopped = once(client, "stopped");

    client.stop();

    await stopped;

    client.close();
}

export async function testDisconnectValidationFailure(client : mqtt5.Mqtt5Client, sessionExpiry: number) {
    let connectionSuccess = once(client, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);

    client.start();

    await connectionSuccess;

    expect(() => {
        client.stop({
            reasonCode: mqtt5.DisconnectReasonCode.NormalDisconnection,
            sessionExpiryIntervalSeconds: sessionExpiry
        });
    }).toThrow();

    let stopped = once(client, mqtt5.Mqtt5Client.STOPPED);

    client.stop();
    await stopped;

    client.close();
}

export async function testPublishValidationFailure(client : mqtt5.Mqtt5Client, messageExpiry: number) {
    let connectionSuccess = once(client, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);

    client.start();

    await connectionSuccess;

    await expect(client.publish({
        topicName: "a/topic",
        qos: mqtt5.QoS.AtMostOnce,
        messageExpiryIntervalSeconds: messageExpiry
    })).rejects.toThrow();

    let stopped = once(client, mqtt5.Mqtt5Client.STOPPED);

    client.stop();
    await stopped;

    client.close();
}

export async function testSubscribeValidationFailure(client : mqtt5.Mqtt5Client, subscriptionIdentifier: number) {
    let connectionSuccess = once(client, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);

    client.start();

    await connectionSuccess;

    await expect(client.subscribe({
        subscriptions: [
            { topicFilter: "hello/there", qos: mqtt5.QoS.AtLeastOnce }
        ],
        subscriptionIdentifier: subscriptionIdentifier
    })).rejects.toThrow();

    let stopped = once(client, mqtt5.Mqtt5Client.STOPPED);

    client.stop();
    await stopped;

    client.close();
}

export function verifyCommonNegotiatedSettings(settings: mqtt5.NegotiatedSettings, expectedRejoinedSession: boolean) {
    expect(settings.maximumQos).toEqual(mqtt5.QoS.AtLeastOnce);
    expect(settings.sessionExpiryInterval).toBeDefined();
    expect(settings.receiveMaximumFromServer).toBeDefined();
    expect(settings.maximumPacketSizeToServer).toBeLessThanOrEqual(268435460);
    expect(settings.serverKeepAlive).toBeDefined();
    expect(typeof settings.retainAvailable === 'boolean').toBeTruthy();
    expect(typeof settings.wildcardSubscriptionsAvailable === 'boolean').toBeTruthy();
    expect(typeof settings.subscriptionIdentifiersAvailable === 'boolean').toBeTruthy();
    expect(typeof settings.sharedSubscriptionsAvailable === 'boolean').toBeTruthy();
    expect(settings.rejoinedSession).toEqual(expectedRejoinedSession);
    expect(settings.clientId).toBeDefined();
    expect(settings.sessionExpiryInterval).toBeDefined();
}

export async function testNegotiatedSettings(client: mqtt5.Mqtt5Client, expectedRejoinedSession?: boolean) : Promise<mqtt5.NegotiatedSettings> {
    let connectionSuccess = once(client, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    let stopped = once(client, mqtt5.Mqtt5Client.STOPPED)

    return new Promise<mqtt5.NegotiatedSettings>(async (resolve, reject) => {
        try {
            client.start();

            let connectionSuccessEvent : mqtt5.ConnectionSuccessEvent = (await connectionSuccess)[0];

            client.stop();
            await stopped;

            client.close();

            verifyCommonNegotiatedSettings(connectionSuccessEvent.settings, expectedRejoinedSession ?? false);

            resolve(connectionSuccessEvent.settings);
        } catch (err) {
            reject(err);
        }
    });
}

export async function subPubUnsubTest(client: mqtt5.Mqtt5Client, qos: mqtt5.QoS, topic: string, testPayload: mqtt5.Payload) {
    let connectionSuccess = once(client, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    let messageReceived = once(client, mqtt5.Mqtt5Client.MESSAGE_RECEIVED);
    let stopped = once(client, mqtt5.Mqtt5Client.STOPPED);

    client.start();

    await connectionSuccess;

    const suback = await client.subscribe({
        subscriptions: [
            { qos : mqtt5.QoS.AtLeastOnce, topicFilter: topic }
        ]
    });

    expect(suback.reasonCodes).toEqual([mqtt5.QoS.AtLeastOnce])

    await client.publish({
        topicName: topic,
        qos: qos,
        payload: testPayload
    });

    await messageReceived;

    const unsuback = await client.unsubscribe({
        topicFilters: [ topic ]
    });

    expect(unsuback.reasonCodes).toEqual([qos])

    await client.publish({
        topicName: topic,
        qos: mqtt5.QoS.AtLeastOnce,
        payload: testPayload
    });

    await setTimeout(()=>{}, 2000);

    client.stop();
    await stopped;

    client.close();
}

export async function willTest(publisher: mqtt5.Mqtt5Client, subscriber: mqtt5.Mqtt5Client, willTopic: string) {
    let publisherConnected = once(publisher, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    let publisherStopped = once(publisher, mqtt5.Mqtt5Client.STOPPED);
    let subscriberConnected = once(subscriber, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    let subscriberStopped = once(subscriber, mqtt5.Mqtt5Client.STOPPED);

    let willReceived = once(subscriber, mqtt5.Mqtt5Client.MESSAGE_RECEIVED);

    publisher.start();
    await publisherConnected;

    subscriber.start();
    await subscriberConnected;

    let suback: mqtt5.SubackPacket = await subscriber.subscribe({
        subscriptions: [
            { qos : mqtt5.QoS.AtLeastOnce, topicFilter: willTopic }
        ]
    });

    if (!mqtt5.isSuccessfulSubackReasonCode(suback.reasonCodes[0])) {
        throw new CrtError("doh");
    }

    publisher.stop({
        reasonCode: mqtt5.DisconnectReasonCode.DisconnectWithWillMessage
    });

    await willReceived;
    await publisherStopped;

    subscriber.stop();
    await subscriberStopped;

    publisher.close();
    subscriber.close();
}

export async function nullSubscribeTest(client: mqtt5.Mqtt5Client) {
    let connected = once(client, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    let stopped = once(client, mqtt5.Mqtt5Client.STOPPED);

    client.start();
    await connected;

    // @ts-ignore
    await expect(client.subscribe(null)).rejects.toThrow();

    client.stop();
    await stopped;

    client.close();
}

export async function nullUnsubscribeTest(client: mqtt5.Mqtt5Client) {
    let connected = once(client, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    let stopped = once(client, mqtt5.Mqtt5Client.STOPPED);

    client.start();
    await connected;

    // @ts-ignore
    await expect(client.unsubscribe(null)).rejects.toThrow();

    client.stop();
    await stopped;

    client.close();
}

export async function nullPublishTest(client: mqtt5.Mqtt5Client) {
    let connected = once(client, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    let stopped = once(client, mqtt5.Mqtt5Client.STOPPED);

    client.start();
    await connected;

    // @ts-ignore
    await expect(client.publish(null)).rejects.toThrow();

    client.stop();
    await stopped;

    client.close();
}

export async function doRetainTest(client1: mqtt5.Mqtt5Client, client2: mqtt5.Mqtt5Client, client3: mqtt5.Mqtt5Client) {

    let retainTopic : string = `test/retain/topic-${uuid()}`;
    let retainedPayload : Buffer = Buffer.from("RetainedPayload", "utf-8");

    let connected1 = once(client1, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    let stopped1 = once(client1, mqtt5.Mqtt5Client.STOPPED);

    let connected2 = once(client2, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    let stopped2 = once(client2, mqtt5.Mqtt5Client.STOPPED);

    let connected3 = once(client3, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    let stopped3 = once(client3, mqtt5.Mqtt5Client.STOPPED);

    // Connect with client1 and set the retained message
    client1.start();
    await connected1;

    await client1.publish({
        topicName: retainTopic,
        qos: mqtt5.QoS.AtLeastOnce,
        payload: retainedPayload,
        retain: true
    });

    // Connect with client2, subscribe to the retained topic and expect the appropriate retained message to be
    // delivered after subscription
    let messageReceived2 = once(client2, mqtt5.Mqtt5Client.MESSAGE_RECEIVED);

    client2.start();

    await connected2;
    await client2.subscribe({
        subscriptions: [
            {topicFilter: retainTopic, qos: mqtt5.QoS.AtLeastOnce}
        ]
    });

    let messageReceivedEvent : mqtt5.MessageReceivedEvent = (await messageReceived2)[0];
    let publish: mqtt5.PublishPacket = messageReceivedEvent.message;

    expect(publish.topicName).toEqual(retainTopic);
    expect(publish.qos).toEqual(mqtt5.QoS.AtLeastOnce);
    expect(Buffer.from(publish.payload as ArrayBuffer)).toEqual(retainedPayload);

    client2.stop();
    await stopped2;
    client2.close();

    // Clear the retained message
    await client1.publish({
        topicName: retainTopic,
        qos: mqtt5.QoS.AtLeastOnce,
        retain: true
    });

    // Connect with client 3, subscribe to the retained topic, wait a few seconds to ensure no message received
    client3.start();

    client3.on('messageReceived', (eventData: mqtt5.MessageReceivedEvent) => {
        throw new Error("This shouldn't happen!");
    });

    await connected3;
    await client3.subscribe({
        subscriptions: [
            {topicFilter: retainTopic, qos: mqtt5.QoS.AtLeastOnce}
        ]
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    client3.stop();
    await stopped3;
    client3.close();

    client1.stop();
    await stopped1;
    client1.close();
}

export async function doSharedSubscriptionsTest(publisher: mqtt5.Mqtt5Client, subscriber1: mqtt5.Mqtt5Client, subscriber2: mqtt5.Mqtt5Client) {
    const payload : Buffer = Buffer.from("share", "utf-8");
    const messagesNumber: number = 10;
    const testTopic: string = `mqtt5_test${uuid()}`;
    const sharedTopicfilter : string = `$share/crttest/${testTopic}`;

    const publisherConnected = once(publisher, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    const publisherStopped = once(publisher, mqtt5.Mqtt5Client.STOPPED);

    const subscriber1Connected = once(subscriber1, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    const subscriber1Stopped = once(subscriber1, mqtt5.Mqtt5Client.STOPPED);

    const subscriber2Connected = once(subscriber2, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
    const subscriber2Stopped = once(subscriber2, mqtt5.Mqtt5Client.STOPPED);

    publisher.start();
    subscriber1.start();
    subscriber2.start();

    await publisherConnected;
    await subscriber1Connected;
    await subscriber2Connected;

    await subscriber1.subscribe({
        subscriptions: [
            {topicFilter: sharedTopicfilter, qos: mqtt5.QoS.AtLeastOnce}
        ]
    });
    await subscriber2.subscribe({
        subscriptions: [
            {topicFilter: sharedTopicfilter, qos: mqtt5.QoS.AtLeastOnce}
        ]
    });

    let receivedResolve : (value?: void | PromiseLike<void>) => void;
    const receivedPromise = new Promise<void>((resolve, reject) => {
        receivedResolve = resolve;
        setTimeout(() => reject(new Error("Did not receive expected number of messages")), 4000);
    });

    // map: subscriberId -> receivedCount
    const subscriberMessages = new Map();

    const getOnMessageReceived = (subscriberId : string) => {
        subscriberMessages.set(subscriberId, 0);

        return (eventData: mqtt5.MessageReceivedEvent) => {
            const packet: mqtt5.PublishPacket = eventData.message;

            subscriberMessages.set(subscriberId, subscriberMessages.get(subscriberId) + 1);

            let messagesReceived : number = 0;
            subscriberMessages.forEach(v => messagesReceived += v);
            if (messagesReceived == messagesNumber) {
                receivedResolve();
            }

            expect(packet.qos).toEqual(mqtt5.QoS.AtLeastOnce);
            expect(packet.topicName).toEqual(testTopic);
        };
    };

    subscriber1.on('messageReceived', getOnMessageReceived("sub1"));
    subscriber2.on('messageReceived', getOnMessageReceived("sub2"));

    for (let i = 0; i < messagesNumber; ++i) {
        publisher.publish({
            topicName: testTopic,
            qos: mqtt5.QoS.AtLeastOnce,
            payload: payload
        });
    }

    // Wait for receiving all published messages.
    await receivedPromise;

    // Wait a little longer to check if extra messages arrive.
    await new Promise(resolve => setTimeout(resolve, 1000));

    let messagesReceived : number = 0;
    subscriberMessages.forEach(v => {
        messagesReceived += v;
        // Each subscriber should receive a portion of messages.
        expect(v).toBeGreaterThan(0);
    });
    expect(messagesReceived).toEqual(messagesNumber);

    subscriber2.stop();
    subscriber1.stop();
    publisher.stop();

    await subscriber2Stopped;
    await subscriber1Stopped;
    await publisherStopped;
}
