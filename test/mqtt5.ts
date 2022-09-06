/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {Mqtt5Client, Mqtt5ClientConfig} from "@awscrt/mqtt5";
import * as mqtt5_common from "../lib/common/mqtt5";
import * as mqtt5_packet from "../lib/common/mqtt5_packet";
import {DisconnectReasonCode, QoS} from "../lib/common/mqtt5_packet";
import {once} from "events";
import {v4 as uuid} from "uuid";

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

export type CreateBaseMqtt5ClientConfig = (testType: SuccessfulConnectionTestType) => Mqtt5ClientConfig;

export class ClientEnvironmentalConfig {

    public static AWS_IOT_HOST = process.env.AWS_TEST_MQTT5_IOT_CORE_HOST ?? "";

    public static AWS_IOT_CERTIFICATE_PATH = process.env.AWS_TEST_MQTT5_IOT_CORE_CERTIFICATE_PATH ?? "";
    public static AWS_IOT_KEY_PATH = process.env.AWS_TEST_MQTT5_IOT_CORE_KEY_PATH ?? "";

    public static AWS_IOT_ACCESS_KEY_ID = process.env.AWS_TEST_MQTT5_IOT_CORE_ACCESS_KEY_ID ?? "";
    public static AWS_IOT_SECRET_ACCESS_KEY = process.env.AWS_TEST_MQTT5_IOT_CORE_SECRET_ACCESS_KEY ?? "";

    public static AWS_IOT_NO_SIGNING_AUTHORIZER_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_NAME ?? "";
    public static AWS_IOT_NO_SIGNING_AUTHORIZER_USERNAME = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static AWS_IOT_NO_SIGNING_AUTHORIZER_PASSWORD = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_PASSWORD ?? "";

    public static AWS_IOT_SIGNING_AUTHORIZER_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_NAME ?? "";
    public static AWS_IOT_SIGNING_AUTHORIZER_USERNAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static AWS_IOT_SIGNING_AUTHORIZER_PASSWORD = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_PASSWORD ?? "";
    public static AWS_IOT_SIGNING_AUTHORIZER_TOKEN = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN ?? "";
    public static AWS_IOT_SIGNING_AUTHORIZER_TOKEN_SIGNATURE = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_SIGNATURE ?? "";
    public static AWS_IOT_SIGNING_AUTHORIZER_TOKEN_KEY_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_KEY_NAME ?? "";

    public static hasIotCoreEnvironment() {
        return ClientEnvironmentalConfig.AWS_IOT_HOST !== "" &&
            ClientEnvironmentalConfig.AWS_IOT_CERTIFICATE_PATH !== "" &&
            ClientEnvironmentalConfig.AWS_IOT_KEY_PATH !== "";
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

    public static getSuccessfulConnectionTestConfig(testType : SuccessfulConnectionTestType, createConfigCallback: CreateBaseMqtt5ClientConfig) : Mqtt5ClientConfig {
        let config : Mqtt5ClientConfig = createConfigCallback(testType);

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

export async function testConnect(client : Mqtt5Client) {

    const attemptingConnect = once(client, "attemptingConnect");
    const connectionSuccess = once(client, "connectionSuccess");

    client.start();

    await attemptingConnect;
    let connectionResults = await connectionSuccess;

    expect(connectionResults[0]).toBeDefined();
    expect(connectionResults[1]).toBeDefined();

    const disconnection = once(client, "disconnection");
    const stopped = once(client, "stopped");

    client.stop();

    await disconnection;
    await stopped;

    client.close();
}

export async function testSuccessfulConnection(testType : SuccessfulConnectionTestType, createConfigCallback: CreateBaseMqtt5ClientConfig) {

    const client_config : Mqtt5ClientConfig = ClientEnvironmentalConfig.getSuccessfulConnectionTestConfig(testType, createConfigCallback);

    await testConnect(new Mqtt5Client(client_config));
}

export async function testFailedConnection(client : Mqtt5Client) {
    const attemptingConnect = once(client, "attemptingConnect");
    const connectionFailure = once(client, "connectionFailure");

    client.start();

    await attemptingConnect;
    let [error, connack] = await connectionFailure;

    expect(error).toBeDefined();
    if (connack !== null) {
        expect(connack?.reasonCode).toBeGreaterThanOrEqual(128);
    }

    const stopped = once(client, "stopped");

    client.stop();

    await stopped;

    client.close();
}

export async function testDisconnectValidationFailure(client : Mqtt5Client, sessionExpiry: number) {
    let connectionSuccess = once(client, Mqtt5Client.CONNECTION_SUCCESS);

    client.start();

    await connectionSuccess;

    expect(() => {
        client.stop({
            reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection,
            sessionExpiryIntervalSeconds: sessionExpiry
        });
    }).toThrow();

    let stopped = once(client, Mqtt5Client.STOPPED);

    client.stop();
    await stopped;

    client.close();
}

export async function testPublishValidationFailure(client : Mqtt5Client, messageExpiry: number) {
    let connectionSuccess = once(client, Mqtt5Client.CONNECTION_SUCCESS);

    client.start();

    await connectionSuccess;

    await expect(client.publish({
        topicName: "a/topic",
        qos: mqtt5_packet.QoS.AtMostOnce,
        messageExpiryIntervalSeconds: messageExpiry
    })).rejects.toThrow();

    let stopped = once(client, Mqtt5Client.STOPPED);

    client.stop();
    await stopped;

    client.close();
}

export async function testSubscribeValidationFailure(client : Mqtt5Client, subscriptionIdentifier: number) {
    let connectionSuccess = once(client, Mqtt5Client.CONNECTION_SUCCESS);

    client.start();

    await connectionSuccess;

    await expect(client.subscribe({
        subscriptions: [
            { topicFilter: "hello/there", qos: QoS.AtLeastOnce }
        ],
        subscriptionIdentifier: subscriptionIdentifier
    })).rejects.toThrow();

    let stopped = once(client, Mqtt5Client.STOPPED);

    client.stop();
    await stopped;

    client.close();
}

export function verifyCommonNegotiatedSettings(settings: mqtt5_common.NegotiatedSettings) {
    expect(settings.maximumQos).toEqual(mqtt5_packet.QoS.AtLeastOnce);
    expect(settings.sessionExpiryInterval).toBeDefined();
    expect(settings.receiveMaximumFromServer).toBeDefined();
    expect(settings.maximumPacketSizeToServer).toEqual(268435460);
    expect(settings.serverKeepAlive).toBeDefined();
    expect(settings.retainAvailable).toBeTruthy();
    expect(settings.wildcardSubscriptionsAvailable).toBeTruthy();
    expect(settings.subscriptionIdentifiersAvailable).toBeTruthy();
    expect(settings.sharedSubscriptionsAvailable).toBeTruthy();
    expect(settings.rejoinedSession).toBeFalsy();
    expect(settings.clientId).toBeDefined();
    expect(settings.sessionExpiryInterval).toBeDefined();
}

export async function testNegotiatedSettings(client: Mqtt5Client) : Promise<mqtt5_common.NegotiatedSettings> {
    let connectionSuccess = once(client, Mqtt5Client.CONNECTION_SUCCESS);
    let stopped = once(client, Mqtt5Client.STOPPED)

    return new Promise<mqtt5_common.NegotiatedSettings>(async (resolve, reject) => {
        try {
            client.start();

            let [_, settings] = await connectionSuccess;

            client.stop();
            await stopped;

            client.close();

            verifyCommonNegotiatedSettings(settings);

            resolve(settings);
        } catch (err) {
            reject(err);
        }
    });
}

export async function subPubUnsubTest(client: Mqtt5Client, qos: mqtt5_packet.QoS, topic: string, testPayload: mqtt5_packet.Payload) {
    let connectionSuccess = once(client, Mqtt5Client.CONNECTION_SUCCESS);
    let messageReceived = once(client, Mqtt5Client.MESSAGE_RECEIVED);
    let stopped = once(client, Mqtt5Client.STOPPED);

    client.start();

    await connectionSuccess;

    await client.subscribe({
        subscriptions: [
            { qos : QoS.AtLeastOnce, topicFilter: topic }
        ]
    });

    await client.publish({
        topicName: topic,
        qos: qos,
        payload: testPayload
    });

    await messageReceived;

    await client.unsubscribe({
        topicFilters: [ topic ]
    });

    await client.publish({
        topicName: topic,
        qos: QoS.AtLeastOnce,
        payload: testPayload
    });

    await setTimeout(()=>{}, 2000);

    client.stop();
    await stopped;

    client.close();
}

export async function willTest(publisher: Mqtt5Client, subscriber: Mqtt5Client, willTopic: string) {
    let publisherConnected = once(publisher, Mqtt5Client.CONNECTION_SUCCESS);
    let publisherStopped = once(publisher, Mqtt5Client.STOPPED);
    let subscriberConnected = once(subscriber, Mqtt5Client.CONNECTION_SUCCESS);
    let subscriberStopped = once(subscriber, Mqtt5Client.STOPPED);

    let willReceived = once(subscriber, Mqtt5Client.MESSAGE_RECEIVED);

    publisher.start();
    await publisherConnected;

    subscriber.start();
    await subscriberConnected;

    await subscriber.subscribe({
        subscriptions: [
            { qos : QoS.AtLeastOnce, topicFilter: willTopic }
        ]
    });

    publisher.stop({
        reasonCode: DisconnectReasonCode.DisconnectWithWillMessage
    });

    await willReceived;
    await publisherStopped;

    subscriber.stop();
    await subscriberStopped;

    publisher.close();
    subscriber.close();
}

export async function nullSubscribeTest(client: Mqtt5Client) {
    let connected = once(client, Mqtt5Client.CONNECTION_SUCCESS);
    let stopped = once(client, Mqtt5Client.STOPPED);

    client.start();
    await connected;

    // @ts-ignore
    await expect(client.subscribe(null)).rejects.toThrow();

    client.stop();
    await stopped;

    client.close();
}

export async function nullUnsubscribeTest(client: Mqtt5Client) {
    let connected = once(client, Mqtt5Client.CONNECTION_SUCCESS);
    let stopped = once(client, Mqtt5Client.STOPPED);

    client.start();
    await connected;

    // @ts-ignore
    await expect(client.unsubscribe(null)).rejects.toThrow();

    client.stop();
    await stopped;

    client.close();
}

export async function nullPublishTest(client: Mqtt5Client) {
    let connected = once(client, Mqtt5Client.CONNECTION_SUCCESS);
    let stopped = once(client, Mqtt5Client.STOPPED);

    client.start();
    await connected;

    // @ts-ignore
    await expect(client.publish(null)).rejects.toThrow();

    client.stop();
    await stopped;

    client.close();
}

export async function doRetainTest(client1: Mqtt5Client, client2: Mqtt5Client, client3: Mqtt5Client) {

    let retainTopic : string = `retain/topic-${uuid()}`;
    let retainedPayload : Buffer = Buffer.from("RetainedPayload", "utf-8");

    let connected1 = once(client1, Mqtt5Client.CONNECTION_SUCCESS);
    let stopped1 = once(client1, Mqtt5Client.STOPPED);

    let connected2 = once(client2, Mqtt5Client.CONNECTION_SUCCESS);
    let stopped2 = once(client2, Mqtt5Client.STOPPED);

    let connected3 = once(client3, Mqtt5Client.CONNECTION_SUCCESS);
    let stopped3 = once(client3, Mqtt5Client.STOPPED);

    // Connect with client1 and set the retained message
    client1.start();
    await connected1;

    await client1.publish({
        topicName: retainTopic,
        qos: QoS.AtLeastOnce,
        payload: retainedPayload,
        retain: true
    });

    // Connect with client2, subscribe to the retained topic and expect the appropriate retained message to be
    // delivered after subscription
    let messageReceived2 = once(client2, Mqtt5Client.MESSAGE_RECEIVED);

    client2.start();

    await connected2;
    await client2.subscribe({
        subscriptions: [
            {topicFilter: retainTopic, qos: QoS.AtLeastOnce}
        ]
    });

    let publish: mqtt5_packet.PublishPacket = (await messageReceived2)[0];

    expect(publish.topicName).toEqual(retainTopic);
    expect(publish.qos).toEqual(QoS.AtLeastOnce);
    expect(Buffer.from(publish.payload as ArrayBuffer)).toEqual(retainedPayload);

    client2.stop();
    await stopped2;
    client2.close();

    // Clear the retained message
    await client1.publish({
        topicName: retainTopic,
        qos: QoS.AtLeastOnce,
        retain: true
    });

    // Connect with client 3, subscribe to the retained topic, wait a few seconds to ensure no message received
    client3.start();

    client3.on('messageReceived', (publish: mqtt5_packet.PublishPacket) => {
        throw new Error("This shouldn't happen!");
    });

    await connected3;
    await client3.subscribe({
        subscriptions: [
            {topicFilter: retainTopic, qos: QoS.AtLeastOnce}
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