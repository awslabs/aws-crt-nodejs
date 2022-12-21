/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {ICrtError, mqtt5, mqtt5_packet} from "aws-crt";
import {once} from "events";
import {v4 as uuid} from "uuid";
var weightedRandom = require('weighted-random');

type Args = { [index: string]: any };

const yargs = require('yargs');

yargs.command('*', false, (yargs: any) => {
    yargs.option('duration', {
        description: 'INT: time in seconds to run the canary',
        type: 'number',
        default: 3600,
    })
}, main).parse();

let RECEIVED_TOPIC : string = "Canary/Received/Topic";

interface CanaryMqttStatistics {
    clientsUsed : number;
    publishesReceived: number;
    subscribesAttempted : number;
    subscribesSucceeded : number;
    subscribesFailed : number;
    unsubscribesAttempted : number;
    unsubscribesSucceeded : number;
    unsubscribesFailed : number;
    publishesAttempted : number;
    publishesSucceeded : number;
    publishesFailed : number;
}

interface CanaryContext {
    client : mqtt5.Mqtt5Client;

    mqttStats : CanaryMqttStatistics;

    subscriptions: string[];
}

function createCanaryClient(mqttStats : CanaryMqttStatistics) : mqtt5.Mqtt5Client {
    const client_config : mqtt5.Mqtt5ClientConfig = {
        hostName : process.env.AWS_TEST_MQTT5_DIRECT_MQTT_HOST ?? "localhost",
        port : parseInt(process.env.AWS_TEST_MQTT5_DIRECT_MQTT_PORT ?? "0")
    };

    let client : mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(client_config);

    client.on('error', (error: ICrtError) => {});
    client.on("messageReceived",(message: mqtt5_packet.PublishPacket) : void => {
        mqttStats.publishesReceived++;
    });

    return client;
}

async function doSubscribe(context : CanaryContext) {
    let topicFilter: string = `Mqtt5/Canary/RandomSubscribe${uuid()}`;

    try {
        context.mqttStats.subscribesAttempted++;

        await context.client.subscribe({
            subscriptions: [
                {topicFilter: RECEIVED_TOPIC, qos: mqtt5_packet.QoS.AtLeastOnce}
            ]
        });

        context.subscriptions.push(topicFilter);
        context.mqttStats.subscribesSucceeded++;
    } catch (err) {
        context.mqttStats.subscribesFailed++;
        context.subscriptions.filter(entry => entry !== topicFilter);
    }
}

async function doUnsubscribe(context : CanaryContext) {
    if (context.subscriptions.length == 0) {
        return;
    }

    let topicFilter: string = context.subscriptions.pop() ?? "canthappen";

    try {
        context.mqttStats.unsubscribesAttempted++;

        await context.client.unsubscribe({
            topicFilters: [ topicFilter ]
        });

        context.mqttStats.unsubscribesSucceeded++;
    } catch (err) {
        context.mqttStats.unsubscribesFailed++;
        context.subscriptions.push(topicFilter);
    }
}

async function doPublish(context : CanaryContext, qos: mqtt5_packet.QoS) {
    try {
        context.mqttStats.publishesAttempted++;

        await context.client.publish({
            topicName: RECEIVED_TOPIC,
            qos: qos,
            payload: Buffer.alloc(10000),
            retain: false,
            payloadFormat: mqtt5_packet.PayloadFormatIndicator.Utf8,
            messageExpiryIntervalSeconds: 60,
            responseTopic: "talk/to/me",
            correlationData: Buffer.alloc(3000),
            contentType: "not-json",
            userProperties: [
                {name: "name", value: "value"}
            ]
        });

        context.mqttStats.publishesSucceeded++;
    } catch (err) {
        context.mqttStats.publishesFailed++;
    }
}

async function runCanaryIteration(endTime: Date, mqttStats : CanaryMqttStatistics) {

    let context : CanaryContext = {
        client : createCanaryClient(mqttStats),
        mqttStats : mqttStats,
        subscriptions : []
    };

    mqttStats.clientsUsed++;

    let operationTable = [
        { weight : 1, op: async () => { await doSubscribe(context); }},
        { weight : 1, op: async () => { await doUnsubscribe(context); }},
        { weight : 20, op: async () => { await doPublish(context, mqtt5_packet.QoS.AtMostOnce); }},
        { weight : 20, op: async () => { await doPublish(context, mqtt5_packet.QoS.AtLeastOnce); }}
    ];

    var weightedOperations = operationTable.map(function (operation) {
        return operation.weight;
    });

    const connectionSuccess = once(context.client, "connectionSuccess");

    context.client.start();

    await connectionSuccess;

    await context.client.subscribe({
        subscriptions: [
            { topicFilter: RECEIVED_TOPIC, qos: mqtt5_packet.QoS.AtLeastOnce }
        ]
    });

    let currentTime : Date = new Date();
    while (currentTime.getTime() < endTime.getTime()) {
        let index : number = weightedRandom(weightedOperations);

        await (operationTable[index].op)();

        currentTime = new Date();
    }

    const stopped = once(context.client, "stopped");

    context.client.stop();

    await stopped;

    context.client.close();
}

async function runCanary(durationInSeconds: number, mqttStats : CanaryMqttStatistics) {
    let startTime: Date = new Date();
    let currentTime: Date = startTime;
    let secondsElapsed : number = 0;
    let iteration : number = 0;

    while (secondsElapsed < durationInSeconds) {
        let iterationTime : number = Math.min(durationInSeconds - secondsElapsed, 60);
        let iterationEnd = new Date(currentTime.getTime() + iterationTime * 1000);
        await runCanaryIteration(iterationEnd, mqttStats);

        iteration++;
        console.log(`Iteration ${iteration} stats: ${JSON.stringify(mqttStats)}`);

        currentTime = new Date();
        secondsElapsed = (currentTime.getTime() - startTime.getTime()) / 1000;
    }
}

async function main(args : Args){
    let mqttStats : CanaryMqttStatistics = {
        clientsUsed : 0,
        publishesReceived: 0,
        subscribesAttempted : 0,
        subscribesSucceeded : 0,
        subscribesFailed : 0,
        unsubscribesAttempted : 0,
        unsubscribesSucceeded : 0,
        unsubscribesFailed : 0,
        publishesAttempted : 0,
        publishesSucceeded : 0,
        publishesFailed : 0
    };

    await runCanary(args.duration, mqttStats);

    console.log(`Final Stats: ${JSON.stringify(mqttStats)}`)

    process.exit(0);

}

