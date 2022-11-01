/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {mqtt5, mqtt5_packet, ICrtError, aws_iot_mqtt5} from "aws-crt";
import {once} from "events";
import {v4 as uuid} from "uuid";

type Args = { [index: string]: any };

const yargs = require('yargs');

yargs.command('*', false, (yargs: any) => {
    yargs.option('endpoint', {
        alias: 'e',
        description: 'Your AWS IoT custom endpoint, not including a port.',
        type: 'string',
        required: true
    })
    .option('cert', {
        alias: 'c',
        description: '<path>: File path to a PEM encoded certificate to use with mTLS.',
        type: 'string',
        required: false
    })
    .option('key', {
        alias: 'k',
        description: '<path>: File path to a PEM encoded private key that matches cert.',
        type: 'string',
        required: false
    })
    .option('region', {
        alias: 'r',
        description: 'AWS region to establish a websocket connection to.  Only required if using websockets and a non-standard endpoint.',
        type: 'string',
        required: false
    })
}, main).parse();

function creatClientConfig(args : any) : mqtt5.Mqtt5ClientConfig {
    let builder : aws_iot_mqtt5.AwsIotMqtt5ClientConfigBuilder | undefined = undefined;

    if (args.key && args.cert) {
        builder = aws_iot_mqtt5.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(
            args.endpoint,
            args.cert,
            args.key
        );
    } else {
        let wsOptions : aws_iot_mqtt5.WebsocketSigv4Config | undefined = undefined;
        if (args.region) {
            wsOptions = { region: args.region };
        }

        builder = aws_iot_mqtt5.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
            args.endpoint,
            // the region extraction logic does not work for gamma endpoint formats so pass in region manually
            wsOptions
        );
    }

    builder.withConnectProperties({
        keepAliveIntervalSeconds: 1200,
        clientId: `client-${uuid()}`,
    });

    return builder.build();
}

function createClient(args: any) : mqtt5.Mqtt5Client {

    let config : mqtt5.Mqtt5ClientConfig = creatClientConfig(args);

    console.log("Creating client for " + config.hostName);
    let client : mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(config);

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

    client.on('connectionFailure', (error: ICrtError, connack?: mqtt5_packet.ConnackPacket) => {
        console.log("Connection failure event: " + error.toString());
        if (connack) {
            console.log ("Connack: " + JSON.stringify(connack));
        }
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

async function runSample(args : any) {

    let client : mqtt5.Mqtt5Client = createClient(args);

    const connectionSuccess = once(client, "connectionSuccess");

    client.start();

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
        payload: "This is a qos 0 payload",
        userProperties: [
            {name: "test", value: "userproperty"}
        ]
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

    const stopped = once(client, "stopped");

    client.stop();

    await stopped;

    client.close();
}

async function main(args : Args){
    // make it wait as long as possible once the promise completes we'll turn it off.
    const timer = setTimeout(() => {}, 2147483647);

    await runSample(args);

    clearTimeout(timer);

    process.exit(0);
}

