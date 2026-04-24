/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as test_env from "@test/test_env";
import * as retry from "@test/retry";
import * as mqtt_server from "@test/mqtt_server";
import * as test_metrics from "@test/metrics";
import { ClientBootstrap, SocketOptions } from './io';
import { MqttClient, MqttConnectionConfig, MqttClientConnection } from './mqtt';
import { v4 as uuid } from 'uuid';
import * as mqtt_shared from "../common/mqtt_shared";

jest.setTimeout(30000);

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

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt311_is_valid_ws_mqtt())('MQTT311 WS Connection - no credentials', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        const config: MqttConnectionConfig = {
            client_id: `node-mqtt-unit-test-${uuid()}`,
            host_name: test_env.AWS_IOT_ENV.MQTT311_WS_MQTT_HOST,
            port: parseInt(test_env.AWS_IOT_ENV.MQTT311_WS_MQTT_PORT),
            clean_session: true,
            socket_options: new SocketOptions()
        }
        await test_connection(config, new MqttClient(new ClientBootstrap()));
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt311_is_valid_ws_auth_mqtt())('MQTT311 WS Connection - basic auth', async () => {
    await retry.networkTimeoutRetryWrapper( async () => {
        const config: MqttConnectionConfig = {
            client_id: `node-mqtt-unit-test-${uuid()}`,
            host_name: test_env.AWS_IOT_ENV.MQTT311_WS_AUTH_MQTT_HOST,
            port: parseInt(test_env.AWS_IOT_ENV.MQTT311_WS_AUTH_MQTT_PORT),
            clean_session: true,
            username: test_env.AWS_IOT_ENV.MQTT311_BASIC_AUTH_USERNAME,
            password: test_env.AWS_IOT_ENV.MQTT311_BASIC_AUTH_PASSWORD,
            socket_options: new SocketOptions()
        }
        await test_connection(config, new MqttClient(new ClientBootstrap()));
    })
});

async function doMetricsTestConnect311(server: mqtt_server.MqttServer, disableMetrics: boolean, username?: string) {
    let clientConfig : MqttConnectionConfig = {
        client_id: "irrelevant",
        host_name: "localhost",
        port: server.getPort(),
        socket_options: new SocketOptions(),
        disable_metrics: disableMetrics,
    };

    if (username !== undefined) {
        clientConfig.username = username;
    }

    let client = new MqttClient();
    let connection = new MqttClientConnection(client, clientConfig);

    await connection.connect();
}

test('mqtt311 metrics - enabled, undefined username', async () => {
    await test_metrics.doMetricsUsernameTest(mqtt_shared.ProtocolMode.Mqtt311, doMetricsTestConnect311, false);
});

test('mqtt311 metrics - disabled, undefined username', async () => {
    await test_metrics.doMetricsUsernameTest(mqtt_shared.ProtocolMode.Mqtt311, doMetricsTestConnect311, true);
});

test('mqtt311 metrics - enabled, non-empty username', async () => {
    await test_metrics.doMetricsUsernameTest(mqtt_shared.ProtocolMode.Mqtt311, doMetricsTestConnect311, false, "squidward");
});

test('mqtt311 metrics - disabled, non-empty username', async () => {
    await test_metrics.doMetricsUsernameTest(mqtt_shared.ProtocolMode.Mqtt311, doMetricsTestConnect311, true, "krustykrab");
});