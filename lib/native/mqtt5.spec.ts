/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { Mqtt5Client } from './mqtt5';
jest.setTimeout(10000);

test('MQTT5ClientCreateDefault', async () => {
    let client_config = {
        host_name : "127.0.0.1",
        port : 1883,
    };

    let client = new Mqtt5Client(client_config);

    expect(client).toBeDefined();

    client.start();

    await new Promise(resolve => setTimeout(resolve, 2000));

    client.stop();

    await new Promise(resolve => setTimeout(resolve, 2000));
});

test('MQTT5ClientCreateDefaultMemCheck', async () => {
    let client_config = {
        host_name : "127.0.0.1",
        port : 1883,
    };

    let client = new Mqtt5Client(client_config);

    expect(client).toBeDefined();

    client.start();

    await new Promise(resolve => setTimeout(resolve, 2000));

    client.stop();

    await new Promise(resolve => setTimeout(resolve, 2000));
});