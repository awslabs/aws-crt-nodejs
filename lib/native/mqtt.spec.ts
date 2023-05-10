/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { ClientBootstrap, Pkcs11Lib, TlsContextOptions } from '@awscrt/io';
import { MqttClient, QoS } from '@awscrt/mqtt';
import { AwsIotMqttConnectionConfigBuilder, WebsocketConfig } from '@awscrt/aws_iot';
import { AwsCredentialsProvider } from '@awscrt/auth';
import { v4 as uuid } from 'uuid';

jest.setTimeout(10000);

const conditional_test = (condition: boolean) => condition ? it : it.skip;

class AWS_IOT_ENV {
    public static HOST = process.env.AWS_TEST_MQTT311_IOT_CORE_HOST ?? "";
    public static CERT = process.env.AWS_TEST_MQTT311_IOT_CORE_RSA_CERT ?? "";
    public static KEY = process.env.AWS_TEST_MQTT311_IOT_CORE_RSA_KEY ?? "";
    public static REGION = process.env.AWS_TEST_MQTT311_IOT_CORE_REGION ?? "";

    public static ECC_CERT = process.env.AWS_TEST_MQTT311_IOT_CORE_ECC_CERT ?? "";
    public static ECC_KEY = process.env.AWS_TEST_MQTT311_IOT_CORE_ECC_KEY ?? "";

    public static CRED_ACCESS_KEY = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_ACCESS_KEY ?? "";
    public static CRED_SECRET_KEY = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_SECRET_ACCESS_KEY ?? "";
    public static CRED_SESSION_TOKEN = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_SESSION_TOKEN ?? "";

    public static PKCS11_LIB_PATH = process.env.AWS_TEST_PKCS11_LIB ?? ""
    public static PKCS11_PIN = process.env.AWS_TEST_PKCS11_PIN ?? ""
    public static PKCS11_TOKEN_LABEL = process.env.AWS_TEST_PKCS11_TOKEN_LABEL ?? ""
    public static PKCS11_KEY_LABEL = process.env.AWS_TEST_PKCS11_KEY_LABEL ?? ""
    public static PKCS11_CERT = process.env.AWS_TEST_PKCS11_CERT_FILE ?? "";

    public static is_valid() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.CERT !== "" &&
            AWS_IOT_ENV.KEY !== ""
    }
    public static is_valid_ecc() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.ECC_CERT !== "" &&
            AWS_IOT_ENV.ECC_KEY !== ""
    }
    public static is_valid_cred() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.REGION !== "" &&
            AWS_IOT_ENV.CRED_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.CRED_SECRET_KEY !== "" &&
            AWS_IOT_ENV.CRED_SESSION_TOKEN !== ""
    }
    public static is_valid_pkcs11() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.PKCS11_LIB_PATH !== "" &&
            AWS_IOT_ENV.PKCS11_PIN !== "" &&
            AWS_IOT_ENV.PKCS11_TOKEN_LABEL !== "" &&
            AWS_IOT_ENV.PKCS11_KEY_LABEL !== "" &&
            AWS_IOT_ENV.PKCS11_CERT !== ""
    }
}

async function test_websockets(websocket_config: WebsocketConfig, client: MqttClient) {
    const builder = AwsIotMqttConnectionConfigBuilder.new_with_websockets(websocket_config);
    await test_builder(builder, client);
}

async function test_builder(builder: AwsIotMqttConnectionConfigBuilder, client: MqttClient) {
    const config = builder
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${uuid()}`)
        .with_endpoint(AWS_IOT_ENV.HOST)
        .build();
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

conditional_test(AWS_IOT_ENV.is_valid_cred())('MQTT Native Websocket Connect/Disconnect', async () => {
    await test_websockets({
        region: AWS_IOT_ENV.REGION,
        credentials_provider: AwsCredentialsProvider.newStatic(
            AWS_IOT_ENV.CRED_ACCESS_KEY,
            AWS_IOT_ENV.CRED_SECRET_KEY,
            AWS_IOT_ENV.CRED_SESSION_TOKEN
        ),
    }, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_cred())('MQTT Native Websocket Connect/Disconnect No Bootstrap', async () => {
    await test_websockets({
        region: AWS_IOT_ENV.REGION,
        credentials_provider: AwsCredentialsProvider.newStatic(
            AWS_IOT_ENV.CRED_ACCESS_KEY,
            AWS_IOT_ENV.CRED_SECRET_KEY,
            AWS_IOT_ENV.CRED_SESSION_TOKEN
        ),
    }, new MqttClient());
});

conditional_test(AWS_IOT_ENV.is_valid_cred())('MQTT Native Websocket Connect/Disconnect with TLS Context Options', async () => {
    let tls_ctx_options = new TlsContextOptions();
    tls_ctx_options.alpn_list = [];
    tls_ctx_options.verify_peer = true;

    await test_websockets({
        region: AWS_IOT_ENV.REGION,
        tls_ctx_options: tls_ctx_options,
        credentials_provider: AwsCredentialsProvider.newStatic(
            AWS_IOT_ENV.CRED_ACCESS_KEY,
            AWS_IOT_ENV.CRED_SECRET_KEY,
            AWS_IOT_ENV.CRED_SESSION_TOKEN
        ),
    }, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid_pkcs11())('MQTT Native PKCS#11 Connect/Disconnect', async () => {
    const pkcs11_lib = new Pkcs11Lib(AWS_IOT_ENV.PKCS11_LIB_PATH);

    const builder = AwsIotMqttConnectionConfigBuilder.new_mtls_pkcs11_builder({
        pkcs11_lib: pkcs11_lib,
        user_pin: AWS_IOT_ENV.PKCS11_PIN,
        token_label: AWS_IOT_ENV.PKCS11_TOKEN_LABEL,
        private_key_object_label: AWS_IOT_ENV.PKCS11_KEY_LABEL,
        cert_file_contents: AWS_IOT_ENV.PKCS11_CERT,
    });

    await test_builder(builder, new MqttClient(new ClientBootstrap()));
});


conditional_test(AWS_IOT_ENV.is_valid_ecc())('MQTT Native ECC key Connect/Disconnect', async () => {
    const builder = AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(AWS_IOT_ENV.ECC_CERT, AWS_IOT_ENV.ECC_KEY);
    await test_builder(builder, new MqttClient(new ClientBootstrap()));
});

conditional_test(AWS_IOT_ENV.is_valid())('MQTT Operation statistics simple', async () => {
    const promise = new Promise(async (resolve, reject) => {

        const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(AWS_IOT_ENV.CERT, AWS_IOT_ENV.KEY)
            .with_clean_session(true)
            .with_client_id(`node-mqtt-unit-test-${uuid()}`)
            .with_endpoint(AWS_IOT_ENV.HOST)
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

conditional_test(AWS_IOT_ENV.is_valid())('MQTT Operation statistics check publish', async () => {
    const promise = new Promise(async (resolve, reject) => {

        const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(AWS_IOT_ENV.CERT, AWS_IOT_ENV.KEY)
            .with_clean_session(true)
            .with_client_id(`node-mqtt-unit-test-${uuid()}`)
            .with_endpoint(AWS_IOT_ENV.HOST)
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
