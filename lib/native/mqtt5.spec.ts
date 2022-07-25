/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {
    SuccessfulConnectionTestType,
    ClientEnvironmentalConfig,
    ApplyCustomMqtt5ClientConfig
} from "@test/mqtt5";
import {HttpProxyOptions, Mqtt5Client, Mqtt5ClientConfig} from "./mqtt5";
import {ClientTlsContext, TlsContextOptions} from "./io";
import {HttpProxyAuthenticationType, HttpProxyConnectionType, HttpRequest} from "./http";
import {once} from "events";

jest.setTimeout(10000);

function applyNodeSpecificTestConfig (config: Mqtt5ClientConfig, testType: SuccessfulConnectionTestType) : Mqtt5ClientConfig {
    if (ClientEnvironmentalConfig.doesTestUseTls(testType)) {
        let tls_ctx_opt = new TlsContextOptions();
        tls_ctx_opt.verify_peer = false;

        config.tlsCtx = new ClientTlsContext(tls_ctx_opt);
    }

    if (ClientEnvironmentalConfig.doesTestUseWebsockets(testType)) {
        config.websocketHandshakeTransform = (request: HttpRequest, done: (error_code?: number) => void) =>
        {
            done(0);
        }
    }

    if (ClientEnvironmentalConfig.doesTestUseProxy(testType)) {
        config.proxyOptions = new HttpProxyOptions(
            ClientEnvironmentalConfig.PROXY_HOST,
            ClientEnvironmentalConfig.PROXY_PORT,
            HttpProxyAuthenticationType.None,
            undefined,
            undefined,
            undefined,
            HttpProxyConnectionType.Tunneling)
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

    client.close();
}

const conditional_test = (condition : boolean) => condition ? it : it.skip;

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.DIRECT_MQTT))('Direct Mqtt connection', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.DIRECT_MQTT, applyNodeSpecificTestConfig);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH))('Direct Mqtt connection with basic authentication', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH, applyNodeSpecificTestConfig);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS))('Direct Mqtt connection with TLS', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS, applyNodeSpecificTestConfig);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY))('Direct Mqtt connection with tls through an http proxy', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY, applyNodeSpecificTestConfig);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT))('Websocket Mqtt connection', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT, applyNodeSpecificTestConfig);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH))('Websocket Mqtt connection with basic authentication', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH, applyNodeSpecificTestConfig);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS))('Websocket Mqtt connection with TLS', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS, applyNodeSpecificTestConfig);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY))('Websocket Mqtt connection with tls through an http proxy', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY, applyNodeSpecificTestConfig);
});