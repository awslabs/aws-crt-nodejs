/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
import * as model from "../lib/browser/mqtt_internal/model";
import * as mqtt5_packet from "../lib/common/mqtt5_packet";
import {CrtError} from "../lib/browser/error";
import {v4 as uuid} from "uuid";
import * as encoder from "../lib/browser/mqtt_internal/encoder";
import * as decoder from "../lib/browser/mqtt_internal/decoder";
import * as mqtt_internal_client from "./mqtt_internal_client";

//import * as http from "http";
import * as ws from "@httptoolkit/websocket-stream";
import * as WebSocket from "ws";

import * as promise from "../lib/common/promise";


export type PacketHandlerType = (packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) => void;
export type PacketHandlerSet = Map<mqtt5_packet.PacketType, PacketHandlerType>;

function defaultConnectHandler(packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    let connect = packet as model.ConnectPacketInternal;
    let config = server.getConfig();

    let connack : mqtt5_packet.ConnackPacket = {
        type: mqtt5_packet.PacketType.Connack,
        reasonCode: config.connackOverrides?.reasonCode ?? mqtt5_packet.ConnectReasonCode.Success,
        sessionPresent: config.connackOverrides?.sessionPresent ?? false
    };

    if (config.protocolVersion == model.ProtocolMode.Mqtt5) {
        if (!connect.clientId || !connect.clientId.length) {
            connack.assignedClientIdentifier = config.connackOverrides?.assignedClientIdentifier ?? `test-${uuid()}`;
        }

        if (config.connackOverrides?.maximumPacketSize) {
            connack.maximumPacketSize = config.connackOverrides?.maximumPacketSize;
        }

        if (config.connackOverrides?.receiveMaximum) {
            connack.receiveMaximum = config.connackOverrides?.receiveMaximum;
        }
    }

    responsePackets.push(connack);
}

function defaultSubscribeHandler(packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    let subscribe = packet as model.SubscribePacketInternal;

    let suback : model.SubackPacketInternal = {
        type: mqtt5_packet.PacketType.Suback,
        packetId: subscribe.packetId,
        reasonCodes: []
    };

    for (let subscription of subscribe.subscriptions) {
        let reasonCode : mqtt5_packet.SubackReasonCode = mqtt5_packet.SubackReasonCode.UnspecifiedError;
        switch(subscription.qos) {
            case mqtt5_packet.QoS.AtMostOnce:
                reasonCode = mqtt5_packet.SubackReasonCode.GrantedQoS0;
                break;
            case mqtt5_packet.QoS.AtLeastOnce:
                reasonCode = mqtt5_packet.SubackReasonCode.GrantedQoS1;
                break;
            case mqtt5_packet.QoS.ExactlyOnce:
                reasonCode = mqtt5_packet.SubackReasonCode.GrantedQoS2;
                break;
        }

        suback.reasonCodes.push(reasonCode);
    }

    responsePackets.push(suback);
}

function defaultUnsubscribeHandler(packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    let unsubscribe = packet as model.UnsubscribePacketInternal;

    let unsuback : model.UnsubackPacketInternal = {
        type: mqtt5_packet.PacketType.Unsuback,
        packetId: unsubscribe.packetId,
        reasonCodes: []
    };

    for (let _ of unsubscribe.topicFilters) {
        unsuback.reasonCodes.push(mqtt5_packet.UnsubackReasonCode.Success);
    }

    responsePackets.push(unsuback);
}

function internalPublishHandler(packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>, reflectPublish : boolean) {
    let incomingPublish = packet as model.PublishPacketInternal;
    if (incomingPublish.qos != mqtt5_packet.QoS.ExactlyOnce) {
        if (reflectPublish) {
            let outboundPublish: model.PublishPacketInternal = {
                type: mqtt5_packet.PacketType.Publish,
                topicName: incomingPublish.topicName,
                qos: incomingPublish.qos,
                retain: incomingPublish.retain,
                duplicate: false,
                payload: incomingPublish.payload
            };

            if (incomingPublish.qos != mqtt5_packet.QoS.AtMostOnce) {
                outboundPublish.packetId = incomingPublish.packetId; // not a great solution
            }

            responsePackets.push(outboundPublish);
        }

        if (incomingPublish.qos == mqtt5_packet.QoS.AtLeastOnce) {
            let puback : model.PubackPacketInternal = {
                type: mqtt5_packet.PacketType.Puback,
                packetId: incomingPublish.packetId ?? 0,
                reasonCode: mqtt5_packet.PubackReasonCode.Success
            };

            responsePackets.push(puback);
        }
    }
}

function defaultPublishHandler(packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    internalPublishHandler(packet, server, responsePackets, true);
}

export function nonReflectivePublishHandler(packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    internalPublishHandler(packet, server, responsePackets, false);
}

function defaultPingreqHandler(packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    let pingresp : model.PingrespPacketInternal = {
        type: mqtt5_packet.PacketType.Pingresp
    };

    responsePackets.push(pingresp);
}

function throwHandler(packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
    throw new CrtError("Unexpected packet received");
}

function nullHandler(packet : mqtt5_packet.IPacket, server: MqttServer, responsePackets : Array<mqtt5_packet.IPacket>) {
}

function buildDefaultHandlerSet() : PacketHandlerSet {
    return new Map<mqtt5_packet.PacketType, PacketHandlerType>([
        [mqtt5_packet.PacketType.Connect, defaultConnectHandler],
        [mqtt5_packet.PacketType.Subscribe, defaultSubscribeHandler],
        [mqtt5_packet.PacketType.Unsubscribe, defaultUnsubscribeHandler],
        [mqtt5_packet.PacketType.Publish, defaultPublishHandler],
        [mqtt5_packet.PacketType.Pingreq, defaultPingreqHandler],

        [mqtt5_packet.PacketType.Connack, throwHandler],
        [mqtt5_packet.PacketType.Pingresp, throwHandler],
        [mqtt5_packet.PacketType.Suback, throwHandler],
        [mqtt5_packet.PacketType.Unsuback, throwHandler],
        [mqtt5_packet.PacketType.Auth, throwHandler],
        [mqtt5_packet.PacketType.Pubrec, throwHandler],
        [mqtt5_packet.PacketType.Pubrel, throwHandler],
        [mqtt5_packet.PacketType.Pubcomp, throwHandler],

        [mqtt5_packet.PacketType.Puback, nullHandler],
        [mqtt5_packet.PacketType.Disconnect, nullHandler],
    ]);
}

class MqttServerConnection {
    private connection : WebSocket;
    private server : MqttServer;
    private encoder: encoder.Encoder;
    private decoder: decoder.Decoder;

    constructor(connection : WebSocket, server: MqttServer) {
        this.connection = connection;
        this.server = server;

        let protocolVersion = server.getConfig().protocolVersion;

        let encoderSet = encoder.buildClientEncodingFunctionSet(protocolVersion);
        mqtt_internal_client.applyDebugEncodersToEncodingFunctionSet(encoderSet, protocolVersion);
        this.encoder = new encoder.Encoder(encoderSet);

        let decoderSet = decoder.buildClientDecodingFunctionSet(protocolVersion);
        mqtt_internal_client.applyDebugDecodersToDecodingFunctionSet(decoderSet, protocolVersion);
        this.decoder = new decoder.Decoder(decoderSet);

        let mqttConnection : MqttServerConnection = this;

        connection.on('error', () => { mqttConnection.close(); });

        connection.on('message', function message(data) {
            mqttConnection.onData(data as Buffer);
        });
    }

    onData(data: Buffer) {
        try {
            let dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
            let packets = this.decoder.decode(dataView);
            let handlers = this.server.getPacketHandlers();

            let responsePackets: Array<mqtt5_packet.IPacket> = [];
            for (let packet of packets) {
                let handler = handlers.get(packet.type ?? -1);
                if (!handler) {
                    continue;
                }

                handler(packet, this.server, responsePackets);
            }

            let encodeBuffer = new ArrayBuffer(4096);
            let responseBytes: mqtt_internal_client.DynamicArrayBuffer = new mqtt_internal_client.DynamicArrayBuffer(4096);

            for (let responsePacket of responsePackets) {
                this.encoder.initForPacket(mqtt_internal_client.convertDebugPacketToBinary(responsePacket));

                let encodeResult: encoder.ServiceResult = {
                    type: encoder.ServiceResultType.InProgress,
                    nextView: new DataView(encodeBuffer)
                };

                while (encodeResult.type != encoder.ServiceResultType.Complete) {
                    let encodeBufferView = new DataView(encodeBuffer);
                    encodeResult = this.encoder.service(encodeBufferView);
                    let encodedView = new DataView(encodeBuffer, 0, encodeResult.nextView.byteOffset);
                    responseBytes.append(encodedView);
                }
            }

            queueMicrotask(async () => {
                let writtenPromise = promise.newLiftedPromise<void>();
                let writeView = responseBytes.getView();
                let toWrite = new Uint8Array(writeView.buffer, writeView.byteOffset, writeView.byteLength);
                this.connection.send(toWrite, (err) => {
                    if (err) {
                        writtenPromise.reject(err)
                    } else {
                        writtenPromise.resolve();
                    }
                });

                await writtenPromise.promise;
            });
        } catch (e) {
            console.log(e);
        }
    }

    close() {
        this.connection.close();
    }
}

export interface MqttServerConfig {
    protocolVersion : model.ProtocolMode;
    port? : number;
    packetHandlers? : PacketHandlerSet;
    connackOverrides? : mqtt5_packet.ConnackPacket;
}

export class MqttServer {

    // @ts-ignore
    private handlers: PacketHandlerSet;
    private port : number;
    private server : ws.Server;
    private connections : Array<MqttServerConnection> = [];
    private setup : promise.LiftedPromise<void>;

    constructor(private config: MqttServerConfig) {
        this.handlers = config.packetHandlers ?? buildDefaultHandlerSet();
        this.port = config.port ?? 8089;
        this.setup = promise.newLiftedPromise<void>();

        let opts : any = {
            port : this.port,
            perMessageDeflate: false
        };


        let mqttServer = this;

        this.server = ws.createServer(opts, this.serverCallback.bind(this));

        this.server.on('listening', () => this.serverCallback());

        this.server.on('connection', function connection(ws : WebSocket) {
            let connection = new MqttServerConnection(ws, mqttServer);
            mqttServer.connections.push(connection);
        });
    }


    public getConfig() : MqttServerConfig {
        return this.config;
    }

    public getPacketHandlers() : PacketHandlerSet {
        return this.handlers;
    }

    public getPort() : number {
        return this.port;
    }

    public stop() {
        for (let stream of this.connections) {
            stream.close();
        }

        this.server.close();
    }

    private serverCallback() {
        this.setup.resolve();
    }

    public start() : Promise<void> { return this.setup.promise; }
}