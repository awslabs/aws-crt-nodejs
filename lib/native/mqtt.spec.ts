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

import { ClientBootstrap } from '@awscrt/io';
import { MqttClient } from '@awscrt/mqtt';
import { AwsIotMqttConnectionConfigBuilder } from '@awscrt/aws_iot';
import { AwsCredentialsProvider } from '@awscrt/auth';
import { Config, fetch_credentials } from '@test/credentials';

jest.setTimeout(10000);

test('MQTT Native Websocket Connect/Disconnect', async () => {
    let aws_opts: Config;
    try {
        aws_opts = await fetch_credentials();
    } catch (err) {
        return;
    }

    const bootstrap = new ClientBootstrap();
    const config = AwsIotMqttConnectionConfigBuilder.new_with_websockets({
        region: "us-east-1",
        credentials_provider: AwsCredentialsProvider.newStatic(
            aws_opts.access_key,
            aws_opts.secret_key,
            aws_opts.session_token
        ),
    })
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${new Date()}`)
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
});
