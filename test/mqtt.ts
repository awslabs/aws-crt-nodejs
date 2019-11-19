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
import { MqttClient, QoS, MqttWill } from '../lib/native/mqtt';
import { AwsIotMqttConnectionConfigBuilder } from '../lib/native/aws_iot';
import { TextDecoder } from 'util';

jest.setTimeout(10000);
jest.retryTimes(3);

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

async function fetch_credentials(): Promise<Config> {
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

            try {
                config.endpoint = data.SecretString as string;
            } catch (err) {
                reject(err);
            }
            
            resolve_if_done();
        });
        client.getSecretValue({ SecretId: 'unit-test/certificate' }, (error, data) => {
            if (error) {
                reject(error);
            }

            try {
                config.certificate = data.SecretString as string;
            } catch (err) {
                reject(err);
            }
            
            resolve_if_done();
        });
        client.getSecretValue({ SecretId: 'unit-test/privatekey' }, (error, data) => {
            if (error) {
                reject(error);
            }

            try {
                config.private_key = data.SecretString as string;
            } catch (err) {
                reject(err);
            }
            
            resolve_if_done();
        });
    });
}

test('MQTT Connect/Disconnect', async () => {
    const aws_opts = await fetch_credentials();
    const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${new Date()}`)
        .with_endpoint(aws_opts.endpoint)
        .build()
    const client = new MqttClient(new ClientBootstrap());
    const connection = client.new_connection(config);
    const promise = new Promise((resolve, reject) => {
        connection.on('connect', (session_present) => {
            connection.disconnect();

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
        connection.connect();
    });
    await expect(promise).resolves.toBeTruthy();
});

test('MQTT Pub/Sub', async () => {
    const decoder = new TextDecoder('utf8');
    const aws_opts = await fetch_credentials();
    const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${new Date()}`)
        .with_endpoint(aws_opts.endpoint)
        .with_timeout_ms(5000)
        .build()
    const client = new MqttClient(new ClientBootstrap());
    const connection = client.new_connection(config);
    const promise = new Promise((resolve, reject) => {
        connection.on('connect', async (session_present) => {
            expect(session_present).toBeFalsy();
            const test_topic = '/test/me/senpai';
            const test_payload = 'NOTICE ME';
            connection.subscribe(test_topic, QoS.AtLeastOnce, (topic, payload) => {
                connection.disconnect();

                if (topic != test_topic) {
                    reject("Topic does not match");
                }
                if (payload === undefined) {
                    reject("Undefined payload");
                }
                const payload_str = decoder.decode(payload);
                if (payload_str !== test_payload) {
                    reject("Payloads do not match");
                }
            });
            connection.publish(test_topic, test_payload, QoS.AtLeastOnce);
        });
        connection.on('error', (error) => {
            reject(error);
        })
        connection.on('disconnect', () => {
            resolve(true);
        })
        connection.connect();
    });
    await expect(promise).resolves.toBeTruthy();
});

test('MQTT Will', async () => {
    const aws_opts = await fetch_credentials();
    const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${new Date()}`)
        .with_endpoint(aws_opts.endpoint)
        .with_will(new MqttWill(
            '/last/will/and/testament',
            QoS.AtLeastOnce,
            'AVENGE ME'
        ))
        .build()
    const client = new MqttClient(new ClientBootstrap());
    const connection = client.new_connection(config);
    const promise = new Promise((resolve, reject) => {
        connection.on('connect', (session_present) => {
            connection.disconnect();

            if (session_present) {
                reject("Session present");
            }
        });
        connection.on('error', (error) => {
            reject(error)
        })
        connection.on('disconnect', () => {
            resolve(true);
        })
        connection.connect();
    });
    await expect(promise).resolves.toBeTruthy();
});

test('MQTT On Any Publish', async () => {
    const decoder = new TextDecoder('utf8');
    const aws_opts = await fetch_credentials();
    const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${new Date()}`)
        .with_endpoint(aws_opts.endpoint)
        .with_timeout_ms(5000)
        .build()
    const client = new MqttClient(new ClientBootstrap());
    const connection = client.new_connection(config);
    const promise = new Promise((resolve, reject) => {
        const test_topic = '/test/me/senpai';
        const test_payload = 'NOTICE ME';
        // have to subscribe or else the broker won't send us the message
        connection.subscribe(test_topic, QoS.AtLeastOnce);
        connection.on('message', (topic, payload) => {
            connection.disconnect();
            if (topic != test_topic) {
                reject("Topic does not match");
            }
            if (payload === undefined) {
                reject("Undefined payload");
            }
            const payload_str = decoder.decode(payload);
            if (payload_str !== test_payload) {
                reject("Payloads do not match");
            }
        });
        connection.on('connect', async (session_present) => {
            expect(session_present).toBeFalsy();
            connection.publish(test_topic, test_payload, QoS.AtLeastOnce);
        });
        connection.on('error', (error) => {
            reject(error);
        })
        connection.on('disconnect', () => {
            resolve(true);
        })
        connection.connect();
    });
    await expect(promise).resolves.toBeTruthy();
});
