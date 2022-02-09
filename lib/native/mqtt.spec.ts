/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { ClientBootstrap, TlsContextOptions } from '@awscrt/io';
import { MqttClient } from '@awscrt/mqtt';
import { AwsIotMqttConnectionConfigBuilder, WebsocketConfig } from '@awscrt/aws_iot';
import { AwsCredentialsProvider } from '@awscrt/auth';
import { Config, fetch_credentials } from '@test/credentials';
import { v4 as uuid } from 'uuid';

jest.setTimeout(10000);

async function test_websockets(aws_opts: Config, websocket_config: WebsocketConfig, client : MqttClient) {
    const config = AwsIotMqttConnectionConfigBuilder.new_with_websockets(websocket_config)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${uuid()}`)
        .with_endpoint(aws_opts.endpoint)
        .build()
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
