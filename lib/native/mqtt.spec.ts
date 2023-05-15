/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { ClientBootstrap, TlsContextOptions, ClientTlsContext, SocketOptions } from './io';
import { MqttClient, MqttConnectionConfig, QoS } from './mqtt';
import { v4 as uuid } from 'uuid';
import {HttpProxyOptions, HttpProxyAuthenticationType, HttpProxyConnectionType} from "./http"
import { AwsIotMqttConnectionConfigBuilder } from './aws_iot';

jest.setTimeout(10000);

const conditional_test = (condition: boolean) => condition ? it : it.skip;

class AWS_IOT_ENV {
    public static IOT_MQTT_HOST = process.env.AWS_TEST_MQTT311_IOT_CORE_HOST ?? "";
    public static IOT_MQTT_RSA_CERT = process.env.AWS_TEST_MQTT311_IOT_CORE_RSA_CERT ?? "";
    public static IOT_MQTT_RSA_KEY = process.env.AWS_TEST_MQTT311_IOT_CORE_RSA_KEY ?? "";
    public static IOT_MQTT_ECC_CERT = process.env.AWS_TEST_MQTT311_IOT_CORE_ECC_CERT ?? "";
    public static IOT_MQTT_ECC_KEY = process.env.AWS_TEST_MQTT311_IOT_CORE_ECC_KEY ?? "";
    public static IOT_MQTT_REGION = process.env.AWS_TEST_MQTT311_IOT_CORE_REGION ?? "";

    public static DIRECT_MQTT_HOST = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_HOST ?? "";
    public static DIRECT_MQTT_PORT = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_PORT ?? "";
    public static DIRECT_AUTH_MQTT_HOST = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_BASIC_AUTH_HOST ?? "";
    public static DIRECT_AUTH_MQTT_PORT = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_BASIC_AUTH_PORT ?? "";
    public static DIRECT_TLS_MQTT_HOST = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_TLS_HOST ?? "";
    public static DIRECT_TLS_MQTT_PORT = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_TLS_PORT ?? "";

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

    public static is_valid_direct_mqtt() {
        return AWS_IOT_ENV.DIRECT_MQTT_HOST !== "" &&
            AWS_IOT_ENV.DIRECT_AUTH_MQTT_PORT !== "";
    }
    public static is_valid_direct_auth_mqtt() {
        return AWS_IOT_ENV.DIRECT_AUTH_MQTT_HOST !== "" &&
            AWS_IOT_ENV.DIRECT_AUTH_MQTT_PORT !== "" &&
            AWS_IOT_ENV.BASIC_AUTH_USERNAME !== "" &&
            AWS_IOT_ENV.BASIC_AUTH_PASSWORD !== "";
    }
    public static is_valid_direct_tls_mqtt() {
        return AWS_IOT_ENV.DIRECT_TLS_MQTT_HOST !== "" &&
            AWS_IOT_ENV.DIRECT_TLS_MQTT_PORT !== "";
    }
    public static is_valid_direct_proxy() {
        return AWS_IOT_ENV.DIRECT_TLS_MQTT_HOST !== "" &&
            AWS_IOT_ENV.DIRECT_TLS_MQTT_PORT !== "" &&
            AWS_IOT_ENV.PROXY_HOST !== "" &&
            AWS_IOT_ENV.PROXY_PORT !== "";
    }
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

    public static is_valid_iot_rsa() {
        return AWS_IOT_ENV.IOT_MQTT_HOST !== "" &&
            AWS_IOT_ENV.IOT_MQTT_RSA_CERT !== "" &&
            AWS_IOT_ENV.IOT_MQTT_RSA_KEY !== "";
    }
    public static is_valid_iot_ecc() {
        return AWS_IOT_ENV.IOT_MQTT_HOST !== "" &&
            AWS_IOT_ENV.IOT_MQTT_ECC_CERT !== "" &&
            AWS_IOT_ENV.IOT_MQTT_ECC_KEY !== "";
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

conditional_test(AWS_IOT_ENV.is_valid_direct_mqtt())('MQTT311 Connection - no credentials', async () => {
    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.DIRECT_MQTT_HOST,
        port: parseInt(AWS_IOT_ENV.DIRECT_MQTT_PORT),
        clean_session: true,
        socket_options: new SocketOptions()
    }
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_direct_auth_mqtt())('MQTT311 Connection - basic auth', async () => {
    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.DIRECT_AUTH_MQTT_HOST,
        port: parseInt(AWS_IOT_ENV.DIRECT_AUTH_MQTT_PORT),
        clean_session: true,
        username: AWS_IOT_ENV.BASIC_AUTH_USERNAME,
        password: AWS_IOT_ENV.BASIC_AUTH_PASSWORD,
        socket_options: new SocketOptions()
    }
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_direct_tls_mqtt())('MQTT311 Connection - TLS', async () => {
    const tls_ctx_options = new TlsContextOptions();
    tls_ctx_options.verify_peer = false;
    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.DIRECT_TLS_MQTT_HOST,
        port: parseInt(AWS_IOT_ENV.DIRECT_TLS_MQTT_PORT),
        clean_session: true,
        socket_options: new SocketOptions(),
        tls_ctx: new ClientTlsContext(tls_ctx_options)
    };
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_direct_proxy())('MQTT311 Connection - Proxy', async () => {
    const tls_ctx_options = new TlsContextOptions();
    tls_ctx_options.verify_peer = false;
    let tls_ctx = new ClientTlsContext(tls_ctx_options);

    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.DIRECT_TLS_MQTT_HOST,
        port: parseInt(AWS_IOT_ENV.DIRECT_TLS_MQTT_PORT),
        clean_session: true,
        proxy_options: new HttpProxyOptions(
            AWS_IOT_ENV.PROXY_HOST,
            parseInt(AWS_IOT_ENV.PROXY_PORT),
            HttpProxyAuthenticationType.None,
            undefined,
            undefined,
            undefined,
            HttpProxyConnectionType.Tunneling
        ),
        socket_options: new SocketOptions(),
        tls_ctx: tls_ctx
    }
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_iot_rsa())('MQTT311 Connection - mTLS RSA', async () => {
    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.IOT_MQTT_HOST,
        port: 8883,
        clean_session: true,
        socket_options: new SocketOptions()
    }
    let tls_ctx_options: TlsContextOptions = TlsContextOptions.create_client_with_mtls_from_path(
        AWS_IOT_ENV.IOT_MQTT_RSA_CERT,
        AWS_IOT_ENV.IOT_MQTT_RSA_KEY
    );
    config.tls_ctx = new ClientTlsContext(tls_ctx_options);
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_iot_ecc())('MQTT311 Connection - mTLS ECC', async () => {
    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.IOT_MQTT_HOST,
        port: 8883,
        clean_session: true,
        socket_options: new SocketOptions()
    }
    let tls_ctx_options: TlsContextOptions = TlsContextOptions.create_client_with_mtls_from_path(
        AWS_IOT_ENV.IOT_MQTT_ECC_CERT,
        AWS_IOT_ENV.IOT_MQTT_ECC_KEY
    );
    config.tls_ctx = new ClientTlsContext(tls_ctx_options);
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_ws_mqtt())('MQTT311 WS Connection - no credentials', async () => {
    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.WS_MQTT_HOST,
        port: parseInt(AWS_IOT_ENV.WS_MQTT_PORT),
        clean_session: true,
        use_websocket: true,
        socket_options: new SocketOptions()
    }
    config.websocket_handshake_transform = async (request, done) => {
        done();
    }
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_ws_auth_mqtt())('MQTT311 WS Connection - basic auth', async () => {
    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.WS_AUTH_MQTT_HOST,
        port: parseInt(AWS_IOT_ENV.WS_AUTH_MQTT_PORT),
        clean_session: true,
        use_websocket: true,
        username: AWS_IOT_ENV.BASIC_AUTH_USERNAME,
        password: AWS_IOT_ENV.BASIC_AUTH_PASSWORD,
        socket_options: new SocketOptions()
    }
    config.websocket_handshake_transform = async (request, done) => {
        done();
    }
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_ws_tls_mqtt())('MQTT311 WS Connection - TLS', async () => {
    const tls_ctx_options = new TlsContextOptions();
    tls_ctx_options.verify_peer = false;
    let tls_ctx = new ClientTlsContext(tls_ctx_options);
    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.WS_TLS_MQTT_HOST,
        port: parseInt(AWS_IOT_ENV.WS_TLS_MQTT_PORT),
        clean_session: true,
        use_websocket: true,
        socket_options: new SocketOptions(),
        tls_ctx: tls_ctx
    }
    config.websocket_handshake_transform = async (request, done) => {
        done();
    }
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_ws_proxy())('MQTT311 WS Connection - Proxy', async () => {
    const tls_ctx_options = new TlsContextOptions();
    tls_ctx_options.verify_peer = false;
    let tls_ctx = new ClientTlsContext(tls_ctx_options);
    const config : MqttConnectionConfig = {
        client_id : `node-mqtt-unit-test-${uuid()}`,
        host_name: AWS_IOT_ENV.WS_TLS_MQTT_HOST,
        port: parseInt(AWS_IOT_ENV.WS_TLS_MQTT_PORT),
        clean_session: true,
        use_websocket: true,
        proxy_options: new HttpProxyOptions(
            AWS_IOT_ENV.PROXY_HOST,
            parseInt(AWS_IOT_ENV.PROXY_PORT),
            HttpProxyAuthenticationType.None,
            undefined,
            undefined,
            undefined,
            HttpProxyConnectionType.Tunneling
        ),
        socket_options: new SocketOptions(),
        tls_ctx: tls_ctx
    }
    config.websocket_handshake_transform = async (request, done) => {
        done();
    }
    await test_connection(config, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_iot_rsa())('MQTT Operation statistics simple', async () => {
    const promise = new Promise(async (resolve, reject) => {

        const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(
            AWS_IOT_ENV.IOT_MQTT_RSA_CERT, AWS_IOT_ENV.IOT_MQTT_RSA_KEY)
            .with_clean_session(true)
            .with_client_id(`node-mqtt-unit-test-${uuid()}`)
            .with_endpoint(AWS_IOT_ENV.IOT_MQTT_HOST)
            .build()
        const client = new MqttClient(new ClientBootstrap());
        const connection = client.new_connection(config);

        connection.on('connect', async (session_present) => {
            expect(session_present).toBeFalsy();

            let statistics = connection.getQueueStatistics();
            expect(statistics.incompleteOperationCount).toBeLessThanOrEqual(0);
            expect(statistics.incompleteOperationSize).toBeLessThanOrEqual(0);
            expect(statistics.unackedOperationCount).toBeLessThanOrEqual(0);
            expect(statistics.unackedOperationSize).toBeLessThanOrEqual(0);

            const test_topic = `/test/me/senpai/${uuid()}`;
            const test_payload = 'NOTICE ME';
            const sub = connection.subscribe(test_topic, QoS.AtLeastOnce, async (topic, payload, dup, qos, retain) => {
                resolve(true);

                const unsubscribed = connection.unsubscribe(test_topic);
                await expect(unsubscribed).resolves.toHaveProperty('packet_id');

                statistics = connection.getQueueStatistics();
                expect(statistics.incompleteOperationCount).toBeLessThanOrEqual(0);
                expect(statistics.incompleteOperationSize).toBeLessThanOrEqual(0);
                expect(statistics.unackedOperationCount).toBeLessThanOrEqual(0);
                expect(statistics.unackedOperationSize).toBeLessThanOrEqual(0);

                const disconnected = connection.disconnect();
                await expect(disconnected).resolves.toBeUndefined();
            });
            await expect(sub).resolves.toBeTruthy();

            const pub = connection.publish(test_topic, test_payload, QoS.AtLeastOnce);
            await expect(pub).resolves.toBeTruthy();
        });
        connection.on('error', (error) => {
            reject(error);
        })
        const connected = connection.connect();
        await expect(connected).resolves.toBeDefined();
    });
    await expect(promise).resolves.toBeTruthy();
});

conditional_test(AWS_IOT_ENV.is_valid_iot_rsa())('MQTT Operation statistics check publish', async () => {
    const promise = new Promise(async (resolve, reject) => {

        const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(
            AWS_IOT_ENV.IOT_MQTT_RSA_CERT, AWS_IOT_ENV.IOT_MQTT_RSA_KEY)
            .with_clean_session(true)
            .with_client_id(`node-mqtt-unit-test-${uuid()}`)
            .with_endpoint(AWS_IOT_ENV.IOT_MQTT_HOST)
            .build()
        const client = new MqttClient(new ClientBootstrap());
        const connection = client.new_connection(config);

        connection.on('connect', async (session_present) => {
            expect(session_present).toBeFalsy();

            let statistics = connection.getQueueStatistics();
            expect(statistics.incompleteOperationCount).toBeLessThanOrEqual(0);
            expect(statistics.incompleteOperationSize).toBeLessThanOrEqual(0);
            expect(statistics.unackedOperationCount).toBeLessThanOrEqual(0);
            expect(statistics.unackedOperationSize).toBeLessThanOrEqual(0);

            const test_topic = `/test/me/senpai/${uuid()}`;
            const test_payload = 'NOTICE ME';
            const sub = connection.subscribe(test_topic, QoS.AtLeastOnce, async (topic, payload, dup, qos, retain) => {
                resolve(true);

                const unsubscribed = connection.unsubscribe(test_topic);
                await expect(unsubscribed).resolves.toHaveProperty('packet_id');

                const disconnected = connection.disconnect();
                await expect(disconnected).resolves.toBeUndefined();
            });
            await expect(sub).resolves.toBeTruthy();

            const pub = connection.publish(test_topic, test_payload, QoS.AtLeastOnce);
            await expect(pub).resolves.toBeTruthy();

            statistics = connection.getQueueStatistics();
            expect(statistics.incompleteOperationCount).toBeLessThanOrEqual(1);
            expect(statistics.incompleteOperationSize).toBeLessThanOrEqual(test_topic.length + test_payload.length + 4);
            expect(statistics.unackedOperationCount).toBeLessThanOrEqual(0);
            expect(statistics.unackedOperationSize).toBeLessThanOrEqual(0);
        });
        connection.on('error', (error) => {
            reject(error);
        })
        const connected = connection.connect();
        await expect(connected).resolves.toBeDefined();
    });
    await expect(promise).resolves.toBeTruthy();
});
