/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { v4 as uuid } from 'uuid';

import { ClientBootstrap } from '@awscrt/io';
import { MqttClient, QoS, MqttWill } from '@awscrt/mqtt';
import { AwsIotMqttConnectionConfigBuilder } from '@awscrt/aws_iot';
import { Config, fetch_credentials } from '@test/credentials';

jest.setTimeout(10000);

test('MQTT Connect/Disconnect', async (done) => {
    let aws_opts: Config;
    try {
        aws_opts = await fetch_credentials();
    } catch (err) {
        done(err);
        return;
    }

    const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${uuid()}`)
        .with_endpoint(aws_opts.endpoint)
        .with_credentials(Config.region, aws_opts.access_key, aws_opts.secret_key, aws_opts.session_token)
        .with_timeout_ms(5000)
        .build()
    const client = new MqttClient(new ClientBootstrap());
    const connection = client.new_connection(config);
    const promise = new Promise(async (resolve, reject) => {
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
    done();
});

test('MQTT Pub/Sub', async (done) => {

    let aws_opts: Config;
    try {
        aws_opts = await fetch_credentials();
    } catch (err) {
        done(err);
        return;
    }

    const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${uuid()}`)
        .with_endpoint(aws_opts.endpoint)
        .with_credentials(Config.region, aws_opts.access_key, aws_opts.secret_key, aws_opts.session_token)
        .with_timeout_ms(5000)
        .build()
    const client = new MqttClient(new ClientBootstrap());
    const connection = client.new_connection(config);
    const promise = new Promise(async (resolve, reject) => {
        connection.on('connect', async (session_present) => {
            expect(session_present).toBeFalsy();
            const test_topic = '/test/me/senpai';
            const test_payload = 'NOTICE ME';
            const sub = connection.subscribe(test_topic, QoS.AtLeastOnce, async (topic, payload, dup, qos, retain) => {
                expect(topic).toEqual(test_topic);
                const payload_str = payload.toString('utf8');
                expect(payload_str).toEqual(test_payload);
                expect(qos).toEqual(QoS.AtLeastOnce);
                expect(retain).toBeFalsy();
                resolve(true);

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
    done();
});

test('MQTT Will', async (done) => {
    let aws_opts: Config;
    try {
        aws_opts = await fetch_credentials();
    } catch (err) {
        done(err);
        return;
    }

    const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${uuid()}`)
        .with_endpoint(aws_opts.endpoint)
        .with_credentials(Config.region, aws_opts.access_key, aws_opts.secret_key, aws_opts.session_token)
        .with_timeout_ms(5000)
        .with_will(new MqttWill(
            '/last/will/and/testament',
            QoS.AtLeastOnce,
            'AVENGE ME'
        ))
        .build()
    const client = new MqttClient(new ClientBootstrap());
    const connection = client.new_connection(config);
    const promise = new Promise(async (resolve, reject) => {
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
    done();
});

test('MQTT On Any Publish', async (done) => {
    let aws_opts: Config;
    try {
        aws_opts = await fetch_credentials();
    } catch (err) {
        done(err);
        return;
    }

    const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${uuid()}`)
        .with_endpoint(aws_opts.endpoint)
        .with_credentials(Config.region, aws_opts.access_key, aws_opts.secret_key, aws_opts.session_token)
        .with_timeout_ms(5000)
        .build()
    const client = new MqttClient(new ClientBootstrap());
    const connection = client.new_connection(config);
    const promise = new Promise(async (resolve, reject) => {
        const test_topic = '/test/me/senpai';
        const test_payload = 'NOTICE ME';

        connection.on('message', async (topic, payload, dup, qos, retain) => {
            expect(topic).toEqual(test_topic);
            expect(payload).toBeDefined();
            const payload_str = payload.toString('utf8')
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
    done();
});
