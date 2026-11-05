/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as promise from "../lib/common/promise";
import * as mqtt_server from "./mqtt_server";
import * as mqtt_shared from "../lib/common/mqtt_shared";
import * as mqtt5_packet from "../lib/common/mqtt5_packet";

export type MetricsConnectFunction = (server: mqtt_server.MqttServer, disableMetrics: boolean, username?: string) => Promise<void>;

export async function doMetricsUsernameTest(protocolMode: mqtt_shared.ProtocolMode, connectionFunction: MetricsConnectFunction, disableMetrics: boolean, username?: string) {
    let connectUsernamePromise = promise.newLiftedPromise<string | undefined>();

    let server = new mqtt_server.MqttServer({
        protocolVersion: protocolMode
    });

    server.on('packetReceived', (packet) => {
        if (packet.type == mqtt5_packet.PacketType.Connect) {
            let connect = packet as mqtt5_packet.ConnectPacket;
            connectUsernamePromise.resolve(connect.username);
        }
    });

    await server.start();

    await connectionFunction(server, disableMetrics, username);

    server.stop();

    let receivedUsername = await connectUsernamePromise.promise;

    if (disableMetrics) {
        if (username === undefined) {
            expect(receivedUsername).toBeUndefined();
        } else {
            expect(receivedUsername).toEqual(username);
        }
    } else {
        expect(receivedUsername).toBeDefined();
        if (username !== undefined) {
            // @ts-ignore
            expect(receivedUsername.startsWith(username)).toBeTruthy();
        }
        expect(receivedUsername).toMatch(`SDK=${mqtt_shared.SDK_NAME}`);
        expect(receivedUsername).toMatch("Platform=");
    }
}