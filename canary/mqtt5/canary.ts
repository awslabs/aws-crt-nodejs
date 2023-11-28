/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {ICrtError, mqtt5} from "aws-crt";
import {once} from "events";
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
            description: 'INT: port to connect to',
            type: 'number',
            default: 1883,
        },
        'tps': {
            description: 'INT: transaction per second',
            type: 'number',
            default: 0,
        },
        'clients': {
            description: 'INT: concurrent running clients',
            type: 'number',
            default: 10,
        }
    });
}, main).parse();

let RECEIVED_TOPIC: string = "Canary/Received/Topic";
let SUBSCRIBE_TOPIC: string = "Mqtt5/Canary/Subscribe_";

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
    clients: number;
}

interface CanaryContext {
    clients: mqtt5.Mqtt5Client[];

    mqttStats: CanaryMqttStatistics;

    subscriptions: number[];
}

function sleep(millisecond: number) {
    return new Promise((resolve) => setInterval(resolve, millisecond));
}

function getRandomIndex(clients : mqtt5.Mqtt5Client[]): number
{
    return Math.floor(Math.random() * clients.length);
}

function createCanaryClients(testContext: TestContext, mqttStats: CanaryMqttStatistics): mqtt5.Mqtt5Client[] {
    const client_config: mqtt5.Mqtt5ClientConfig = {
        hostName: testContext.hostname,
        port: testContext.port
    };

    const clients = [];

    for (let i = 0; i < testContext.clients; i++) {
        let client: mqtt5.Mqtt5Client = new mqtt5.Mqtt5Client(client_config);

        client.on('error', (error: ICrtError) => { });
        client.on("messageReceived", (eventData: mqtt5.MessageReceivedEvent): void => {
            mqttStats.publishesReceived++;
        });

        ++mqttStats.clientsUsed;

        clients.push(client);
    }

    return clients;
}

async function doSubscribe(context: CanaryContext) {
    let index = getRandomIndex(context.clients);
    let sub_count = context.subscriptions[index];
    let topicFilter: string = `${SUBSCRIBE_TOPIC}${sub_count}`;

    try {
        context.mqttStats.subscribesAttempted++;

        await context.clients[index].subscribe({
            subscriptions: [
                { topicFilter: topicFilter, qos: mqtt5.QoS.AtLeastOnce }
            ]
        });

    } catch (err) {
        context.mqttStats.subscribesFailed++;
        return;
    }

    ++context.subscriptions[index];
    context.mqttStats.subscribesSucceeded++;
}

async function doUnsubscribe(context: CanaryContext) {
    let index = getRandomIndex(context.clients);
    let sub_count = context.subscriptions[index];
    if (sub_count == 0) {
        return;
    }
    let topicFilter: string = `${SUBSCRIBE_TOPIC}${sub_count-1}`;

    try {
        context.mqttStats.unsubscribesAttempted++;

        await context.clients[index].unsubscribe({
            topicFilters: [topicFilter]
        });

        context.mqttStats.unsubscribesSucceeded++;
    } catch (err) {
        context.mqttStats.unsubscribesFailed++;
    }
    --context.subscriptions[index];
}

async function doPublish(context: CanaryContext, qos: mqtt5.QoS) {
    try {
        context.mqttStats.publishesAttempted++;

        // Generate random binary payload data
        let payload = Buffer.alloc(10000, 'a', "utf-8");
        let index = getRandomIndex(context.clients);
        await context.clients[index].publish({
            topicName: RECEIVED_TOPIC,
            qos: qos,
            payload: payload,
            retain: false,
            payloadFormat: mqtt5.PayloadFormatIndicator.Utf8,
            messageExpiryIntervalSeconds: 60,
            responseTopic: "talk/to/me",
            correlationData: Buffer.alloc(3000),
            contentType: "not-json",
            userProperties: [
                { name: "name", value: "value" }
            ]
        });

        context.mqttStats.publishesSucceeded++;
    } catch (err) {
        context.mqttStats.publishesFailed++;
        console.log("Publish Failed with " + err);
    }
}

async function runCanary(testContext: TestContext, mqttStats: CanaryMqttStatistics) {
    let startTime: Date = new Date();
    let currentTime: Date = startTime;
    let secondsElapsed: number = 0;

    let context: CanaryContext = {
        clients: createCanaryClients(testContext, mqttStats),
        mqttStats: mqttStats,
        subscriptions: []
    };

    // Start clients
    context.clients.forEach( async client => {
        client.start();
        const connectionSuccess = once(client, "connectionSuccess");

        await connectionSuccess;

        await client.subscribe({
            subscriptions: [
                { topicFilter: RECEIVED_TOPIC, qos: mqtt5.QoS.AtLeastOnce }
            ]
        });
        // setup empty subscription string array
        context.subscriptions.push(0);
    });

    let operationTable = [
        { weight : 1, op: async () => { await doSubscribe(context); }},
        { weight : 1, op: async () => { await doUnsubscribe(context); }},
        { weight : 20, op: async () => { await doPublish(context, mqtt5.QoS.AtMostOnce); }},
        { weight : 20, op: async () => { await doPublish(context, mqtt5.QoS.AtLeastOnce); }}
    ];

    var weightedOperations = operationTable.map(function (operation) {
        return operation.weight;
    });

    while (secondsElapsed < testContext.duration) {

        let index: number = weightedRandom(weightedOperations);

        await (operationTable[index].op)();
        ++context.mqttStats.totalOperation;
        await sleep(testContext.tps_sleep_time);
        currentTime = new Date();

        secondsElapsed = (currentTime.getTime() - startTime.getTime()) / 1000;
    }


    // Stop and close clients
    context.clients.forEach( async client => {
        const stopped = once(client, "stopped");
        client.stop();
        await stopped;
        client.close();
    });

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
        clients: args.clients,
    }

    await runCanary(testContext, mqttStats);

    console.log(`Final Stats: ${JSON.stringify(mqttStats)}`);
    console.log(`Operation TPS: ${mqttStats.totalOperation / testContext.duration}`);

    process.exit(0);

}

