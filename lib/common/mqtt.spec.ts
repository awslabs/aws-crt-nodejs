/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { v4 as uuid } from 'uuid';

import { ClientBootstrap } from '@awscrt/io';
import { MqttClient, MqttClientConnection, QoS, MqttWill, Payload } from '@awscrt/mqtt';
import { AwsIotMqttConnectionConfigBuilder } from '@awscrt/aws_iot';
import { Config, fetch_credentials } from '@test/credentials';
import { fromUtf8 } from '@aws-sdk/util-utf8-browser';
import {once} from "events";

jest.setTimeout(10000);

async function makeConnection(will?: MqttWill) : Promise<MqttClientConnection> {
    return new Promise<MqttClientConnection>(async (resolve, reject) => {
        try {
            let aws_opts: Config = await fetch_credentials();

            const builder = AwsIotMqttConnectionConfigBuilder.new_mtls_builder(aws_opts.certificate, aws_opts.private_key)
                .with_clean_session(true)
                .with_client_id(`node-mqtt-unit-test-${uuid()}`)
                .with_endpoint(aws_opts.endpoint)
                .with_credentials(Config.region, aws_opts.access_key, aws_opts.secret_key, aws_opts.session_token)
                .with_ping_timeout_ms(5000);

            if (will !== undefined) {
                builder.with_will(will);
            }

            const config = builder.build();

            const client = new MqttClient(new ClientBootstrap());
            const connection = client.new_connection(config);
            resolve(connection);
        } catch (err) {
            reject(err);
        }
    });
}

test('MQTT Connect/Disconnect', async () => {
    const connection = await makeConnection();

    let onConnect = once(connection, 'connect');
    let onDisconnect = once(connection, 'disconnect');

    await connection.connect();

    let connectResult = (await onConnect)[0];
    expect(connectResult).toBeFalsy(); /* session present */

    await connection.disconnect();
    await onDisconnect;
});

test('MQTT Pub/Sub', async () => {
    const connection = await makeConnection();

    let onConnect = once(connection, 'connect');
    let onDisconnect = once(connection, 'disconnect');

    await connection.connect();

    let connectResult = (await onConnect)[0];
    expect(connectResult).toBeFalsy(); /* session present */

    const test_topic = `/test/me/senpai/${uuid()}`;
    const test_payload = 'NOTICE ME';

    var resolvePromise: (value: void | PromiseLike<void>) => void;
    let messageReceivedPromise = new Promise<void>( (resolve, reject) => { resolvePromise = resolve; });

    const sub = connection.subscribe(test_topic, QoS.AtLeastOnce, async (topic, payload, dup, qos, retain) => {
        expect(topic).toEqual(test_topic);
        const payload_str = (new TextDecoder()).decode(new Uint8Array(payload));
        expect(payload_str).toEqual(test_payload);
        expect(qos).toEqual(QoS.AtLeastOnce);
        expect(retain).toBeFalsy();
        resolvePromise();
    });
    await expect(sub).resolves.toBeTruthy();

    const publishResult = connection.publish(test_topic, test_payload, QoS.AtLeastOnce);
    await expect(publishResult).resolves.toBeTruthy();

    await messageReceivedPromise;

    const unsubscribed = connection.unsubscribe(test_topic);
    await expect(unsubscribed).resolves.toHaveProperty('packet_id');

    await connection.disconnect();
    await onDisconnect;
});

test('MQTT Will', async () => {
    /* TODO: this doesn't really test anything.  Unfortunately, there's no easy way to break the
    *   MQTT311 connection without it sending a client-side DISCONNECT packet which removes the will. It's not
    *   impossible but would require changes to the C API as well as the bindings to add a path that skips the
    *   DISCONNECT packet, which is far beyond the scope of refactoring these tests to be more procedural and reliable.
    */
    const connection = await makeConnection(new MqttWill(
        '/last/will/and/testament',
        QoS.AtLeastOnce,
        'AVENGE ME'
    ));

    let onConnect = once(connection, 'connect');
    let onDisconnect = once(connection, 'disconnect');

    await connection.connect();

    let connectResult = (await onConnect)[0];
    expect(connectResult).toBeFalsy(); /* session present */

    await connection.disconnect();
    await onDisconnect;
});

test('MQTT On Any Publish', async () => {
    const connection = await makeConnection();

    let onConnect = once(connection, 'connect');
    let onDisconnect = once(connection, 'disconnect');

    await connection.connect();

    let connectResult = (await onConnect)[0];
    expect(connectResult).toBeFalsy(); /* session present */

    const test_topic = `/test/me/senpai/${uuid()}`;
    const test_payload = 'NOTICE ME';

    let onMessage = once(connection, 'message');

    await connection.subscribe(test_topic, QoS.AtLeastOnce);

    await connection.publish(test_topic, test_payload, QoS.AtLeastOnce);

    let messageReceivedArgs = (await onMessage);
    let messageReceivedTopic = messageReceivedArgs[0];
    let messageReceivedPayload = messageReceivedArgs[1];
    let messageReceivedQos = messageReceivedArgs[3];
    let messageReceivedRetain = messageReceivedArgs[4];

    expect(messageReceivedTopic).toEqual(test_topic);
    expect(messageReceivedPayload).toBeDefined();
    const payload_str = (new TextDecoder()).decode(new Uint8Array(messageReceivedPayload));
    expect(payload_str).toEqual(test_payload);
    expect(messageReceivedQos).toEqual(QoS.AtLeastOnce);
    expect(messageReceivedRetain).toBeFalsy();

    await connection.disconnect();
    await onDisconnect;
});

test('MQTT payload types', async () => {
    const connection = await makeConnection();

    let onDisconnect = once(connection, 'disconnect');

    await connection.connect();

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
    };

    // as messages are received, delete items.
    // when this object is empty all expected messages have been received.
    let expecting: { [key: string]: ArrayBuffer } = {}
    for (const topic in tests) {
        expecting[topic] = tests[topic].recv;
    }

    var resolveMessagesReceivedPromise: (value: void | PromiseLike<void>) => void;
    let messagesReceivedPromise = new Promise<void>( (resolve, reject) => {
        resolveMessagesReceivedPromise = resolve;
    });

    connection.on('message', async (topic, payload, dup, qos, retain) => {
        // QoS1 message might arrive multiple times.
        // so it's no big deal if we've already seen this topic
        if (!(topic in expecting)) {
            return;
        }

        expect(payload).toEqual(expecting[topic]);
        delete expecting[topic];

        if (Object.keys(expecting).length == 0) {
            resolveMessagesReceivedPromise();
        }
    });

    await connection.subscribe(`/test/types/${id}/#`, QoS.AtLeastOnce);

    for (const topic in tests) {
        await connection.publish(topic, tests[topic].send, QoS.AtLeastOnce);
    }

    await messagesReceivedPromise;

    await connection.disconnect();
    await onDisconnect;
});
