/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { Mqtt5Client, Mqtt5ClientConfig } from './mqtt5';
//import { AwsMqtt5DisconnectReasonCode, AwsMqtt5PacketDisconnect } from "./mqtt5_packet";
import { once } from 'events';

jest.setTimeout(1200000);

/*
async function MakeGoodClient() {
    const client_config : Mqtt5ClientConfig = {
        hostName : "127.0.0.1",
        port : 1883,
    };

    let client : Mqtt5Client = new Mqtt5Client(client_config);

    expect(client).toBeDefined();

    const attemptingConnect = once(client, 'attemptingConnect');
    const connectionSuccess = once(client, 'connectionSuccess');
    //const connectionFailure = once(client, 'connectionFailure');
    const disconnection = once(client, 'disconnection');
    const stopped = once(client, "stopped");


    client.start()

    console.log(await attemptingConnect);
    console.log(await connectionSuccess);

    client.stop();

    console.log(await disconnection);
    console.log(await stopped);
}

test('MQTT5ClientCreateDefault', async () => {

    await MakeGoodClient();

    for (let i = 0; i < 100; i++) {
        let data : Int32Array = new Int32Array(10000000);
        data[0] = 0;
    }
});
*/


async function MakeBadClient1() {
    const client_config : Mqtt5ClientConfig = {
        hostName : "127.0.0.1",
        port : 8883,
    };

    let client : Mqtt5Client = new Mqtt5Client(client_config);

    expect(client).toBeDefined();

    const attemptingConnect = once(client, 'attemptingConnect');
    const connectionFailure = once(client, 'connectionFailure');
    const stopped = once(client, "stopped");


    client.start()

    console.log(await attemptingConnect);
    console.log(await connectionFailure);

    client.stop();

    console.log(await stopped);
}

test('MQTT5ClientCreateDefaultBad1', async () => {

    await MakeBadClient1();

    for (let i = 0; i < 100; i++) {
        let data : Int32Array = new Int32Array(10000000);
        data[0] = 0;
    }
});
