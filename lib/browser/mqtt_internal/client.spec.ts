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

// import WebSocket from 'ws';
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

    constructor(protocolVersion : model.ProtocolMode, packetHandlers? : mqtt_server.PacketHandlerSet) {
        let config : mqtt_server.MqttServerConfig = {
            protocolVersion: protocolVersion
        };
        if (packetHandlers !== undefined) {
            config.packetHandlers = packetHandlers;
        }

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
        connectTimeoutMillis: 1000000 // shorten once no longer single-step debugging
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

describe("start-connect-stop", () => {
    test.each(modes)("MQTT %p", async (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        let fixture = new ClientTestFixture(mode);
        await fixture.start();

        let client = new mqtt_client.Client(buildDefaultClientConfig(fixture, mode));

        let connected = once(client, 'connectionSuccess');

        client.start();
        let connectionSuccessEvent : mqtt_client.ConnectionSuccessEvent = (await connected)[0];

        expect(connectionSuccessEvent.connack.reasonCode).toEqual(mqtt5_packet.ConnectReasonCode.Success);

        let disconnected = once(client, "disconnection");
        let stopped = once(client, "stopped");

        client.stop();

        await disconnected;
        await stopped;

        fixture.getServer().stop();
    })
});


