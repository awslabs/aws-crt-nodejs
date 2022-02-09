/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { ClientBootstrap, Pkcs11Lib, TlsContextOptions } from '@awscrt/io';
import { MqttClient } from '@awscrt/mqtt';
import { AwsIotMqttConnectionConfigBuilder, WebsocketConfig } from '@awscrt/aws_iot';
import { AwsCredentialsProvider } from '@awscrt/auth';
import { Config, fetch_credentials } from '@test/credentials';
import { v4 as uuid } from 'uuid';

import {LogLevel, enable_logging} from '@awscrt/io'
import { ClientTlsContext } from './io';

jest.setTimeout(10000);

const conditional_test = (condition: boolean) => condition ? it : it.skip;

class Pkcs11Config {
    public static LIB_PATH = process.env.AWS_TEST_PKCS11_LIB ?? ""
    public static PIN = process.env.AWS_TEST_PKCS11_PIN ?? ""
    public static TOKEN_LABEL = process.env.AWS_TEST_PKCS11_TOKEN_LABEL ?? ""
    public static KEY_LABEL = process.env.AWS_TEST_PKCS11_KEY_LABEL ?? ""

    public static is_valid() {
        return Pkcs11Config.LIB_PATH !== "" &&
            Pkcs11Config.PIN !== "" &&
            Pkcs11Config.TOKEN_LABEL !== "" &&
            Pkcs11Config.KEY_LABEL !== "";
    }
}

async function test_websockets(aws_opts: Config, websocket_config: WebsocketConfig, client: MqttClient) {
    const builder = AwsIotMqttConnectionConfigBuilder.new_with_websockets(websocket_config);
    await test_builder(aws_opts, builder, client);
}

async function test_builder(aws_opts: Config, builder: AwsIotMqttConnectionConfigBuilder, client: MqttClient) {
    const config = builder
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${uuid()}`)
        .with_endpoint(aws_opts.endpoint)
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

test('MQTT Native Websocket Connect/Disconnect', async () => {
    let aws_opts: Config = await fetch_credentials();

    await test_websockets(aws_opts, {
        region: "us-east-1",
        credentials_provider: AwsCredentialsProvider.newStatic(
            aws_opts.access_key,
            aws_opts.secret_key,
            aws_opts.session_token
        ),
    }, new MqttClient(new ClientBootstrap()));
});

test('MQTT Native Websocket Connect/Disconnect No Bootstrap', async () => {
    let aws_opts: Config = await fetch_credentials();

    await test_websockets(aws_opts, {
        region: "us-east-1",
        credentials_provider: AwsCredentialsProvider.newStatic(
            aws_opts.access_key,
            aws_opts.secret_key,
            aws_opts.session_token
        ),
    }, new MqttClient());
});

test('MQTT Native Websocket Connect/Disconnect with TLS Context Options', async () => {
    let aws_opts: Config = await fetch_credentials();

    let tls_ctx_options = new TlsContextOptions();
    tls_ctx_options.alpn_list = [];
    tls_ctx_options.verify_peer = true;

    await test_websockets(aws_opts, {
        region: "us-east-1",
        tls_ctx_options: tls_ctx_options,
        credentials_provider: AwsCredentialsProvider.newStatic(
            aws_opts.access_key,
            aws_opts.secret_key,
            aws_opts.session_token
        ),
    }, new MqttClient(new ClientBootstrap()));
});

conditional_test(Pkcs11Config.is_valid())('MQTT PKCS#11 Connect/Disconnect', async () => {

    enable_logging(LogLevel.ERROR);

    const tls = new ClientTlsContext(TlsContextOptions.create_client_with_mtls_pkcs11({
        pkcs11_lib: new Pkcs11Lib(Pkcs11Config.LIB_PATH, Pkcs11Lib.InitializeFinalizeBehavior.STRICT),
        user_pin: Pkcs11Config.PIN,
        token_label: Pkcs11Config.TOKEN_LABEL,
    }));
    console.log(tls);

    // // const aws_opts: Config = await fetch_credentials();
    // const aws_opts: Config = new Config();
    // aws_opts.endpoint = 'a1tuymqrkgf0h8-ats.iot.us-west-2.amazonaws.com';

    // const builder = AwsIotMqttConnectionConfigBuilder.new_mtls_pkcs11_builder({
    //     pkcs11_lib: new Pkcs11Lib(Pkcs11Config.LIB_PATH, Pkcs11Lib.InitializeFinalizeBehavior.STRICT),
    //     user_pin: Pkcs11Config.PIN,
    //     token_label: Pkcs11Config.TOKEN_LABEL,
    // });

    // const mqtt_client = new MqttClient(new ClientBootstrap());

    // await test_builder(aws_opts, builder, mqtt_client);
});
