/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as AWS from 'aws-sdk';
import { ClientBootstrap } from '../lib/native/io';
import { MqttClient, QoS } from '../lib/native/mqtt';
import { AwsIotMqttConnectionConfigBuilder } from '../lib/native/aws_iot';
import { TextDecoder } from 'util';

class Config {
    static readonly region = 'us-east-1';

    public endpoint = "";
    public certificate = "";
    public private_key = "";
    
    configured() {
        return this.certificate && this.private_key && this.endpoint;
    }

    static _cached: Config;
};

async function fetch_credentials() : Promise<Config> {
    if (Config._cached) {
        return Config._cached;
    }

    return new Promise((resolve, reject) => {
        const client = new AWS.SecretsManager({
            region: Config.region
        });

        const config = new Config();
        const resolve_if_done = () => {
            if (config.configured()) {
                Config._cached = config;
                resolve(config);
            }
        }

        client.getSecretValue({ SecretId: 'unit-test/endpoint' }, (error, data) => {
            if (error) {
                reject(error);
            }

            config.endpoint = JSON.parse(data.SecretString as string).endpoint;
            resolve_if_done();
        });
        client.getSecretValue({ SecretId: 'unit-test/certificate' }, (error, data) => {
            if (error) {
                reject(error);
            }

            config.certificate = data.SecretString as string;
            resolve_if_done();
        });
        client.getSecretValue({ SecretId: 'unit-test/privatekey' }, (error, data) => {
            if (error) {
                reject(error);
            }

            config.private_key = data.SecretString as string;
            resolve_if_done();
        });
    });
}

test('MQTT Connect/Disconnect', async (done) => {
    const aws_opts = await fetch_credentials();
    const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${new Date()}`)
        .with_endpoint(aws_opts.endpoint)
        .build()
    const client = new MqttClient(new ClientBootstrap());
    const connection = client.new_connection(config);
    connection.on('connect', (session_present) => {
        expect(session_present).toBeFalsy();
        connection.disconnect();
    });
    connection.on('error', (error) => {
        console.log(error);
        expect(error).toBeUndefined();
        done();
    })
    connection.on('disconnect', () => {
        done();
    })
    connection.connect();
}, 10000);

test('MQTT Pub/Sub', async (done) => {
    const decoder = new TextDecoder('utf8');
    const aws_opts = await fetch_credentials();
    const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${new Date()}`)
        .with_endpoint(aws_opts.endpoint)
        .build()
    const client = new MqttClient(new ClientBootstrap());
    const connection = client.new_connection(config);
    connection.on('connect', (session_present) => {
        expect(session_present).toBeFalsy();
        const test_topic = '/test/me/senpai';
        const test_payload = 'TEST_PAYLOAD';
        connection.subscribe(test_topic, QoS.AtLeastOnce, (topic, payload) => {
            expect(topic).toBe(test_topic);
            expect(payload).toBeDefined();
            const payload_str = decoder.decode(payload);
            expect(payload_str).toBe(test_payload);

            connection.disconnect();
        });
        connection.publish(test_topic, test_payload, QoS.AtLeastOnce);
    });
    connection.on('error', (error) => {
        console.log(error);
        expect(error).toBeUndefined();
        done();
    })
    connection.on('disconnect', () => {
        done();
    })
    connection.connect();
}, 30000);
