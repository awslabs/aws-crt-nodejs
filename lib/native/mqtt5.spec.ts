/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { Mqtt5Client } from './mqtt5';
jest.setTimeout(10000);

test('MQTT5ClientCreateDefault', async () => {
    let client_config = {
        host_name : "127.0.0.1",
        port : 80,
    };

    let client = new Mqtt5Client(client_config);

    expect(client).toBeDefined();
});
