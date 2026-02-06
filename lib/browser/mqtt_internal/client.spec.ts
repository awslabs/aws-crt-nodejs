/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt_server from "@test/mqtt_server";
import * as model from "./model";
import * as mqtt_client from "./client";
import * as mod from "./mod";
import * as mqtt5_packet from "../../common/mqtt5_packet";
import {once} from "events";

var websocket = require('@httptoolkit/websocket-stream')
import * as ws from "../ws";

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


