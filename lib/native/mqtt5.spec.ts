/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {
    AwsMqtt5ClientOperationStatistics,
    AwsMqtt5Client,
    AwsMqtt5ClientConfig
} from './mqtt5';
import { once } from 'events';
import {
    AwsMqtt5PacketSubscribe,
    AwsMqtt5PacketConnack,
    AwsMqtt5QoS,
    AwsMqtt5PacketPublish,
    AwsMqtt5PacketDisconnect
} from "../common/mqtt5_packet";
import { AwsMqtt5NegotiatedSettings } from "../common/mqtt5";
import {CrtError} from "./error";

jest.setTimeout(1200000);

let connectedCallCount : number = 0;

function WhileConnectedEverySecond() {
    connectedCallCount++;
    console.log('#' + connectedCallCount.toString() + ': I am connected!  Do something.');
}

let disconnectedCallCount : number = 0;

function WhileNotConnectedEverySecond() {
    disconnectedCallCount++;
    console.log('#' + disconnectedCallCount.toString() + ': Woe is me!  I have no connection.');
}

async function MakeGoodClient() {

    const client_config : AwsMqtt5ClientConfig = {
        hostName : "127.0.0.1",
        port : 1883,
    };

    let client : AwsMqtt5Client = new AwsMqtt5Client(client_config);

    client.on("messageReceived", (packet: AwsMqtt5PacketPublish) => {
        if (typeof packet.payload !== 'string') {
            let payloadAsString: string = new TextDecoder().decode(packet.payload);
            console.log('Message received with payload: ' + payloadAsString);
        } else {
            console.log('Message received with payload: ' + packet.payload as string);
        }
    });

    client.on("attemptingConnect", () => {
        console.log('Attempting Connect');
    });

    client.on("connectionFailure", (errorCode: number, connack?: AwsMqtt5PacketConnack) => {
        console.log('connectionFailure: ' + new CrtError(errorCode));
    });

    let serviceTask : NodeJS.Timeout | undefined = undefined;

    client.on("connectionSuccess", async (connack: AwsMqtt5PacketConnack, settings: AwsMqtt5NegotiatedSettings) => {
        console.log('Connected! Transitioning to online mode!');
    });

    client.on("disconnection", (errorCode: number, disconnect?: AwsMqtt5PacketDisconnect) => {
        console.log('Disonnected! Transitioning to offline mode!');
    });

    const stopped = once(client, "stopped");

    let connected = once(client, "connectionSuccess");
    let disconnected = once(client, "disconnection");

    client.start();

    let done = false;
    while (!done) {
        let result = await connected;
        connected = once(client, "connectionSuccess");
        if (serviceTask != undefined) {
            clearInterval(serviceTask);
        }

        let settings : AwsMqtt5NegotiatedSettings = result[1];
        if (!settings.rejoinedSession) {
            let subscribe_minimal : AwsMqtt5PacketSubscribe = {
                subscriptions: [
                    {
                        topicFilter : "derp/topic",
                        qos : AwsMqtt5QoS.AtLeastOnce
                    }
                ]
            };

            let stats : AwsMqtt5ClientOperationStatistics = client.getQueueStatistics();
            console.log('Post subscribe stats: ' + stats.toString());

            await client.subscribe(subscribe_minimal);
        }

        serviceTask = setInterval(WhileConnectedEverySecond, 1000);

        await disconnected;
        disconnected = once(client, "disconnection");

        if (serviceTask != undefined) {
            clearInterval(serviceTask);
        }
        serviceTask = setInterval(WhileNotConnectedEverySecond, 1000);
    }

    await stopped;
}

test('MQTT5ClientCreateDefault', async () => {

    await MakeGoodClient();

    for (let i = 0; i < 100; i++) {
        let data : Int32Array = new Int32Array(10000000);
        data[0] = 0;
    }
});


/*
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
*/