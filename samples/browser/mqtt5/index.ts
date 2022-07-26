/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {ICrtError, mqtt5, mqtt5_packet} from "aws-crt";
import {once} from "events";
import jquery = require("jquery");

const $: JQueryStatic = jquery;

function log(msg: string) {
    let now = new Date();
    $('#console').append(`<pre>${now.toString()}: ${msg}</pre>`);
}

function createClient() : mqtt5.Mqtt5Client {
    const client_config : mqtt5.Mqtt5ClientConfig = {
        hostName : "localhost",
        port : 8080,
        websocket : {
            protocol: "ws"
        }
    }

    let client : mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(client_config);

    client.on('error', (error: ICrtError) => {
        log("Error event: " + error.toString());
    });

    client.on("messageReceived",(message: mqtt5_packet.PublishPacket) : void => {
        log("Message Received event: " + JSON.stringify(message));
    } );

    client.on('attemptingConnect', () => {
        log("Attempting Connect event");
    });

    client.on('connectionSuccess', (connack: mqtt5_packet.ConnackPacket, settings: mqtt5.NegotiatedSettings) => {
        log("Connection Success event");
        log ("Connack: " + JSON.stringify(connack));
        log ("Settings: " + JSON.stringify(settings));
    });

    client.on('connectionFailure', (error: ICrtError) => {
        log("Connection failure event: " + error.toString());
    });

    client.on('disconnection', (error: ICrtError, disconnect?: mqtt5_packet.DisconnectPacket) => {
        log("Disconnection event: " + error.toString());
        if (disconnect !== undefined) {
            log('Disconnect pacaket: ' + JSON.stringify(disconnect));
        }
    });

    client.on('stopped', () => {
        log("Stopped event");
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
    log('Suback result: ' + JSON.stringify(suback));

    const qos0PublishResult = await client.publish({
        qos: mqtt5_packet.QoS.AtMostOnce,
        topicName: "hello/world/qos0",
        payload: "This is a qos 0 payload"
    });
    log('QoS 0 Publish result: ' + JSON.stringify(qos0PublishResult));

    const qos1PublishResult = await client.publish({
        qos: mqtt5_packet.QoS.AtLeastOnce,
        topicName: "hello/world/qos1",
        payload: "This is a qos 1 payload"
    });
    log('QoS 1 Publish result: ' + JSON.stringify(qos1PublishResult));

    let unsuback = await client.unsubscribe({
        topicFilters: [
            "hello/world/qos1"
        ]
    });
    log('Unsuback result: ' + JSON.stringify(unsuback));

    const disconnection = once(client, "disconnection");
    const stopped = once(client, "stopped");

    client.stop();

    await disconnection;
    await stopped;
}

async function main(){

    await testSuccessfulConnection();

    log('Leaving');
}

$(document).ready(() => {
    main();
});
