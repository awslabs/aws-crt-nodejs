/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {ApplyCustomMqtt5ClientConfig, ClientEnvironmentalConfig, SuccessfulConnectionTestType} from "@test/mqtt5";
import {Mqtt5Client, Mqtt5ClientConfig} from "./mqtt5";
import {once} from "events";
import {WebsocketMqtt5Protocol} from "./ws";

jest.setTimeout(10000);

function applyBrowserSpecificTestConfig (config: Mqtt5ClientConfig, testType: SuccessfulConnectionTestType) : Mqtt5ClientConfig {
    config.websocket = {
        protocol: undefined,
        ws_options: {}
    }

    if (ClientEnvironmentalConfig.doesTestUseTls(testType)) {
        config.websocket.protocol = WebsocketMqtt5Protocol.Wss;
        config.websocket.ws_options.rejectUnauthorized = false;
    } else {
        config.websocket.protocol = WebsocketMqtt5Protocol.Ws;
    }

    if (ClientEnvironmentalConfig.doesTestUseProxy(testType)) {
        var url = require('url');
        var options = url.parse('http://localhost:3128');
        var HttpsProxyAgent = require('https-proxy-agent');
        var agent = new HttpsProxyAgent(options);

        config.websocket.ws_options.agent = agent;
    }

    return config;
}

export async function testSuccessfulConnection(testType : SuccessfulConnectionTestType, customConfigCallback: ApplyCustomMqtt5ClientConfig) {

    const client_config : Mqtt5ClientConfig = ClientEnvironmentalConfig.getSuccessfulConnectionTestConfig(testType, customConfigCallback);

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

/*
test('basic auth', async() => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH, applyBrowserSpecificTestConfig);
});
*/


const conditional_test = (condition : boolean) => condition ? it : it.skip;


conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT))('Websocket Mqtt connection', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT, applyBrowserSpecificTestConfig);
});


conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH))('Websocket Mqtt connection with basic authentication', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH, applyBrowserSpecificTestConfig);
});


conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS))('Websocket Mqtt connection with TLS', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS, applyBrowserSpecificTestConfig);
});
/*
conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY))('Websocket Mqtt connection with tls through an http proxy', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY, applyBrowserSpecificTestConfig);
});*/