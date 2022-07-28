/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CreateBaseMqtt5ClientConfig, ClientEnvironmentalConfig, SuccessfulConnectionTestType} from "@test/mqtt5";
import {Mqtt5Client, Mqtt5ClientConfig, Mqtt5WebsocketUrlFactoryOptions, Mqtt5WebsocketUrlFactoryType} from "./mqtt5";
import {once} from "events";

jest.setTimeout(10000);

function createBrowserSpecificTestConfig (testType: SuccessfulConnectionTestType) : Mqtt5ClientConfig {

    let wsOptions : any = {}

    if (ClientEnvironmentalConfig.doesTestUseProxy(testType)) {
        var url = require('url');
        var options = url.parse(`http://${ClientEnvironmentalConfig.PROXY_HOST}:${ClientEnvironmentalConfig.PROXY_PORT}`);
        var HttpsProxyAgent = require('https-proxy-agent');
        var agent = new HttpsProxyAgent(options);

        wsOptions.agent = agent;
    }

    let urlFactoryOptions : Mqtt5WebsocketUrlFactoryOptions;
    if (ClientEnvironmentalConfig.doesTestUseTls(testType)) {
        urlFactoryOptions = { urlFactory: Mqtt5WebsocketUrlFactoryType.Wss };
        wsOptions.rejectUnauthorized = false;
    } else {
        urlFactoryOptions = { urlFactory: Mqtt5WebsocketUrlFactoryType.Ws };
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

export async function testSuccessfulConnection(testType : SuccessfulConnectionTestType, createConfigCallback: CreateBaseMqtt5ClientConfig) {

    const client_config : Mqtt5ClientConfig = ClientEnvironmentalConfig.getSuccessfulConnectionTestConfig(testType, createConfigCallback);

    let client : Mqtt5Client = new Mqtt5Client(client_config);

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
}

const conditional_test = (condition : boolean) => condition ? it : it.skip;

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT))('Websocket Mqtt connection', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT, createBrowserSpecificTestConfig);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH))('Websocket Mqtt connection with basic authentication', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH, createBrowserSpecificTestConfig);
});


conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS))('Websocket Mqtt connection with TLS', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS, createBrowserSpecificTestConfig);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY))('Websocket Mqtt connection with tls through an http proxy', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY, createBrowserSpecificTestConfig);
});