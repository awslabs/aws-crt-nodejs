/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {
    Mqtt5Client,
    Mqtt5ClientConfig, HttpProxyOptions
} from './mqtt5';
import { once } from 'events';
import {
    ConnackPacket,
} from "../common/mqtt5_packet";
import { NegotiatedSettings } from "../common/mqtt5";
import { ClientTlsContext, TlsContextOptions} from "./io";
import {HttpProxyAuthenticationType, HttpProxyConnectionType, HttpRequest} from "./http";

jest.setTimeout(10000);

enum SuccessfulConnectionTestType {
    DIRECT_MQTT = 0,
    DIRECT_MQTT_WITH_BASIC_AUTH = 1,
    DIRECT_MQTT_WITH_TLS = 2,
    DIRECT_MQTT_WITH_TLS_VIA_PROXY = 3,
    WS_MQTT = 4,
    WS_MQTT_WITH_BASIC_AUTH = 5,
    WS_MQTT_WITH_TLS = 6,
    WS_MQTT_WITH_TLS_VIA_PROXY = 7
}

class ClientEnvironmentalConfig {

    public static DIRECT_MQTT_HOST = process.env.AWS_MQTT5_TEST_DIRECT_MQTT_HOST ?? "";
    public static DIRECT_MQTT_PORT = parseInt(process.env.AWS_MQTT5_TEST_DIRECT_MQTT_PORT ?? "0");
    public static DIRECT_MQTT_BASIC_AUTH_HOST = process.env.AWS_MQTT5_TEST_DIRECT_MQTT_BASIC_AUTH_HOST ?? "";
    public static DIRECT_MQTT_BASIC_AUTH_PORT = parseInt(process.env.AWS_MQTT5_TEST_DIRECT_MQTT_BASIC_AUTH_PORT ?? "0");
    public static DIRECT_MQTT_TLS_HOST = process.env.AWS_MQTT5_TEST_DIRECT_MQTT_TLS_HOST ?? "";
    public static DIRECT_MQTT_TLS_PORT = parseInt(process.env.AWS_MQTT5_TEST_DIRECT_MQTT_TLS_PORT ?? "0");
    public static WS_MQTT_HOST = process.env.AWS_MQTT5_TEST_WS_MQTT_HOST ?? "";
    public static WS_MQTT_PORT = parseInt(process.env.AWS_MQTT5_TEST_WS_MQTT_PORT ?? "0");
    public static WS_MQTT_BASIC_AUTH_HOST = process.env.AWS_MQTT5_TEST_WS_MQTT_BASIC_AUTH_HOST ?? "";
    public static WS_MQTT_BASIC_AUTH_PORT = parseInt(process.env.AWS_MQTT5_TEST_WS_MQTT_BASIC_AUTH_PORT ?? "0");
    public static WS_MQTT_TLS_HOST = process.env.AWS_MQTT5_TEST_WS_MQTT_TLS_HOST ?? "";
    public static WS_MQTT_TLS_PORT = parseInt(process.env.AWS_MQTT5_TEST_WS_MQTT_TLS_PORT ?? "0");

    public static BASIC_AUTH_USERNAME = process.env.AWS_MQTT5_TEST_BASIC_AUTH_USERNAME ?? "";
    public static BASIC_AUTH_PASSWORD = new TextEncoder().encode(process.env.AWS_MQTT5_TEST_BASIC_AUTH_USERNAME ?? "");

    public static PROXY_HOST = process.env.AWS_MQTT5_TEST_PROXY_HOST ?? "";
    public static PROXY_PORT = parseInt(process.env.AWS_MQTT5_TEST_PROXY_PORT ?? "0");

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

    private static doesTestUseTls(testType: SuccessfulConnectionTestType) : boolean {
        if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return true;
        }

        return false;
    }

    private static doesTestUseWebsockets(testType: SuccessfulConnectionTestType) : boolean {
        if (testType == SuccessfulConnectionTestType.WS_MQTT ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return true;
        }

        return false;
    }

    private static doesTestUseProxy(testType: SuccessfulConnectionTestType) : boolean {
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

    public static getSuccessfulConnectionTestConfig(testType : SuccessfulConnectionTestType) : Mqtt5ClientConfig {
        let config : Mqtt5ClientConfig = {
            hostName : ClientEnvironmentalConfig.getSuccessfulConnectionTestHost(testType),
            port : ClientEnvironmentalConfig.getSuccessfulConnectionTestPort(testType),
        }

        if (ClientEnvironmentalConfig.isTestBasicAuth(testType)) {
            config.connectProperties = {
                keepAliveIntervalSeconds : 1200,
                username : ClientEnvironmentalConfig.BASIC_AUTH_USERNAME,
                password : ClientEnvironmentalConfig.BASIC_AUTH_PASSWORD
            }
        }

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
}

async function testSuccessfulConnection(testType : SuccessfulConnectionTestType) {

    const client_config : Mqtt5ClientConfig = ClientEnvironmentalConfig.getSuccessfulConnectionTestConfig(testType);

    let client : Mqtt5Client = new Mqtt5Client(client_config);

    const attemptingConnect = once(client, "attemptingConnect");
    const connectionSuccess = once(client, "connectionSuccess");

    client.start();

    await attemptingConnect;
    let connectionResults = await connectionSuccess;
    let connack : ConnackPacket = connectionResults[0];
    let settings : NegotiatedSettings = connectionResults[1];

    expect(connack).toBeDefined();
    expect(settings).toBeDefined();

    const disconnection = once(client, "disconnection");
    const stopped = once(client, "stopped");

    client.stop();

    await disconnection;
    await stopped;

    client.close();
}


/*
test('Derp Mqtt5', async () => {
    enable_logging(LogLevel.TRACE);

    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS);

    for (let i = 0; i < 100; i++) {
        let data : Int32Array = new Int32Array(10000000);
        data[0] = 0;
    }

    console.log('Leaving test');
});
*/

const conditional_test = (condition : boolean) => condition ? it : it.skip;

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.DIRECT_MQTT))('Direct Mqtt connection', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.DIRECT_MQTT);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH))('Direct Mqtt connection with basic authentication', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS))('Direct Mqtt connection with TLS', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY))('Direct Mqtt connection with tls through an http proxy', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT))('Websocket Mqtt connection', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH))('Websocket Mqtt connection with basic authentication', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS))('Websocket Mqtt connection with TLS', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS);
});

conditional_test(ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY))('Websocket Mqtt connection with tls through an http proxy', async () => {
    await testSuccessfulConnection(SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY);
});