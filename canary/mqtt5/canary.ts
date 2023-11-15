/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {ICrtError, mqtt5} from "aws-crt";
import {once} from "events";
import {v4 as uuid} from "uuid";
var weightedRandom = require('weighted-random');

type Args = { [index: string]: any };

const yargs = require('yargs');

yargs.command('*', false, (yargs: any) => {
    yargs.option({
        'duration': {
            description: 'INT: time in seconds to run the canary',
            type: 'number',
            default: 120,
        },
        'endpoint': {
            description: 'STR: endpoint to connect to',
            type: 'string',
            default: 'localhost',
        },
        'port': {
            description: 'number: port to connect to',
            type: 'number',
            default: 1883,
        },
        'tps': {
            description: 'number: transaction per second',
            type: 'number',
            default: 0,
        }
    });
}, main).parse();

let RECEIVED_TOPIC : string = "Canary/Received/Topic";

interface CanaryMqttStatistics {
    clientsUsed: number;
    publishesReceived: number;
    subscribesAttempted: number;
    subscribesSucceeded: number;
    subscribesFailed: number;
    unsubscribesAttempted: number;
    unsubscribesSucceeded: number;
    unsubscribesFailed: number;
    publishesAttempted: number;
    publishesSucceeded: number;
    publishesFailed: number;
    totalOperation: number;
}

interface TestContext {
    duration: number;
    hostname: string;
    port: number;
    tps_sleep_time: number;
}

interface CanaryContext {
    client : mqtt5.Mqtt5Client;

    mqttStats : CanaryMqttStatistics;

    subscriptions: string[];
}

function sleep(millisecond: number) {
    return new Promise((resolve) => setInterval(resolve, millisecond));
}

function createCanaryClient(testContext: TestContext, mqttStats: CanaryMqttStatistics): mqtt5.Mqtt5Client {
    const client_config : mqtt5.Mqtt5ClientConfig = {
        hostName: testContext.hostname,
        port: testContext.port
    };

    let client : mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(client_config);

    client.on('error', (error: ICrtError) => {});
    client.on("messageReceived", (eventData: mqtt5.MessageReceivedEvent): void => {
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
                {topicFilter: RECEIVED_TOPIC, qos: mqtt5.QoS.AtLeastOnce }
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

async function doPublish(context : CanaryContext, qos: mqtt5.QoS) {
    try {
        context.mqttStats.publishesAttempted++;

        await context.client.publish({
            topicName: RECEIVED_TOPIC,
            qos: qos,
            payload: Buffer.alloc(10000),
            retain: false,
            payloadFormat: mqtt5.PayloadFormatIndicator.Utf8,
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

async function runCanaryIteration(testContext: TestContext, endTime: Date, mqttStats: CanaryMqttStatistics) {

    let context : CanaryContext = {
        client : createCanaryClient(testContext, mqttStats),
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
            { topicFilter: RECEIVED_TOPIC, qos: mqtt5.QoS.AtLeastOnce }
        ]
    });

    let currentTime : Date = new Date();
    while (currentTime.getTime() < endTime.getTime()) {
        let index : number = weightedRandom(weightedOperations);

        await (operationTable[index].op)();
        ++context.mqttStats.totalOperation;
        await sleep(testContext.tps_sleep_time);
        currentTime = new Date();
    }

    const stopped = once(context.client, "stopped");

    context.client.stop();

    await stopped;

    context.client.close();
}

async function runCanary(testContext: TestContext, mqttStats: CanaryMqttStatistics) {
    let startTime: Date = new Date();
    let currentTime: Date = startTime;
    let secondsElapsed : number = 0;
    let iteration : number = 0;

    while (secondsElapsed < testContext.duration) {
        let iterationTime: number = Math.min(testContext.duration - secondsElapsed, 60);
        let iterationEnd = new Date(currentTime.getTime() + iterationTime * 1000);
        await runCanaryIteration(testContext, iterationEnd, mqttStats);

        iteration++;
        console.log(`Iteration ${iteration} stats: ${JSON.stringify(mqttStats)}`);

        currentTime = new Date();
        secondsElapsed = (currentTime.getTime() - startTime.getTime()) / 1000;
    }
}

async function main(args : Args){
    let mqttStats : CanaryMqttStatistics = {
        clientsUsed: 0,
        publishesReceived: 0,
        subscribesAttempted: 0,
        subscribesSucceeded: 0,
        subscribesFailed: 0,
        unsubscribesAttempted: 0,
        unsubscribesSucceeded: 0,
        unsubscribesFailed: 0,
        publishesAttempted: 0,
        publishesSucceeded: 0,
        publishesFailed: 0,
        totalOperation: 0,
    };

    let testContext: TestContext = {
        duration: args.duration,
        hostname: args.endpoint,
        port: args.port,
        tps_sleep_time: args.tps == 0 ? 0 : (1000 / args.tps),
    }

    await runCanary(testContext, mqttStats);

    console.log(`Final Stats: ${JSON.stringify(mqttStats)}`);
    console.log(`Operation TPS: ${mqttStats.totalOperation / testContext.duration}`);

    process.exit(0);

}

