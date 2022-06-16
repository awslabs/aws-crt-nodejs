/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { Mqtt5Client, Mqtt5ClientConfig } from './mqtt5';
import { AwsMqtt5DisconnectReasonCode, AwsMqtt5PacketDisconnect } from "./mqtt5_packet";

jest.setTimeout(10000);

test('MQTT5ClientCreateDefault', async () => {
    let client_config : Mqtt5ClientConfig = {
        host_name : "127.0.0.1",
        port : 1883,
    };

    let client : Mqtt5Client = new Mqtt5Client(client_config);

    expect(client).toBeDefined();

    client.start();

    await new Promise(resolve => setTimeout(resolve, 2000));

    let disconnect_test : AwsMqtt5PacketDisconnect = {
        reason_code : AwsMqtt5DisconnectReasonCode.DisconnectWithWillMessage,
        reason_string : "Derp error",
        user_properties : [
            {
                "name" : "name1",
                "value" : "value1"
            },
            {
                "name" : "name2",
                "value" : "value2"
            }
        ]
    }
    client.stop(disconnect_test);

    await new Promise(resolve => setTimeout(resolve, 2000));
});

