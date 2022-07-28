/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {mqtt5, mqtt5_packet} from "aws-crt";
import {once} from "events";
import {ICrtError} from "../../../dist.browser/common/error";

type Args = { [index: string]: any };

const yargs = require('yargs');

yargs.command('*', false, (yargs: any) => {
}, main).parse();

function createClient() : mqtt5.Mqtt5Client {
    const client_config : mqtt5.Mqtt5ClientConfig = {
        hostName : "127.0.0.1",
        port : 1883
    };

    let client : mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(client_config);

    client.on('error', (error: ICrtError) => {
        console.log("Error event: " + error.toString());
    });

    client.on("messageReceived",(message: mqtt5_packet.PublishPacket) : void => {
        console.log("Message Received event: " + JSON.stringify(message));
    } );

    client.on('attemptingConnect', () => {
        console.log("Attempting Connect event");
    });

    client.on('connectionSuccess', (connack: mqtt5_packet.ConnackPacket, settings: mqtt5.NegotiatedSettings) => {
        console.log("Connection Success event");
        console.log ("Connack: " + JSON.stringify(connack));
        console.log ("Settings: " + JSON.stringify(settings));
    });

    client.on('connectionFailure', (error: ICrtError) => {
        console.log("Connection failure event: " + error.toString());
    });

    client.on('disconnection', (error: ICrtError, disconnect?: mqtt5_packet.DisconnectPacket) => {
        console.log("Disconnection event: " + error.toString());
        if (disconnect !== undefined) {
            console.log('Disconnect packet: ' + JSON.stringify(disconnect));
        }
    });

    client.on('stopped', () => {
        console.log("Stopped event");
    });

    return client;
}

async function testSuccessfulConnection() {

    let client : mqtt5.Mqtt5Client = createClient();

    const attemptingConnect = once(client, "attemptingConnect");
    const connectionSuccess = once(client, "connectionSuccess");

    client.start();

    await attemptingConnect;
    await connectionSuccess;

    const suback = await client.subscribe({
        subscriptions: [
            { qos: mqtt5_packet.QoS.AtLeastOnce, topicFilter: "hello/world/qos1" },
            { qos: mqtt5_packet.QoS.AtMostOnce, topicFilter: "hello/world/qos0" }
        ]
    });
    console.log('Suback result: ' + JSON.stringify(suback));

    const qos0PublishResult = await client.publish({
        qos: mqtt5_packet.QoS.AtMostOnce,
        topicName: "hello/world/qos0",
        payload: "This is a qos 0 payload"
    });
    console.log('QoS 0 Publish result: ' + JSON.stringify(qos0PublishResult));

    const qos1PublishResult = await client.publish({
        qos: mqtt5_packet.QoS.AtLeastOnce,
        topicName: "hello/world/qos1",
        payload: "This is a qos 1 payload"
    });
    console.log('QoS 1 Publish result: ' + JSON.stringify(qos1PublishResult));

    let unsuback = await client.unsubscribe({
        topicFilters: [
            "hello/world/qos1"
        ]
    });
    console.log('Unsuback result: ' + JSON.stringify(unsuback));

    const disconnection = once(client, "disconnection");
    const stopped = once(client, "stopped");

    client.stop();

    await disconnection;
    await stopped;

    client.close();
}

async function main(args : Args){
    //io.enable_logging(io.LogLevel.TRACE);

    // make it wait as long as possible once the promise completes we'll turn it off.
    const timer = setTimeout(() => {}, 2147483647);

    await testSuccessfulConnection();

    for (let i = 0; i < 100; i++) {
        let data : Int32Array = new Int32Array(10000000);
        data[0] = 0;
    }

    console.log('Leaving');

    clearTimeout(timer);
}

