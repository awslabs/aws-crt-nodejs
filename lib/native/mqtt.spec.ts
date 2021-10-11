/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

import { ClientBootstrap, TlsContextOptions } from '@awscrt/io';
import { MqttClient } from '@awscrt/mqtt';
import { AwsIotMqttConnectionConfigBuilder, WebsocketConfig } from '@awscrt/aws_iot';
import { AwsCredentialsProvider } from '@awscrt/auth';
import { Config, fetch_credentials } from '@test/credentials';
import { v4 as uuid } from 'uuid';

jest.setTimeout(10000);

async function test_websockets(aws_opts: Config, websocket_config: WebsocketConfig, bootstrap : ClientBootstrap | undefined) {
    const config = AwsIotMqttConnectionConfigBuilder.new_with_websockets(websocket_config)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${uuid()}`)
        .with_endpoint(aws_opts.endpoint)
        .build()
    const client = new MqttClient(bootstrap);
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
    const bootstrap: ClientBootstrap = new ClientBootstrap();
    let aws_opts: Config = await fetch_credentials();

    await test_websockets(aws_opts, {
        region: "us-east-1",
        credentials_provider: AwsCredentialsProvider.newStatic(
            aws_opts.access_key,
            aws_opts.secret_key,
            aws_opts.session_token
        ),
    }, bootstrap);
});

test('MQTT Native Websocket Connect/Disconnect Undef Bootstrap', async () => {
    let aws_opts: Config = await fetch_credentials();

    await test_websockets(aws_opts, {
        region: "us-east-1",
        credentials_provider: AwsCredentialsProvider.newStatic(
            aws_opts.access_key,
            aws_opts.secret_key,
            aws_opts.session_token
        ),
    }, undefined);
});

test('MQTT Native Websocket Connect/Disconnect with TLS Context Options', async () => {
    const bootstrap: ClientBootstrap = new ClientBootstrap();
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
    }, bootstrap);
});
