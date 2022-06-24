/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {
    Mqtt5Client,
    Mqtt5ClientConfig
} from './mqtt5';
//import { AwsMqtt5DisconnectReasonCode, AwsMqtt5PacketDisconnect } from "./mqtt5_packet";
import { once } from 'events';
import {
    AwsMqtt5PacketSubscribe,
    AwsMqtt5QoS,
    AwsMqtt5RetainHandlingType,
    AwsMqtt5PacketUnsubscribe,
    AwsMqtt5PacketPublish,
    AwsMqtt5PayloadFormatIndicator
} from "./mqtt5_packet";

jest.setTimeout(1200000);


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

    console.log('Waiting on connection attempt!');
    console.log(await attemptingConnect);
    console.log('Waiting on connection result!');
    console.log(await connectionSuccess);

    let subscribe_operation : AwsMqtt5PacketSubscribe = {
        subscriptions: [
            {
                topicFilter : "derp/topic",
                qos : AwsMqtt5QoS.AtLeastOnce,
                noLocal : true,
                retainAsPublished: true,
                retainHandlingType: AwsMqtt5RetainHandlingType.SendOnSubscribeIfNew
            }
        ],
        subscriptionIdentifier: 1,
        userProperties: [
            {
                name: "subscribeName1",
                value: "subscribeValue1"
            }
        ]
    };

    console.log(await client.subscribe(subscribe_operation));

    let subscribe_minimal : AwsMqtt5PacketSubscribe = {
        subscriptions: [
            {
                topicFilter : "derp/topic2",
                qos : AwsMqtt5QoS.AtLeastOnce
            }
        ]
    };

    console.log(await client.subscribe(subscribe_minimal));

    let unsubscribe_op : AwsMqtt5PacketUnsubscribe = {
        topicFilters: [
            "Not/Subscribed",
            "derp/topic2",
            "Also/Not/Subscribed"
        ],
        userProperties: [
            {
                name: "subscribeName1",
                value: "subscribeValue1"
            }
        ]
    };

    console.log(await client.unsubscribe(unsubscribe_op));

    let publish_op : AwsMqtt5PacketPublish = {
        topic: "derp/topic",
        payload: "This is a message payload",
        qos: AwsMqtt5QoS.AtLeastOnce,
        retain: true,
        payloadFormat: AwsMqtt5PayloadFormatIndicator.Utf8,
        messageExpiryIntervalSeconds: 3600,
        responseTopic: "DontTalkToMe/Again",
        contentType: "not-json",
        userProperties: [
            {
                name: "publishName1",
                value: "publishValue1"
            }
        ]
    }

    console.log(await client.publish(publish_op));

    client.stop();

    console.log('Waiting on disconnection!');
    console.log(await disconnection);
    console.log('Waiting on stopped!');
    console.log(await stopped);
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