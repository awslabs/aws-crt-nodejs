/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { ClientBootstrap, SocketOptions } from './io';
import { MqttClient, MqttConnectionConfig } from './mqtt';
import { v4 as uuid } from 'uuid';
jest.setTimeout(10000);

const conditional_test = (condition: boolean) => condition ? it : it.skip;

class AWS_IOT_ENV {
    public static IOT_MQTT_HOST = process.env.AWS_TEST_MQTT311_IOT_CORE_HOST ?? "";
    public static IOT_MQTT_REGION = process.env.AWS_TEST_MQTT311_IOT_CORE_REGION ?? "";

    public static WS_MQTT_HOST = process.env.AWS_TEST_MQTT311_WS_MQTT_HOST ?? "";
    public static WS_MQTT_PORT = process.env.AWS_TEST_MQTT311_WS_MQTT_PORT ?? "";
    public static WS_AUTH_MQTT_HOST = process.env.AWS_TEST_MQTT311_WS_MQTT_BASIC_AUTH_HOST ?? "";
    public static WS_AUTH_MQTT_PORT = process.env.AWS_TEST_MQTT311_WS_MQTT_BASIC_AUTH_PORT ?? "";
    public static WS_TLS_MQTT_HOST = process.env.AWS_TEST_MQTT311_WS_MQTT_TLS_HOST ?? "";
    public static WS_TLS_MQTT_PORT = process.env.AWS_TEST_MQTT311_WS_MQTT_TLS_PORT ?? "";

    public static BASIC_AUTH_USERNAME = process.env.AWS_TEST_MQTT311_BASIC_AUTH_USERNAME ?? "";
    public static BASIC_AUTH_PASSWORD = process.env.AWS_TEST_MQTT311_BASIC_AUTH_PASSWORD ?? "";
    public static PROXY_HOST = process.env.AWS_TEST_MQTT311_PROXY_HOST ?? "";
    public static PROXY_PORT = process.env.AWS_TEST_MQTT311_PROXY_PORT ?? "";

    public static is_valid_ws_mqtt() {
        return AWS_IOT_ENV.WS_MQTT_HOST !== "" &&
            AWS_IOT_ENV.WS_MQTT_PORT !== "";
    }
    public static is_valid_ws_auth_mqtt() {
        return AWS_IOT_ENV.WS_AUTH_MQTT_HOST !== "" &&
            AWS_IOT_ENV.WS_AUTH_MQTT_PORT !== "" &&
            AWS_IOT_ENV.BASIC_AUTH_USERNAME !== "" &&
            AWS_IOT_ENV.BASIC_AUTH_PASSWORD !== "";
    }
    public static is_valid_ws_tls_mqtt() {
        return AWS_IOT_ENV.WS_TLS_MQTT_HOST !== "" &&
            AWS_IOT_ENV.WS_TLS_MQTT_PORT !== "";
    }
    public static is_valid_ws_proxy() {
        return AWS_IOT_ENV.WS_TLS_MQTT_HOST !== "" &&
            AWS_IOT_ENV.WS_TLS_MQTT_PORT !== "" &&
            AWS_IOT_ENV.PROXY_HOST !== "" &&
            AWS_IOT_ENV.PROXY_PORT !== "";
    }

    public static is_valid_iot_websocket() {
        return AWS_IOT_ENV.IOT_MQTT_HOST !== "" &&
            AWS_IOT_ENV.IOT_MQTT_REGION !== "";
    }
}

async function test_connection(config: MqttConnectionConfig, client: MqttClient) {
    const connection = client.new_connection(config);
    const promise = new Promise(async (resolve, reject) => {
        connection.on('connect', async (session_present) => {
            const disconnected = connection.disconnect();
            await expect(disconnected).resolves.toBeUndefined();

            if (session_present) {
                reject("Session present");
            }
        });
        connection.on('error', (error) => {
            reject(error);
        })
        connection.on('disconnect', () => {
            resolve(true);
        })
        const connected = connection.connect();
        await expect(connected).resolves.toBeDefined();
    });
    await expect(promise).resolves.toBeTruthy();
}

conditional_test(AWS_IOT_ENV.is_valid_ws_mqtt())('MQTT311 WS Connection - no credentials', async () => {
    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.WS_MQTT_HOST,
        port: parseInt(AWS_IOT_ENV.WS_MQTT_PORT),
        clean_session: true,
        socket_options: new SocketOptions()
    }
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_ws_auth_mqtt())('MQTT311 WS Connection - basic auth', async () => {
    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.WS_AUTH_MQTT_HOST,
        port: parseInt(AWS_IOT_ENV.WS_AUTH_MQTT_PORT),
        clean_session: true,
        username: AWS_IOT_ENV.BASIC_AUTH_USERNAME,
        password: AWS_IOT_ENV.BASIC_AUTH_PASSWORD,
        socket_options: new SocketOptions()
    }
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});
