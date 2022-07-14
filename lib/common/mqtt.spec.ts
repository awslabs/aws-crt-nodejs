/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { v4 as uuid } from 'uuid';

import { ClientBootstrap } from '@awscrt/io';
import { MqttClient, QoS, MqttWill, Payload } from '@awscrt/mqtt';
import { AwsIotMqttConnectionConfigBuilder } from '@awscrt/aws_iot';
// Ignore TextEncoder not being used so we can import the polyfills.
// @ts-ignore
import { TextDecoder, TextEncoder } from '@awscrt/polyfills';
import { Config, fetch_credentials } from '@test/credentials';
import { fromUtf8 } from '@aws-sdk/util-utf8-browser';

jest.setTimeout(10000);

test('MQTT Connect/Disconnect', async () => {
    const promise = new Promise(async (resolve, reject) => {
        let aws_opts: Config;
        try {
            aws_opts = await fetch_credentials();
        } catch (err) {
            reject(err);
            return;
        }

        const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
            .with_clean_session(true)
            .with_client_id(`node-mqtt-unit-test-${uuid()}`)
            .with_endpoint(aws_opts.endpoint)
            .with_credentials(Config.region, aws_opts.access_key, aws_opts.secret_key, aws_opts.session_token)
            .with_ping_timeout_ms(5000)
            .build()
        const client = new MqttClient(new ClientBootstrap());
        const connection = client.new_connection(config);

        connection.on('connect', async (session_present) => {
            expect(session_present).toBeFalsy();

            const disconnected = connection.disconnect();
            await expect(disconnected).resolves.toBeUndefined();
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

test('MQTT Pub/Sub', async () => {
    const promise = new Promise(async (resolve, reject) => {
        let aws_opts: Config;
        try {
            aws_opts = await fetch_credentials();
        } catch (err) {
            reject(err);
            return;
        }

        const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
            .with_clean_session(true)
            .with_client_id(`node-mqtt-unit-test-${uuid()}`)
            .with_endpoint(aws_opts.endpoint)
            .with_credentials(Config.region, aws_opts.access_key, aws_opts.secret_key, aws_opts.session_token)
            .with_ping_timeout_ms(5000)
            .build()
        const client = new MqttClient(new ClientBootstrap());
        const connection = client.new_connection(config);

        connection.on('connect', async (session_present) => {
            expect(session_present).toBeFalsy();
            const test_topic = `/test/me/senpai/${uuid()}`;
            const test_payload = 'NOTICE ME';
            const sub = connection.subscribe(test_topic, QoS.AtLeastOnce, async (topic, payload, dup, qos, retain) => {
                expect(topic).toEqual(test_topic);
                const payload_str = (new TextDecoder()).decode(new Uint8Array(payload));
                expect(payload_str).toEqual(test_payload);
                expect(qos).toEqual(QoS.AtLeastOnce);
                expect(retain).toBeFalsy();
                resolve(true);

                const unsubscribed = connection.unsubscribe(test_topic);
                await expect(unsubscribed).resolves.toHaveProperty('packet_id');

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

test('MQTT Will', async () => {
    const promise = new Promise(async (resolve, reject) => {
        let aws_opts: Config;
        try {
            aws_opts = await fetch_credentials();
        } catch (err) {
            reject(err);
            return;
        }

        const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
            .with_clean_session(true)
            .with_client_id(`node-mqtt-unit-test-${uuid()}`)
            .with_endpoint(aws_opts.endpoint)
            .with_credentials(Config.region, aws_opts.access_key, aws_opts.secret_key, aws_opts.session_token)
            .with_ping_timeout_ms(5000)
            .with_will(new MqttWill(
                '/last/will/and/testament',
                QoS.AtLeastOnce,
                'AVENGE ME'
            ))
            .build()
        const client = new MqttClient(new ClientBootstrap());
        const connection = client.new_connection(config);

        connection.on('connect', async (session_present) => {
            expect(session_present).toBeFalsy();
            const disconnected = connection.disconnect();
            await expect(disconnected).resolves.toBeUndefined();
        });
        connection.on('error', (error) => {
            reject(error)
        })
        connection.on('disconnect', () => {
            resolve(true);
        })
        const connected = connection.connect();
        await expect(connected).resolves.toBeDefined();
    });
    await expect(promise).resolves.toBeTruthy();
});

test('MQTT On Any Publish', async () => {
    const promise = new Promise(async (resolve, reject) => {
        let aws_opts: Config;
        try {
            aws_opts = await fetch_credentials();
        } catch (err) {
            reject(err);
            return;
        }

        const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
            .with_clean_session(true)
            .with_client_id(`node-mqtt-unit-test-${uuid()}`)
            .with_endpoint(aws_opts.endpoint)
            .with_credentials(Config.region, aws_opts.access_key, aws_opts.secret_key, aws_opts.session_token)
            .with_ping_timeout_ms(5000)
            .build()
        const client = new MqttClient(new ClientBootstrap());
        const connection = client.new_connection(config);

        const test_topic = `/test/me/senpai/${uuid()}`;
        const test_payload = 'NOTICE ME';

        connection.on('message', async (topic, payload, dup, qos, retain) => {
            expect(topic).toEqual(test_topic);
            expect(payload).toBeDefined();
            const payload_str = (new TextDecoder()).decode(new Uint8Array(payload));
            expect(payload_str).toEqual(test_payload);
            expect(qos).toEqual(QoS.AtLeastOnce);
            expect(retain).toBeFalsy();

            resolve(true);

            const disconnected = connection.disconnect();
            await expect(disconnected).resolves.toBeUndefined();
        });
        connection.on('connect', (session_present) => {
            expect(session_present).toBeFalsy();
        });
        connection.on('error', (error) => {
            reject(error);
        });
        const connected = connection.connect();
        await expect(connected).resolves.toBeDefined();

        // have to subscribe or else the broker won't send us the message
        // Note that there is no handler, 'message' handler above is the
        // global message handler
        const sub = connection.subscribe(test_topic, QoS.AtLeastOnce);
        await expect(sub).resolves.toBeTruthy();

        const pub = connection.publish(test_topic, test_payload, QoS.AtLeastOnce);
        await expect(pub).resolves.toBeTruthy();
    });
    await expect(promise).resolves.toBeTruthy();
});

test('MQTT payload types', async () => {
    const promise = new Promise(async (resolve, reject) => {
        let aws_opts: Config;
        try {
            aws_opts = await fetch_credentials();
        } catch (err) {
            reject(err);
            return;
        }

        const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
            .with_clean_session(true)
            .with_client_id(`node-mqtt-unit-test-${uuid()}`)
            .with_endpoint(aws_opts.endpoint)
            .with_credentials(Config.region, aws_opts.access_key, aws_opts.secret_key, aws_opts.session_token)
            .with_ping_timeout_ms(5000)
            .build()
        const client = new MqttClient(new ClientBootstrap());
        const connection = client.new_connection(config);
        const id = uuid();

        const tests: { [key: string]: { send: Payload, recv: ArrayBuffer } } = {
            [`/test/types/${id}/string`]: {
                send: 'utf-8 👁👄👁 time',
                recv: fromUtf8('utf-8 👁👄👁 time').buffer,
            },
            [`/test/types/${id}/dataview`]: {
                send: new DataView(fromUtf8('I was a DataView').buffer),
                recv: fromUtf8('I was a DataView').buffer,
            },
            [`/test/types/${id}/uint8array`]: {
                // note: sending partial view of a larger buffer
                send: new Uint8Array(new Uint8Array([0, 1, 2, 3, 4, 5, 6]).buffer, 2, 3),
                recv: new Uint8Array([2, 3, 4]).buffer,
            },
            [`/test/types/${id}/arraybuffer`]: {
                send: new Uint8Array([0, 255, 255, 255, 255, 255, 1]).buffer,
                recv: new Uint8Array([0, 255, 255, 255, 255, 255, 1]).buffer,
            },
            [`/test/types/${id}/json`]: {
                send: { I: "was JSON" },
                recv: fromUtf8('{"I": "was JSON"}').buffer,
            },
        }

        // as messages are received, delete items.
        // when this object is empty all expected messages have been received.
        let expecting: { [key: string]: ArrayBuffer } = {}
        for (const topic in tests) {
            expecting[topic] = tests[topic].recv;
        }

        connection.on('message', async (topic, payload, dup, qos, retain) => {
            // QoS1 message might arrive multiple times.
            // so it's no big deal if we've already seen this topic
            if (!(topic in expecting)) {
                return;
            }

            expect(payload).toEqual(expecting[topic]);
            delete expecting[topic];

            if (Object.keys(expecting).length == 0) {
                resolve(true);

                const disconnected = connection.disconnect();
                await expect(disconnected).resolves.toBeUndefined();
            }
        });

        connection.on('error', (error) => {
            reject(error);
        });
        const connected = connection.connect();
        await expect(connected).resolves.toBeDefined();

        // Subscribe with wildcard
        const sub = connection.subscribe(`/test/types/${id}/#`, QoS.AtLeastOnce);
        await expect(sub).resolves.toBeTruthy();

        for (const topic in tests) {
            const pub = connection.publish(topic, tests[topic].send, QoS.AtLeastOnce);
            await expect(pub).resolves.toBeTruthy();
        }
    });
    await expect(promise).resolves.toBeTruthy();
});
