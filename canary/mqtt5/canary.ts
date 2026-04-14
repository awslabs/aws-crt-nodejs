/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {ICrtError, mqtt5, crt} from "aws-crt";
import {once} from "events";
import {v4 as uuid} from "uuid";
var weightedRandom = require('weighted-random');

const MEMORY_CHECK_INTERVAL_SECONDS = 600; // 10 minutes

type Args = { [index: string]: any };

const yargs = require('yargs');
const payload = Buffer.alloc(65536, 'a', "utf-8");

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
    totalOperationAttempted: number;
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

    subscriptions: string[][];

    clientStarted: boolean[];
}

function sleep(millisecond: number) {
    return new Promise((resolve) => setTimeout(resolve, millisecond));
}

function printMemoryUsageReport() {
    const nativeMemoryBytes = crt.native_memory();
    const processMemory = process.memoryUsage();
    console.log(`   Native memory (bytes): ${nativeMemoryBytes}`);
    console.log(`   Process memory (bytes):`);
    console.log(`     - RSS (Resident Set Size): ${processMemory.rss}`);
    console.log(`     - Heap Total: ${processMemory.heapTotal}`);
    console.log(`     - Heap Used: ${processMemory.heapUsed}`);
    console.log(`     - External: ${processMemory.external}`);
    if ((processMemory as any).arrayBuffers !== undefined) {
        console.log(`     - Array Buffers: ${(processMemory as any).arrayBuffers}`);
    }
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

async function ensureClientStarted(context: CanaryContext, index: number) {
    if (!context.clientStarted[index]) {
        context.clients[index].start();
        const connectionSuccess = once(context.clients[index], "connectionSuccess");
        await connectionSuccess;
        context.clientStarted[index] = true;
    }
}

async function doSubscribe(context: CanaryContext) {
    let topicFilter: string = `Mqtt5/Canary/RandomSubscribe${uuid()}`;

    let index = getRandomIndex(context.clients);
    
    await ensureClientStarted(context, index);
    
    try {

        context.mqttStats.subscribesAttempted++;

        await context.clients[index].subscribe({
            subscriptions: [
                { topicFilter: RECEIVED_TOPIC, qos: mqtt5.QoS.AtLeastOnce }
            ]
        });

    } catch (err) {
        context.mqttStats.subscribesFailed++;
        return;
    }

    context.subscriptions[index].push(topicFilter);
    context.mqttStats.subscribesSucceeded++;
    context.mqttStats.totalOperationAttempted++;
}

async function doStop(context: CanaryContext) {
    let index = getRandomIndex(context.clients);
    if (context.clientStarted[index]) {
        context.clients[index].stop();
        context.clientStarted[index] = false;
    }
}

async function doUnsubscribe(context: CanaryContext) {
    let index = getRandomIndex(context.clients);
    if (context.subscriptions[index].length == 0) {
        return;
    }
    
    await ensureClientStarted(context, index);
    
    let topicFilter: string = context.subscriptions[index].pop() ?? "canthappen";

    try {
        context.mqttStats.unsubscribesAttempted++;
        
        await context.clients[index].unsubscribe({
            topicFilters: [topicFilter]
        });

        context.mqttStats.unsubscribesSucceeded++;
    } catch (err) {
        context.mqttStats.unsubscribesFailed++;
        context.subscriptions[index].push(topicFilter);
    }
    context.mqttStats.totalOperationAttempted++;
}

async function doPublish(context: CanaryContext, qos: mqtt5.QoS) {
    let index = getRandomIndex(context.clients);
    
    await ensureClientStarted(context, index);
    
    try {
        context.mqttStats.publishesAttempted++;

        // Generate random binary payload data
        await context.clients[index].publish({
            topicName: RECEIVED_TOPIC,
            qos: qos,
            payload: payload
        });

        context.mqttStats.publishesSucceeded++;
    } catch (err) {
        context.mqttStats.publishesFailed++;
        console.log("Publish Failed with " + err);
    }
    context.mqttStats.totalOperationAttempted++;
}

async function runCanary(testContext: TestContext, mqttStats: CanaryMqttStatistics) {
    const startTime = Date.now();
    let secondsElapsed: number = 0;

    let context: CanaryContext = {
        clients: createCanaryClients(testContext, mqttStats),
        mqttStats: mqttStats,
        subscriptions: [],
        clientStarted: []
    };

    // Start clients
    for (let client of context.clients) {
        client.start();
        const connectionSuccess = once(client, "connectionSuccess");

        await connectionSuccess;

        await client.subscribe({
            subscriptions: [
                { topicFilter: RECEIVED_TOPIC, qos: mqtt5.QoS.AtLeastOnce }
            ]
        });
        // setup empty subscription string array
        context.subscriptions.push(new Array());
        // track client started state
        context.clientStarted.push(true);
    }

    // Print initial memory usage report
    printMemoryUsageReport();

    let operationTable = [
        { weight : 1, op: () => { doStop(context) }},
        { weight : 200, op: () => { doSubscribe(context); }},
        { weight : 200, op: () => { doUnsubscribe(context); }},
        { weight : 200, op: () => { doPublish(context, mqtt5.QoS.AtMostOnce); }},
        { weight : 200, op: () => { doPublish(context, mqtt5.QoS.AtLeastOnce); }}
    ];

    let weightedOperations = operationTable.map(function (operation) {
        return operation.weight;
    });

    let nextMemoryCheckSeconds = MEMORY_CHECK_INTERVAL_SECONDS;

    while (secondsElapsed < testContext.duration) {
        let index: number = weightedRandom(weightedOperations);
        (operationTable[index].op)();
        ++context.mqttStats.totalOperation;
        if (testContext.tps_sleep_time > 0) {
            await sleep(testContext.tps_sleep_time);
        }

        secondsElapsed = (Date.now() - startTime) / 1000;

        // Check if it's time to print memory usage report
        if (secondsElapsed >= nextMemoryCheckSeconds) {
            nextMemoryCheckSeconds += MEMORY_CHECK_INTERVAL_SECONDS;
            // printMemoryUsageReport()
            console.log(`Operations: ${context.mqttStats.totalOperation}`);
        }
    }

    // Stop and close clients
    for (let client of context.clients) {
        const stopped = once(client, "stopped");
        client.stop();
        await stopped;
        client.close();
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
        totalOperationAttempted: 0,
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

