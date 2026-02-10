/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt_server from "@test/mqtt_server";
import * as model from "./model";
import * as mqtt_client from "./client";
import * as mod from "./mod";
import * as mqtt5_packet from "../../common/mqtt5_packet";
import * as promise from "../../common/promise";

import {once} from "events";

var websocket = require('@httptoolkit/websocket-stream')
import * as ws from "../ws";
import {MqttServer} from "../../../test/mqtt_server";


async function sleep(millis: number) {
    return new Promise((resolve, reject) => setTimeout(resolve, millis));
}

function connectToMockServer(port: number) : Promise<ws.WsStream> {
    return new Promise<ws.WsStream>((resolve, reject) => {
        let conn : ws.WsStream = websocket(`ws://localhost:${port}`);
        conn.on('error', (err) => {
            reject(err);
        });
        conn.on('connect', () => {
            resolve(conn);
        });
    });
}

class ClientTestFixture {

    private server : mqtt_server.MqttServer;

    constructor(config: mqtt_server.MqttServerConfig) {
        this.server = new mqtt_server.MqttServer(config);
    }

    async start() {
        await this.server.start();
    }

    getServer() : mqtt_server.MqttServer { return this.server; }
}

function buildDefaultClientConfig(fixture : ClientTestFixture, mode: model.ProtocolMode) : mqtt_client.ClientConfig {
    return {
        protocolVersion: mode,
        offlineQueuePolicy: mod.OfflineQueuePolicy.Default,
        connectOptions: {
            keepAliveIntervalSeconds: 120
        },
        connectionFactory: () => {
            return connectToMockServer(fixture.getServer().getPort());
        },
        connectTimeoutMillis: 10000 // shorten once no longer single-step debugging
    };
}

let modes = [311, 5];

function protocolVersionToMode(protocolVersion: number) : model.ProtocolMode {
    switch (protocolVersion) {
        case 311:
            return model.ProtocolMode.Mqtt311;
        case 5:
            return model.ProtocolMode.Mqtt5;
        default:
            throw new Error("Unsupported protocol version");
    }
}

async function doStartConnectStopTest(protocolVersion : model.ProtocolMode, iterations: number) {
    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: protocolVersion,
    };
    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let client = new mqtt_client.Client(buildDefaultClientConfig(fixture, protocolVersion));

    for (let i = 0; i < iterations; i++) {
        let connecting = once(client, "connecting");
        let connected = once(client, 'connectionSuccess');

        client.start();

        await connecting;

        let connectionSuccessEvent : mqtt_client.ConnectionSuccessEvent = (await connected)[0];
        expect(connectionSuccessEvent.connack.reasonCode).toEqual(mqtt5_packet.ConnectReasonCode.Success);

        let disconnected = once(client, "disconnection");
        let stopped = once(client, "stopped");

        client.stop();

        let disconnectionEvent : mqtt_client.DisconnectionEvent = (await disconnected)[0];
        expect(disconnectionEvent.error.message).toMatch("Client stopped by user request");
        expect(disconnectionEvent.disconnect).toBeUndefined();

        await stopped;
    }

    fixture.getServer().stop();
}

describe("start-connect-stop 1 time", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doStartConnectStopTest(protocolVersionToMode(protocolVersion), 1);
    })
});

describe("start-connect-stop 5 times", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doStartConnectStopTest(protocolVersionToMode(protocolVersion), 5);
    })
});

function buildConnectionFailureSocketExceptionClientConfig(fixture : ClientTestFixture, mode: model.ProtocolMode) : mqtt_client.ClientConfig {
    let config = buildDefaultClientConfig(fixture, mode);
    config.connectionFactory = () => {
        return new Promise<ws.WsStream>((resolve, reject) => {
            setTimeout(() => {
                reject("Socket exception");
            }, 1);
        })
    };

    return config;
}

type ClientConfigFactory = (fixture : ClientTestFixture, protocolVersion : model.ProtocolMode) => mqtt_client.ClientConfig;
type ConnackVerifier = (connack?: mqtt5_packet.ConnackPacket) => void;
type ServerConfigTransformer = (config : mqtt_server.MqttServerConfig) => void;

function noConnackVerifier(connack?: mqtt5_packet.ConnackPacket) {
    expect(connack).toBeUndefined();
}

async function doConnectionFailureTest(protocolVersion : model.ProtocolMode, iterations: number, configFactory: ClientConfigFactory, failureMessage : string, connackVerifier: ConnackVerifier, serverConfigTransform?: ServerConfigTransformer) {
    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: protocolVersion,
    };

    if (serverConfigTransform) {
        serverConfigTransform(config);
    }

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let client = new mqtt_client.Client(configFactory(fixture, protocolVersion));

    for (let i = 0; i < iterations; i++) {
        let connecting = once(client, "connecting");
        let connectionFailure = once(client, 'connectionFailure');

        client.start();

        await connecting;
        let connectionFailureEvent : mqtt_client.ConnectionFailureEvent = (await connectionFailure)[0];
        expect(connectionFailureEvent.error.message).toMatch(failureMessage);
        connackVerifier(connectionFailureEvent.connack);

        let stopped = once(client, "stopped");

        client.stop();

        await stopped;
    }

    fixture.getServer().stop();
}

describe("ConnectionFailure Socket Exception", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doConnectionFailureTest(protocolVersionToMode(protocolVersion), 4, buildConnectionFailureSocketExceptionClientConfig, "Socket exception", noConnackVerifier);
    })
});

function buildConnectionFailureSocketTimeoutClientConfigAux(fixture : ClientTestFixture, mode: model.ProtocolMode, connectTimeout: number, resolutionTime: number) : mqtt_client.ClientConfig {
    let port = fixture.getServer().getPort();
    let config = buildDefaultClientConfig(fixture, mode);
    config.connectTimeoutMillis = connectTimeout;
    config.connectionFactory = () => {
        return new Promise<ws.WsStream>((resolve, reject) => {
            setTimeout(async () => {
                try {
                    resolve(await connectToMockServer(port))
                } catch (e) {
                    reject(e);
                }
            }, resolutionTime);
        })
    };

    return config;
}

function buildConnectionFailureSocketTimeoutUnboundedClientConfig(fixture : ClientTestFixture, mode: model.ProtocolMode) : mqtt_client.ClientConfig {
    return buildConnectionFailureSocketTimeoutClientConfigAux(fixture, mode, 10, 1000);
}

describe("ConnectionFailure Timeout Unbound", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doConnectionFailureTest(protocolVersionToMode(protocolVersion), 4, buildConnectionFailureSocketTimeoutUnboundedClientConfig, "Connection establishment timeout", noConnackVerifier);
    })
});

function buildConnectionFailureSocketTimeoutOverlappingClientConfig(fixture : ClientTestFixture, mode: model.ProtocolMode) : mqtt_client.ClientConfig {
    return buildConnectionFailureSocketTimeoutClientConfigAux(fixture, mode, 100, 200);
}

describe("ConnectionFailure Timeout Overlapping", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doConnectionFailureTest(protocolVersionToMode(protocolVersion), 4, buildConnectionFailureSocketTimeoutOverlappingClientConfig, "Connection establishment timeout", noConnackVerifier);
    })
});

function unauthorizedConnackVerifier5(connack?: mqtt5_packet.ConnackPacket) {
    expect(connack).toBeDefined();
    expect(connack?.reasonCode).toEqual(mqtt5_packet.ConnectReasonCode.NotAuthorized);
}

function unauthorizedConnackVerifier311(connack?: mqtt5_packet.ConnackPacket) {
    expect(connack).toBeDefined();
    expect(connack?.reasonCode).toEqual(mqtt5_packet.ConnectReasonCode.NotAuthorized311);
}

function failingConnackServerConfig311(config : mqtt_server.MqttServerConfig){
    config.connackOverrides = {
        sessionPresent: false,
        reasonCode: mqtt5_packet.ConnectReasonCode.NotAuthorized311
    };
}

function failingConnackServerConfig5(config : mqtt_server.MqttServerConfig){
    config.connackOverrides = {
        sessionPresent: false,
        reasonCode: mqtt5_packet.ConnectReasonCode.NotAuthorized
    };
}

describe("ConnectionFailure Failed Connack", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        await doConnectionFailureTest(mode, 1, buildDefaultClientConfig, "Connection rejected with reason code",
            (mode == model.ProtocolMode.Mqtt5) ? unauthorizedConnackVerifier5 : unauthorizedConnackVerifier311,
            (mode == model.ProtocolMode.Mqtt5) ? failingConnackServerConfig5 : failingConnackServerConfig311);
    })
});

function noConnackServerConfig(config : mqtt_server.MqttServerConfig){
    let newPacketHandlers = mqtt_server.buildDefaultHandlerSet();
    newPacketHandlers.set(mqtt5_packet.PacketType.Connect, mqtt_server.nullHandler);

    config.packetHandlers = newPacketHandlers;
}

function connackTimeoutConfig(fixture : ClientTestFixture, mode: model.ProtocolMode) : mqtt_client.ClientConfig {
    let config = buildDefaultClientConfig(fixture, mode);
    config.connectTimeoutMillis = 1000;

    return config;
}

describe("ConnectionFailure Connack Timeout", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doConnectionFailureTest(protocolVersionToMode(protocolVersion), 4, connackTimeoutConfig, "Connection establishment timeout", noConnackVerifier, noConnackServerConfig);
    })
});

async function doStopWhileConnectingTest(protocolVersion : model.ProtocolMode, iterations: number) {
    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: protocolVersion,
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let client = new mqtt_client.Client(buildConnectionFailureSocketTimeoutUnboundedClientConfig(fixture, protocolVersion));

    for (let i = 0; i < iterations; i++) {
        let connecting = once(client, "connecting");
        let stopped = once(client, "stopped");
        let connectionFailure = once(client, 'connectionFailure');

        client.start();
        await connecting;

        client.stop();
        await stopped;

        let connectionFailureEvent : mqtt_client.ConnectionFailureEvent = (await connectionFailure)[0];
        expect(connectionFailureEvent.error.message).toMatch("Client stopped by user request");
    }

    fixture.getServer().stop();
}

describe("Stop during transport connection establishment", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doStopWhileConnectingTest(protocolVersionToMode(protocolVersion), 4);
    })
});

interface StopPendingConnackContext {
    connectReceived: promise.LiftedPromise<void>
}

export function stopPendingConnackConnectHandler(packet : mqtt5_packet.IPacket, server: mqtt_server.MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    let config = server.getConfig();

    let context = config.context as StopPendingConnackContext;
    context.connectReceived.resolve();
}

async function doStopWhilePendingConnackTest(protocolVersion : model.ProtocolMode, iterations: number) {
    let context : StopPendingConnackContext = {
        connectReceived: promise.newLiftedPromise<void>()
    };

    let packetHandlers = mqtt_server.buildDefaultHandlerSet();
    packetHandlers.set(mqtt5_packet.PacketType.Connect, stopPendingConnackConnectHandler);

    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: protocolVersion,
        packetHandlers: packetHandlers,
        context: context
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let client = new mqtt_client.Client(buildDefaultClientConfig(fixture, protocolVersion));

    for (let i = 0; i < iterations; i++) {
        let connecting = once(client, "connecting");
        let stopped = once(client, "stopped");
        let connectionFailure = once(client, 'connectionFailure');

        client.start();
        await connecting;

        await context.connectReceived.promise;

        client.stop();
        await stopped;

        let connectionFailureEvent : mqtt_client.ConnectionFailureEvent = (await connectionFailure)[0];
        expect(connectionFailureEvent.error.message).toMatch("Client stopped by user request");

        // reset the promise for future iteration
        context = {
            connectReceived: promise.newLiftedPromise<void>()
        };
        fixture.getServer().getConfig().context = context;
    }

    fixture.getServer().stop();
}

describe("Stop during pending connack", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doStopWhilePendingConnackTest(protocolVersionToMode(protocolVersion), 4);
    })
});

interface StopWithDisconnectPacketContext {
    disconnectReceived: promise.LiftedPromise<mqtt5_packet.DisconnectPacket>
}

export function stopDisconnectHandler(packet : mqtt5_packet.IPacket, server: mqtt_server.MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    let config = server.getConfig();

    let context = config.context as StopWithDisconnectPacketContext;
    context.disconnectReceived.resolve(packet as mqtt5_packet.DisconnectPacket);
}

async function doStopWithDisconnectPacketTest(protocolVersion : model.ProtocolMode, iterations: number) {
    let context : StopWithDisconnectPacketContext = {
        disconnectReceived: promise.newLiftedPromise<mqtt5_packet.DisconnectPacket>()
    };

    let packetHandlers = mqtt_server.buildDefaultHandlerSet();
    packetHandlers.set(mqtt5_packet.PacketType.Disconnect, stopDisconnectHandler);

    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: protocolVersion,
        packetHandlers: packetHandlers,
        context: context
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let client = new mqtt_client.Client(buildDefaultClientConfig(fixture, protocolVersion));

    for (let i = 0; i < iterations; i++) {
        let connectionSuccess = once(client, "connectionSuccess");
        let stopped = once(client, "stopped");
        let disconnection = once(client, 'disconnection');

        client.start();
        await connectionSuccess;

        client.stop({
            reasonCode: mqtt5_packet.DisconnectReasonCode.UnspecifiedError
        });
        await stopped;

        let disconnect = await context.disconnectReceived.promise;
        if (protocolVersion == model.ProtocolMode.Mqtt5) {
            expect(disconnect.reasonCode).toEqual(mqtt5_packet.DisconnectReasonCode.UnspecifiedError);
        }

        let disconnectionEvent : mqtt_client.ConnectionFailureEvent = (await disconnection)[0];
        expect(disconnectionEvent.error.message).toMatch("Client stopped by user request");

        // reset the promise for future iteration
        context = {
            disconnectReceived: promise.newLiftedPromise<mqtt5_packet.DisconnectPacket>()
        };
        fixture.getServer().getConfig().context = context;
    }

    fixture.getServer().stop();
}

describe("Stop with disconnect packet while connected", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doStopWithDisconnectPacketTest(protocolVersionToMode(protocolVersion), 4);
    })
});

export function queueDisconnectConnectHandler(packet : mqtt5_packet.IPacket, server: mqtt_server.MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    mqtt_server.defaultConnectHandler(packet, server, responsePackets);

    setTimeout(() => {
        server.closeConnections();
    }, 10);
}

async function doStopDuringReconnectTest(protocolVersion : model.ProtocolMode, iterations: number) {

    let packetHandlers = mqtt_server.buildDefaultHandlerSet();
    packetHandlers.set(mqtt5_packet.PacketType.Connect, queueDisconnectConnectHandler);

    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: protocolVersion,
        packetHandlers: packetHandlers
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let client = new mqtt_client.Client(buildDefaultClientConfig(fixture, protocolVersion));

    for (let i = 0; i < iterations; i++) {
        let connectionSuccess = once(client, "connectionSuccess");
        let stopped = once(client, "stopped");
        let disconnection = once(client, 'disconnection');

        client.start();
        await connectionSuccess;

        await disconnection;

        await sleep(10);
        client.stop();

        await stopped;
    }

    fixture.getServer().stop();
}

describe("Stop during reconnect", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doStopDuringReconnectTest(protocolVersionToMode(protocolVersion), 4);
    })
});

type OperationInvocationFunction<T> = (client: mqtt_client.Client) => Promise<T>;
type OperationInvocationResultVerifier<T> = (result: T) => void;

async function doOperationSuccessTest<T>(protocolVersion : model.ProtocolMode, operationFunction: OperationInvocationFunction<T>, verifierFunction: OperationInvocationResultVerifier<T>) {
    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: protocolVersion,
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let client = new mqtt_client.Client(buildDefaultClientConfig(fixture, protocolVersion));

    let connectionSuccess = once(client, "connectionSuccess");
    let stopped = once(client, "stopped");

    client.start();
    await connectionSuccess;

    let resultPromise = operationFunction(client);
    let result = await resultPromise;
    verifierFunction(result);

    client.stop();
    await stopped;

    fixture.getServer().stop();
}

function doSubscribe(client: mqtt_client.Client) : Promise<mqtt5_packet.SubackPacket> {
    return client.subscribe({
        subscriptions: [{
            topicFilter: "test/topic",
            qos: mqtt5_packet.QoS.AtLeastOnce,
        }]
    });
}

function verifySuback(suback: mqtt5_packet.SubackPacket) {
    expect(suback.reasonCodes.length).toEqual(1);
    expect(suback.reasonCodes[0]).toEqual(mqtt5_packet.SubackReasonCode.GrantedQoS1);
}

describe("Subscribe success", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationSuccessTest<mqtt5_packet.SubackPacket>(protocolVersionToMode(protocolVersion),  doSubscribe, verifySuback);
    })
});

function doUnsubscribe(client: mqtt_client.Client) : Promise<mqtt5_packet.UnsubackPacket> {
    return client.unsubscribe({
        topicFilters: ["test/topic"]
    });
}

function verifyUnsuback5(suback: mqtt5_packet.UnsubackPacket) {
    expect(suback.reasonCodes.length).toEqual(1);
    expect(suback.reasonCodes[0]).toEqual(mqtt5_packet.UnsubackReasonCode.Success);
}

function verifyUnsuback311(suback: mqtt5_packet.UnsubackPacket) {
}

describe("Unsubscribe success", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        await doOperationSuccessTest<mqtt5_packet.UnsubackPacket>(mode, doUnsubscribe, (mode == model.ProtocolMode.Mqtt5) ? verifyUnsuback5 : verifyUnsuback311);
    })
});

function doQos0Publish(client: mqtt_client.Client) : Promise<mod.PublishResult> {
    return client.publish({
        topicName: "test/topic",
        qos: mqtt5_packet.QoS.AtMostOnce,
    });
}

function verifyQos0PublishResult(result: mod.PublishResult) {
    expect(result.type).toEqual(mod.PublishResultType.Qos0);
    expect(result.packet).toBeUndefined();
}

describe("Publish QoS 0 success", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationSuccessTest<mod.PublishResult>(protocolVersionToMode(protocolVersion), doQos0Publish, verifyQos0PublishResult);
    })
});

function doQos1Publish(client: mqtt_client.Client) : Promise<mod.PublishResult> {
    return client.publish({
        topicName: "test/topic",
        qos: mqtt5_packet.QoS.AtLeastOnce,
    });
}

function verifyQos1PublishResult(result: mod.PublishResult) {
    expect(result.type).toEqual(mod.PublishResultType.Qos1);
    expect(result.packet).toBeDefined();

    let puback = result.packet as mqtt5_packet.PubackPacket;
    expect(puback.reasonCode).toEqual(mqtt5_packet.PubackReasonCode.Success);
}

describe("Publish QoS 1 success", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationSuccessTest<mod.PublishResult>(protocolVersionToMode(protocolVersion), doQos1Publish, verifyQos1PublishResult);
    })
});

async function doPublishReceivedTest(protocolVersion : model.ProtocolMode, iterations: number) {
    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: protocolVersion,
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let client = new mqtt_client.Client(buildDefaultClientConfig(fixture, protocolVersion));

    for (let i = 0; i < iterations; i++) {
        let connectionSuccess = once(client, "connectionSuccess");
        let stopped = once(client, "stopped");

        client.start();
        await connectionSuccess;

        let publishReceived = once(client, "publishReceived");

        await client.publish({
           topicName: "test/topic",
           qos: mqtt5_packet.QoS.AtLeastOnce
        });

        let publishEvent : mqtt_client.PublishReceivedEvent = (await publishReceived)[0];
        expect(publishEvent.publish.topicName).toEqual("test/topic");
        expect(publishEvent.publish.qos).toEqual(mqtt5_packet.QoS.AtLeastOnce);

        client.stop();
        await stopped;
    }

    fixture.getServer().stop();
}

describe("PublishReceived", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doPublishReceivedTest(protocolVersionToMode(protocolVersion), 4);
    })
});

async function doOperationFailureTest<T>(protocolVersion : model.ProtocolMode, operationFunction: OperationInvocationFunction<T>, failureMessageMatch: string) {
    let handlers = mqtt_server.buildDefaultHandlerSet();
    handlers.set(mqtt5_packet.PacketType.Publish, mqtt_server.nullHandler);
    handlers.set(mqtt5_packet.PacketType.Subscribe, mqtt_server.nullHandler);
    handlers.set(mqtt5_packet.PacketType.Unsubscribe, mqtt_server.nullHandler);

    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: protocolVersion,
        packetHandlers: handlers
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let client = new mqtt_client.Client(buildDefaultClientConfig(fixture, protocolVersion));

    let connectionSuccess = once(client, "connectionSuccess");
    let stopped = once(client, "stopped");

    client.start();
    await connectionSuccess;

    await expect(operationFunction(client)).rejects.toThrow(failureMessageMatch);

    client.stop();
    await stopped;

    fixture.getServer().stop();
}

const TIMEOUT_FAILURE_MESSAGE : string = "Operation timed out";

function doSubscribeWithTimeout(client: mqtt_client.Client) : Promise<mqtt5_packet.SubackPacket> {
    return client.subscribe({
        subscriptions: [{
            topicFilter: "test/topic",
            qos: mqtt5_packet.QoS.AtLeastOnce,
        }]
    }, {
        timeoutInMillis : 500
    });
}

describe("Subscribe failure by timeout", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationFailureTest<mqtt5_packet.SubackPacket>(protocolVersionToMode(protocolVersion), doSubscribeWithTimeout, TIMEOUT_FAILURE_MESSAGE);
    })
});

function doUnsubscribeWithTimeout(client: mqtt_client.Client) : Promise<mqtt5_packet.UnsubackPacket> {
    return client.unsubscribe({
        topicFilters: ["test/topic"]
    }, {
        timeoutInMillis: 500
    });
}

describe("Unsubscribe failure by timeout", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationFailureTest<mqtt5_packet.UnsubackPacket>(protocolVersionToMode(protocolVersion), doUnsubscribeWithTimeout, TIMEOUT_FAILURE_MESSAGE);
    })
});

function doQos1PublishWithTimeout(client: mqtt_client.Client) : Promise<mod.PublishResult> {
    return client.publish({
        topicName: "test/topic",
        qos: mqtt5_packet.QoS.AtLeastOnce,
    }, {
        timeoutInMillis: 500
    });
}

describe("Publish QoS 1 failure by timeout", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationFailureTest<mod.PublishResult>(protocolVersionToMode(protocolVersion), doQos1PublishWithTimeout, TIMEOUT_FAILURE_MESSAGE);
    })
});

function doInvalidSubscribe(client: mqtt_client.Client) : Promise<mqtt5_packet.SubackPacket> {
    return client.subscribe({
        subscriptions: []
    });
}

describe("Subscribe failure by validation", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationFailureTest<mqtt5_packet.SubackPacket>(protocolVersionToMode(protocolVersion), doInvalidSubscribe, "Subscriptions cannot be empty");
    })
});

function doInvalidUnsubscribe(client: mqtt_client.Client) : Promise<mqtt5_packet.UnsubackPacket> {
    return client.unsubscribe({
        topicFilters: [ "a/#/a" ]
    });
}

describe("Unsubscribe failure by validation", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationFailureTest<mqtt5_packet.UnsubackPacket>(protocolVersionToMode(protocolVersion), doInvalidUnsubscribe, "not a valid topic filter");
    })
});

function doInvalidPublish(client: mqtt_client.Client) : Promise<mod.PublishResult> {
    return client.publish({
        topicName: "a/#/a",
        qos: mqtt5_packet.QoS.AtMostOnce,
    });
}

describe("Publish failure by validation", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationFailureTest<mod.PublishResult>(protocolVersionToMode(protocolVersion), doInvalidPublish, "not a valid topic");
    })
});

function disconnectHandler(packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    setTimeout(() => { server.closeConnections(); }, 0);
}

async function doOperationFailureByInterruptionTest<T>(protocolVersion : model.ProtocolMode, operationFunction: OperationInvocationFunction<T>) {
    let handlers = mqtt_server.buildDefaultHandlerSet();
    handlers.set(mqtt5_packet.PacketType.Publish, disconnectHandler);
    handlers.set(mqtt5_packet.PacketType.Subscribe, disconnectHandler);
    handlers.set(mqtt5_packet.PacketType.Unsubscribe, disconnectHandler);

    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: protocolVersion,
        packetHandlers: handlers,
        connackOverrides: {
            reasonCode: mqtt5_packet.ConnectReasonCode.Success,
            sessionPresent: false // so that QoS 1 publish gets failed on reconnect
        }
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let clientConfig = buildDefaultClientConfig(fixture, protocolVersion);
    clientConfig.offlineQueuePolicy = mod.OfflineQueuePolicy.PreserveNothing;

    let client = new mqtt_client.Client(clientConfig);

    let connectionSuccess = once(client, "connectionSuccess");
    let stopped = once(client, "stopped");

    client.start();
    await connectionSuccess;

    await expect(operationFunction(client)).rejects.toThrow("failed OfflineQueuePolicy");

    client.stop();
    await stopped;

    fixture.getServer().stop();
}

describe("Subscribe failure by offline policy", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationFailureByInterruptionTest<mqtt5_packet.SubackPacket>(protocolVersionToMode(protocolVersion), doSubscribe);
    })
});

describe("Unsubscribe failure by offline policy", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationFailureByInterruptionTest<mqtt5_packet.UnsubackPacket>(protocolVersionToMode(protocolVersion), doUnsubscribe);
    })
});

describe("Publish QoS 1 failure by offline policy", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doOperationFailureByInterruptionTest<mod.PublishResult>(protocolVersionToMode(protocolVersion), doQos1Publish);
    })
});

async function doStartStopStartTest(protocolVersion : model.ProtocolMode) {
    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: protocolVersion,
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let client = new mqtt_client.Client(buildDefaultClientConfig(fixture, protocolVersion));

    let connectionSuccess = once(client, "connectionSuccess");
    let stopped = once(client, "stopped");

    client.start();
    client.stop();
    client.start();

    await connectionSuccess;

    client.stop();
    await stopped;

    fixture.getServer().stop();
}

describe("Start Stop Start", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doStartStopStartTest(protocolVersionToMode(protocolVersion));
    })
});

function handleConnectWithDisconnect(packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    mqtt_server.defaultConnectHandler(packet, server, responsePackets);

    responsePackets.push({
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: mqtt5_packet.DisconnectReasonCode.ImplementationSpecificError,
        reasonString: "sketch"
    } as mqtt5_packet.DisconnectPacket);
}

test('Server-side disconnect', async () => {
    let handlers = mqtt_server.buildDefaultHandlerSet();
    handlers.set(mqtt5_packet.PacketType.Connect, handleConnectWithDisconnect);

    let config : mqtt_server.MqttServerConfig = {
        protocolVersion: model.ProtocolMode.Mqtt5,
        packetHandlers: handlers
    };

    let fixture = new ClientTestFixture(config);
    await fixture.start();

    let client = new mqtt_client.Client(buildDefaultClientConfig(fixture, model.ProtocolMode.Mqtt5));

    let connectionSuccess = once(client, "connectionSuccess");
    let disconnection = once(client, "disconnection");
    let stopped = once(client, "stopped");

    client.start();

    await connectionSuccess;

    connectionSuccess = once(client, "connectionSuccess");
    let connecting = once(client, "connecting");

    let disconnectionEvent : mqtt_client.DisconnectionEvent = (await disconnection)[0];
    expect(disconnectionEvent.error.message).toEqual("Server-side disconnect");
    expect(disconnectionEvent.disconnect).toBeDefined();
    expect(disconnectionEvent.disconnect!.reasonCode).toEqual(mqtt5_packet.DisconnectReasonCode.ImplementationSpecificError);

    // verify reconnect
    await connecting;
    await connectionSuccess;

    client.stop();
    await stopped;

    fixture.getServer().stop();
});

async function doIterativeReconnectTest(protocolVersion : model.ProtocolMode, maximumInitialFailureCount: number) {
    for (let i = 1; i <= maximumInitialFailureCount; i++) {

        let connectCount : number = 0;

        let handlers = mqtt_server.buildDefaultHandlerSet();
        handlers.set(mqtt5_packet.PacketType.Connect, (packet: mqtt5_packet.IPacket, server: MqttServer, responsePackets: Array<mqtt5_packet.IPacket>) => {
            connectCount++;
            if (connectCount <= i) {
                responsePackets.push({
                    type: mqtt5_packet.PacketType.Connack,
                    reasonCode: mqtt5_packet.ConnectReasonCode.NotAuthorized,
                    sessionPresent: false
                } as mqtt5_packet.ConnackPacket);
            } else {
                mqtt_server.defaultConnectHandler(packet, server, responsePackets);
            }
        });

        let config: mqtt_server.MqttServerConfig = {
            protocolVersion: protocolVersion,
            packetHandlers: handlers,
        };

        let fixture = new ClientTestFixture(config);
        await fixture.start();

        let clientConfig = buildDefaultClientConfig(fixture, protocolVersion);
        clientConfig.minReconnectDelayMs = 100;
        clientConfig.maxReconnectDelayMs = 1000;

        let client = new mqtt_client.Client(clientConfig);

        let connectionFailureCount: number = 0;
        let connectingCount: number = 0;
        let connectionSuccess = once(client, "connectionSuccess");
        let stopped = once(client, "stopped");
        client.addListener("connectionFailure", (event) => {
            connectionFailureCount++;
        });
        client.addListener("connecting", (event) => {
            connectingCount++;
        });

        client.start();

        await connectionSuccess;

        expect(connectionFailureCount).toEqual(i);
        expect(connectingCount).toEqual(i + 1);
        expect(connectCount).toEqual(i + 1);

        client.stop();
        await stopped;

        fixture.getServer().stop();
    }
}

describe("ConnectionSuccessAfterFailures", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        await doIterativeReconnectTest(protocolVersionToMode(protocolVersion), 4);
    })
});
