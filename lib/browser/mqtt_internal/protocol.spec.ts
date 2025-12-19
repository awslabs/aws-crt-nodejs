/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as encoder from "./encoder";
import * as decoder from "./decoder";
import * as model from "./model";
import * as protocol from "./protocol";
import {ProtocolStateType, PublishResult} from "./protocol";
import {CrtError} from "../error";
import {v4 as uuid} from "uuid";
import * as test_mqtt_internal_client from "@test/mqtt_internal_client";

enum OperationResultStateType {
    Success,
    Failure,
    Pending
}

interface OperationResult<T> {
    state: OperationResultStateType,
    error?: CrtError,
    result?: T
}

class DynamicArrayBuffer {

    private buffer : ArrayBuffer;
    private length : number = 0;

    constructor(initialSize: number) {
        this.buffer = new ArrayBuffer(initialSize);
    }

    getView(): DataView {
        return new DataView(this.buffer, 0, this.length);
    }

    append(view : DataView) {
        let minLengthNeeded = view.byteLength + this.length;
        if (minLengthNeeded > this.buffer.byteLength) {
            this.resizeBuffer(Math.floor(minLengthNeeded * 1.5 + 1));
        }

        let typedArray = new Uint8Array(this.buffer);
        let source = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        typedArray.set(source, this.length);
        this.length += view.byteLength;
    }

    reset() {
        this.length = 0;
    }

    private resizeBuffer(newSize: number) {
        let newBuffer = new ArrayBuffer(newSize);
        let newTypedArray = new Uint8Array(newBuffer);
        let source = new Uint8Array(this.buffer, 0, this.length);
        newTypedArray.set(source, 0);
        this.buffer = newBuffer;
    }
}

interface BrokerTestContext {
    connackOverrides? : mqtt5_packet.ConnackPacket,
    protocolStateConfig : protocol.ProtocolStateConfig,
    socketBufferSize? : number,
}

type PacketHandlerType = (packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>) => void;
type PacketHandlerSet = Map<mqtt5_packet.PacketType, PacketHandlerType>;

function defaultConnectHandler(packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>) {
    let connect = packet as model.ConnectPacketInternal;

    let connack : mqtt5_packet.ConnackPacket = {
        type: mqtt5_packet.PacketType.Connack,
        reasonCode: context.connackOverrides?.reasonCode ?? mqtt5_packet.ConnectReasonCode.Success,
        sessionPresent: context.connackOverrides?.sessionPresent ?? false
    };

    if (context.protocolStateConfig.protocolVersion == model.ProtocolMode.Mqtt5) {
        if (!connect.clientId || !connect.clientId.length) {
            connack.assignedClientIdentifier = context.connackOverrides?.assignedClientIdentifier ?? `test-${uuid()}`;
        }
    }

    responsePackets.push(connack);
}

function defaultSubscribeHandler(packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>) {
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

function defaultUnsubscribeHandler(packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>) {
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

function internalPublishHandler(packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>, reflectPublish : boolean) {
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

function defaultPublishHandler(packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>) {
    internalPublishHandler(packet, context, responsePackets, true);
}

function nonReflectivePublishHandler(packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>) {
    internalPublishHandler(packet, context, responsePackets, false);
}

function defaultPingreqHandler(packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>) {
    let pingresp : model.PingrespPacketInternal = {
        type: mqtt5_packet.PacketType.Pingresp
    };

    responsePackets.push(pingresp);
}

function throwHandler(packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>) {
    throw new CrtError("Unexpected packet received");
}

function nullHandler(packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>) {
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

function buildProtocolStateConfig(mode: model.ProtocolMode, configMutator: (config: protocol.ProtocolStateConfig) => void = (config)=> {} ) : protocol.ProtocolStateConfig {
    let config = {
        protocolVersion: mode,
        offlineQueuePolicy: protocol.OfflineQueuePolicy.Default,
        connectOptions: {
            keepAliveIntervalSeconds: 30,
            clientId: "test-client-id"
        },
        baseElapsedMillis: 0,
        pingTimeoutMillis: 30000,
    };

    if (configMutator) {
        configMutator(config);
    }

    return config;
}

let TEST_CONNECTION_ESTABLISHMENT_TIMEOUT_MS : number = 30 * 1000;

class ProtocolTestFixture {

    private brokerEncoder : encoder.Encoder;
    private brokerDecoder : decoder.Decoder;

    protocolState : protocol.ProtocolState;
    private socketBuffer : ArrayBuffer;

    toServerPackets : Array<mqtt5_packet.IPacket> = [];
    toClientPackets : Array<mqtt5_packet.IPacket> = [];

    constructor(private context: BrokerTestContext, private handlers: PacketHandlerSet) {
        this.protocolState = new protocol.ProtocolState(context.protocolStateConfig);
        this.socketBuffer = new ArrayBuffer(context.socketBufferSize ?? 4096);

        let encoder_set = encoder.buildClientEncodingFunctionSet(context.protocolStateConfig.protocolVersion);
        test_mqtt_internal_client.applyDebugEncodersToEncodingFunctionSet(encoder_set, context.protocolStateConfig.protocolVersion);
        this.brokerEncoder = new encoder.Encoder(encoder_set);

        let decoder_set = decoder.buildClientDecodingFunctionSet(context.protocolStateConfig.protocolVersion);
        test_mqtt_internal_client.applyDebugDecodersToDecodingFunctionSet(decoder_set, context.protocolStateConfig.protocolVersion);
        this.brokerDecoder = new decoder.Decoder(decoder_set);
    }

    service(elapsedMillis: number) : DataView | undefined {
        let serviceContext : protocol.ServiceContext = {
            elapsedMillis: elapsedMillis,
            socketBuffer: this.socketBuffer
        };

        let serviceResult = this.protocolState.service(serviceContext);
        return serviceResult.toSocket;
    }

    handleToBrokerPacket(packet: mqtt5_packet.IPacket, responseBytes: DynamicArrayBuffer) {
        this.toServerPackets.push(packet);

        let responsePackets = new Array<mqtt5_packet.IPacket>();

        let handler = this.handlers.get(packet.type ?? - 1);
        if (handler == undefined) {
            throw new CrtError("No handler for packet type");
        }

        handler(packet, this.context, responsePackets);

        let encodeBuffer = new ArrayBuffer(4096);

        for (let responsePacket of responsePackets) {
            this.toClientPackets.push(responsePacket);
            this.brokerEncoder.initForPacket(test_mqtt_internal_client.convertDebugPacketToBinary(responsePacket));

            let encodeResult : encoder.ServiceResult = {
                type: encoder.ServiceResultType.InProgress,
                nextView: new DataView(encodeBuffer)
            };

            while (encodeResult.type != encoder.ServiceResultType.Complete) {
                let encodeBufferView = new DataView(encodeBuffer);
                encodeResult = this.brokerEncoder.service(encodeBufferView);
                let encodedView = new DataView(encodeBuffer, 0, encodeResult.nextView.byteOffset);
                responseBytes.append(encodedView);
            }
        }
    }

    writeToSocket(data: DataView) : DataView {
        let packets = this.brokerDecoder.decode(data);
        let responseBytes = new DynamicArrayBuffer(4096);

        for (let packet of packets) {
            this.handleToBrokerPacket(packet, responseBytes);
        }

        return responseBytes.getView();
    }

    serviceWithDrain(elapsedMillis: number) : DataView {
        let responseBytes = new DynamicArrayBuffer(4096);

        while (true) {
            let toSocket = this.service(elapsedMillis);
            if (!toSocket) {
                break;
            }

            this.onWriteCompletion(elapsedMillis);

            responseBytes.append(this.writeToSocket(toSocket));
        }

        return responseBytes.getView();
    }

    serviceRoundTrip(elapsedMillis: number) {
        let responseBytes = this.serviceWithDrain(elapsedMillis);

        this.onIncomingData(elapsedMillis, responseBytes);
    }


    onConnectionOpened(elapsedMillis: number) {
        this.brokerDecoder.reset();

        let networkEvent : protocol.NetworkEventContext = {
            elapsedMillis: elapsedMillis,
            type: protocol.NetworkEventType.ConnectionOpened,
            context : {
                establishmentTimeout: elapsedMillis + TEST_CONNECTION_ESTABLISHMENT_TIMEOUT_MS
            }
        };

        this.protocolState.handleNetworkEvent(networkEvent);
    }

    onWriteCompletion(elapsedMillis: number) {
        let networkEvent : protocol.NetworkEventContext = {
            elapsedMillis: elapsedMillis,
            type: protocol.NetworkEventType.WriteCompletion,
        };

        this.protocolState.handleNetworkEvent(networkEvent);
    }

    onConnectionClosed(elapsedMillis: number) {
        let networkEvent : protocol.NetworkEventContext = {
            elapsedMillis: elapsedMillis,
            type: protocol.NetworkEventType.ConnectionClosed,
        };

        this.protocolState.handleNetworkEvent(networkEvent);
    }

    onIncomingData(elapsedMillis: number, data: DataView) {
        let networkEvent : protocol.NetworkEventContext = {
            elapsedMillis: elapsedMillis,
            type: protocol.NetworkEventType.IncomingData,
            context: {
                data: data
            }
        };

        this.protocolState.handleNetworkEvent(networkEvent);
    }

    getNextServiceTimepoint(elaspedMillis: number) : number | undefined {
        return this.protocolState.getNextServiceTimepoint(elaspedMillis);
    }

    subscribe(elapsedMillis: number, packet: mqtt5_packet.SubscribePacket, options?: protocol.SubscribeOptions) : OperationResult<mqtt5_packet.SubackPacket> {
        let result : OperationResult<mqtt5_packet.SubackPacket> = {
            state: OperationResultStateType.Pending,
        };

        let internalOptions : protocol.SubscribeOptionsInternal = {
            options: options ?? {},
            resultHandler: {
                onCompletionSuccess : (value : mqtt5_packet.SubackPacket)=> {
                    result.result = value;
                    result.state = OperationResultStateType.Success;
                },
                onCompletionFailure : (error : CrtError)=> {
                    result.error = error;
                    result.state = OperationResultStateType.Success;
                }
            }
        };

        let userEvent : protocol.UserEventContext = {
            type: protocol.UserEventType.Subscribe,
            context: {
                packet: packet,
                options: internalOptions
            },
            elapsedMillis: elapsedMillis
        };
        this.protocolState.handleUserEvent(userEvent);

        return result;
    }

    unsubscribe(elapsedMillis: number, packet: mqtt5_packet.UnsubscribePacket, options?: protocol.UnsubscribeOptions) : OperationResult<mqtt5_packet.UnsubackPacket> {
        let result : OperationResult<mqtt5_packet.UnsubackPacket> = {
            state: OperationResultStateType.Pending,
        };

        let internalOptions : protocol.UnsubscribeOptionsInternal = {
            options: options ?? {},
            resultHandler: {
                onCompletionSuccess : (value : mqtt5_packet.UnsubackPacket)=> {
                    result.result = value;
                    result.state = OperationResultStateType.Success;
                },
                onCompletionFailure : (error : CrtError)=> {
                    result.error = error;
                    result.state = OperationResultStateType.Success;
                }
            }
        };

        let userEvent : protocol.UserEventContext = {
            type: protocol.UserEventType.Unsubscribe,
            context: {
                packet: packet,
                options: internalOptions
            },
            elapsedMillis: elapsedMillis
        };
        this.protocolState.handleUserEvent(userEvent);

        return result;
    }

    publish(elapsedMillis: number, packet: mqtt5_packet.PublishPacket, options?: protocol.PublishOptions) : OperationResult<protocol.PublishResult> {
        let result : OperationResult<protocol.PublishResult> = {
            state: OperationResultStateType.Pending,
        };

        let internalOptions : protocol.PublishOptionsInternal = {
            options: options ?? {},
            resultHandler: {
                onCompletionSuccess : (value : protocol.PublishResult)=> {
                    result.result = value;
                    result.state = OperationResultStateType.Success;
                },
                onCompletionFailure : (error : CrtError)=> {
                    result.error = error;
                    result.state = OperationResultStateType.Success;
                }
            }
        };

        let userEvent : protocol.UserEventContext = {
            type: protocol.UserEventType.Publish,
            context: {
                packet: packet,
                options: internalOptions
            },
            elapsedMillis: elapsedMillis
        };
        this.protocolState.handleUserEvent(userEvent);

        return result;
    }

    disconnect(elapsedMillis: number, packet: mqtt5_packet.DisconnectPacket) {
        let userEvent : protocol.UserEventContext = {
            type: protocol.UserEventType.Disconnect,
            context: {
                packet: packet,
            },
            elapsedMillis: elapsedMillis
        };
        this.protocolState.handleUserEvent(userEvent);
    }

    advanceFromDisconnected(elapsedMillis: number, desiredState: protocol.ProtocolStateType) {
        if (this.protocolState.getState() != protocol.ProtocolStateType.Disconnected) {
            throw new CrtError("Protocol state is not disconnected");
        }

        switch(desiredState) {
            case protocol.ProtocolStateType.PendingConnack:
                this.onConnectionOpened(elapsedMillis);
                break;

            case protocol.ProtocolStateType.Connected:
                this.onConnectionOpened(elapsedMillis);
                let toServer = this.serviceWithDrain(elapsedMillis);
                this.onIncomingData(elapsedMillis, toServer);
                break;

            case ProtocolStateType.Disconnected:
                break;

            default:
                throw new CrtError("Unsupported desired state");
        }
    }

    verifyEmpty() {
        expect(this.protocolState.getOperations().size).toEqual(0);
        expect(this.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
        expect(this.protocolState.getOperationQueue(protocol.OperationQueueType.Resubmit).length).toEqual(0);
        expect(this.protocolState.getOperationQueue(protocol.OperationQueueType.HighPriority).length).toEqual(0);

        expect(this.protocolState.getOperationTimeouts().empty()).toEqual(true);
        expect(this.protocolState.getBoundPacketIds().size).toEqual(0);

        expect(this.protocolState.getPendingPublishAcks().size).toEqual(0);
        expect(this.protocolState.getPendingNonPublishAcks().size).toEqual(0);
        expect(this.protocolState.getPendingWriteCompletionOperations().length).toEqual(0);
    }
}

function findNthPacketOfType(packets: Array<mqtt5_packet.IPacket>, packetType: mqtt5_packet.PacketType, n: number) : [number, mqtt5_packet.IPacket] {
    let currentIndex : number = 0;
    let matches : number = 0;
    for (let packet of packets) {
        if (packet.type == packetType) {
            matches++;
            if (matches == n) {
                return [currentIndex, packet];
            }
        }

        currentIndex++;
    }

    throw new Error("Failed to find packet");
}

/*
function findNthPacketByPredicate(packets: Array<mqtt5_packet.IPacket>, predicate: (packet: mqtt5_packet.IPacket) => boolean, n: number) : [number, mqtt5_packet.IPacket] | undefined {
    let currentIndex : number = 0;
    let matches : number = 0;
    for (let packet of packets) {
        if (predicate(packet)) {
            matches++;
            if (matches == n) {
                return [currentIndex, packet];
            }
        }

        currentIndex++;
    }

    return undefined;
}

*/

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

describe("disconnectedStateFailsNetworkEvents", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        expect(() => fixture.onConnectionClosed(0)).toThrow("while disconnected");
        expect(fixture.protocolState.getHalted()).toEqual(true);
        fixture.verifyEmpty();

        fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        expect(() => fixture.onWriteCompletion(0)).toThrow("while disconnected");
        expect(fixture.protocolState.getHalted()).toEqual(true);
        fixture.verifyEmpty();

        fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        expect(() => { fixture.onIncomingData(0, new DataView(new Uint8Array([0, 1, 2, 3, 4, 5]).buffer)); }).toThrow("while disconnected");
        expect(fixture.protocolState.getHalted()).toEqual(true);
        fixture.verifyEmpty();
    })
});

describe("disconnectedStateNextServiceTimeNever", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        expect(fixture.protocolState.getNextServiceTimepoint(0)).toEqual(undefined);
    })
});

function verifyServiceDoesNothing(fixture : ProtocolTestFixture) {
    let toServerPackets = fixture.toServerPackets;
    let toClientPackets = fixture.toClientPackets;

    let publishPacket : mqtt5_packet.PublishPacket = {
        topicName: "derp",
        qos: mqtt5_packet.QoS.AtLeastOnce,
    };

    let publishResult = fixture.publish(0, publishPacket, {});

    expect(fixture.protocolState.getOperations().size).toEqual(1);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);
    expect(publishResult.state).toEqual(OperationResultStateType.Pending);

    let outboundBytes = fixture.serviceWithDrain(0);
    expect(outboundBytes.byteLength).toEqual(0);

    expect(fixture.toServerPackets.length).toEqual(toServerPackets.length);
    expect(fixture.toClientPackets.length).toEqual(toClientPackets.length);
}

describe("disconnectedStateServiceDoesNothing", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        verifyServiceDoesNothing(fixture);
    })
});

describe("pendingConnackConnectionOpenedFails", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        fixture.onConnectionOpened(0);

        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.PendingConnack);

        expect(() => fixture.onConnectionOpened(0)).toThrow("while not disconnected");
        expect(fixture.protocolState.getHalted()).toEqual(true);
    })
});

describe("pendingConnackIllegalWriteCompletionFails", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        fixture.onConnectionOpened(0);

        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.PendingConnack);

        expect(() => fixture.onWriteCompletion(0)).toThrow("no write was pending");
        expect(fixture.protocolState.getHalted()).toEqual(true);
    })
});

describe("pendingConnackTimeout", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        fixture.onConnectionOpened(0);
        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.PendingConnack);
        expect(fixture.protocolState.getHalted()).toEqual(false);

        fixture.serviceWithDrain(0);
        fixture.service(1 + TEST_CONNECTION_ESTABLISHMENT_TIMEOUT_MS);
        expect(fixture.protocolState.getHalted()).toEqual(true);
        expect(fixture.protocolState.getHaltError()?.toString()).toMatch("Connack timeout");

        fixture.verifyEmpty();
    })
});

describe("pendingConnackFailedConnack", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        let reason = (mode == model.ProtocolMode.Mqtt5) ? mqtt5_packet.ConnectReasonCode.ServerBusy : mqtt5_packet.ConnectReasonCode.ServerUnavailable311;
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(mode),
            connackOverrides: {
                sessionPresent: false,
                reasonCode: reason,
            }
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        fixture.onConnectionOpened(0);
        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.PendingConnack);
        expect(fixture.protocolState.getHalted()).toEqual(false);

        expect(() => fixture.serviceRoundTrip(0)).toThrow("Connection rejected");
        expect(fixture.protocolState.getHalted()).toEqual(true);

        let [, connackPacket] = findNthPacketOfType(fixture.toClientPackets, mqtt5_packet.PacketType.Connack, 1);
        expect((connackPacket as mqtt5_packet.ConnackPacket).reasonCode).toEqual(reason);

        let [index, ] = findNthPacketOfType(fixture.toServerPackets, mqtt5_packet.PacketType.Connect, 1);
        expect(index).toEqual(0);

        fixture.verifyEmpty();
    })
});

function encodePacketToBuffer(packet: mqtt5_packet.IPacket, mode: model.ProtocolMode) : DataView {
    let encoder_set = encoder.buildClientEncodingFunctionSet(mode);
    test_mqtt_internal_client.applyDebugEncodersToEncodingFunctionSet(encoder_set, mode);
    let packetEncoder = new encoder.Encoder(encoder_set);

    packetEncoder.initForPacket(test_mqtt_internal_client.convertDebugPacketToBinary(packet));
    let encodeBuffer = new ArrayBuffer(4096);
    let dynamicBuffer = new DynamicArrayBuffer(4096);
    let encodeResult: encoder.ServiceResult = {
        type: encoder.ServiceResultType.InProgress,
        nextView: new DataView(encodeBuffer)
    };

    while (encodeResult.type != encoder.ServiceResultType.Complete) {
        let encodeBufferView = new DataView(encodeBuffer);
        encodeResult = packetEncoder.service(encodeBufferView);
        let encodedView = new DataView(encodeBuffer, 0, encodeResult.nextView.byteOffset);
        dynamicBuffer.append(encodedView);
    }

    return dynamicBuffer.getView();
}

describe("pendingConnackConnackTooSoon", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion)),
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        fixture.onConnectionOpened(0);
        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.PendingConnack);
        expect(fixture.protocolState.getHalted()).toEqual(false);

        fixture.service(0);
        let encodedConnack = encodePacketToBuffer({
            type: mqtt5_packet.PacketType.Connack,
            sessionPresent: true
        } as model.ConnackPacketInternal, protocolVersionToMode(protocolVersion));

        expect(() => fixture.onIncomingData(0, encodedConnack)).toThrow("packet type not valid for current state");
        expect(fixture.protocolState.getHalted()).toEqual(true);
    })
});

describe("pendingConnackConnectionClosed", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        fixture.onConnectionOpened(0);
        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.PendingConnack);
        expect(fixture.protocolState.getHalted()).toEqual(false);

        fixture.serviceWithDrain(0);

        fixture.onConnectionClosed(1);
        expect(fixture.protocolState.getHalted()).toEqual(false);
        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.Disconnected);

        fixture.verifyEmpty();
    })
});

describe("pendingConnackIncomingGarbageData", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        fixture.onConnectionOpened(0);
        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.PendingConnack);
        expect(fixture.protocolState.getHalted()).toEqual(false);

        fixture.serviceWithDrain(0);

        expect(() => fixture.onIncomingData(0, new DataView(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer))).toThrow("handleNetworkEvent() failure");
        expect(fixture.protocolState.getHalted()).toEqual(true);
        expect(fixture.protocolState.getHaltError()?.toString()).toMatch("handleNetworkEvent() failure");

        fixture.verifyEmpty();
    })
});


let pendingConnackResponsePackets : Map<string, mqtt5_packet.IPacket> = new Map<string, mqtt5_packet.IPacket>([
    [ "Connect", {
            type: mqtt5_packet.PacketType.Connect,
            cleanStart: true,
        } as model.ConnectPacketInternal
    ],
    [ "Pingreq", {
            type: mqtt5_packet.PacketType.Pingreq
        }
    ],
    [ "Pingresp", {
            type: mqtt5_packet.PacketType.Pingresp
        }
    ],
    [ "Publish", {
            type: mqtt5_packet.PacketType.Publish,
            topicName: "a/b",
            qos: mqtt5_packet.QoS.AtMostOnce,
        } as model.PublishPacketInternal
    ],
    [ "Puback", {
            type: mqtt5_packet.PacketType.Puback,
            packetId: 1,
        } as model.PubackPacketInternal
    ],
    [ "Subscribe", {
            type: mqtt5_packet.PacketType.Subscribe,
            packetId: 1,
            subscriptions: [
                {
                    topicFilter: "a/b",
                    qos: mqtt5_packet.QoS.AtMostOnce,
                }
            ]
        } as model.SubscribePacketInternal
    ],
    [ "Suback", {
            type: mqtt5_packet.PacketType.Suback,
            packetId: 1,
            reasonCodes: [mqtt5_packet.SubackReasonCode.GrantedQoS0]

        } as model.SubackPacketInternal
    ],
    [ "Unsubscribe", {
            type: mqtt5_packet.PacketType.Unsubscribe,
            packetId: 1,
            topicFilters: ["a/b"]
        } as model.UnsubscribePacketInternal
    ],
    [ "Unsuback", {
            type: mqtt5_packet.PacketType.Unsuback,
            packetId: 1,
            reasonCodes: [mqtt5_packet.UnsubackReasonCode.Success]
        } as model.UnsubackPacketInternal
    ],
    [ "Disconnect", {
            type: mqtt5_packet.PacketType.Disconnect,
            reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection,
        } as model.DisconnectPacketInternal
    ],
]);

let pendingConnackResponsePacketNames : Array<string> = Array.from(pendingConnackResponsePackets.keys());

function doPendingConnackIncomingForbiddenPacketTest(packet: mqtt5_packet.IPacket, mode: model.ProtocolMode) {
    let context : BrokerTestContext = {
        protocolStateConfig: buildProtocolStateConfig(mode)
    };

    let handlers = buildDefaultHandlerSet();
    handlers.set(mqtt5_packet.PacketType.Connect, (packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>) => {
        // @ts-ignore
        responsePackets.push(packet);
    });

    let fixture = new ProtocolTestFixture(context, handlers);
    fixture.onConnectionOpened(0);
    expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.PendingConnack);
    expect(fixture.protocolState.getHalted()).toEqual(false);

    expect(() => fixture.serviceRoundTrip(0)).toThrow(new RegExp("packet type not valid for current state|No decoder for packet type"));

    expect(fixture.protocolState.getHalted()).toEqual(true);
    expect(fixture.protocolState.getHaltError()?.toString()).toMatch(new RegExp("packet type not valid for current state|No decoder for packet type"));

    fixture.verifyEmpty();
}

describe("pendingConnackIncomingForbiddenPacket - Mqtt311", () => {
    test.each(pendingConnackResponsePacketNames)("Packet %p", (name) => {
        // @ts-ignore
        doPendingConnackIncomingForbiddenPacketTest(pendingConnackResponsePackets.get(name), model.ProtocolMode.Mqtt311);
    })
});

describe("pendingConnackIncomingForbiddenPacket - Mqtt5", () => {
    test.each(pendingConnackResponsePacketNames)("Packet %p", (name) => {
        // @ts-ignore
        doPendingConnackIncomingForbiddenPacketTest(pendingConnackResponsePackets.get(name), model.ProtocolMode.Mqtt5);
    })
});

describe("connectedConnectionOpenedFails", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());

        fixture.advanceFromDisconnected(0, ProtocolStateType.Connected);

        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.Connected);
        expect(fixture.protocolState.getHalted()).toEqual(false);

        expect(() => fixture.onConnectionOpened(0)).toThrow("opened while not disconnected");
        expect(fixture.protocolState.getHalted()).toEqual(true);
        expect(fixture.protocolState.getHaltError()?.toString()).toMatch("opened while not disconnected");

        fixture.verifyEmpty();
    })
});

describe("connectedWriteCompletionFails", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());

        fixture.advanceFromDisconnected(0, ProtocolStateType.Connected);

        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.Connected);
        expect(fixture.protocolState.getHalted()).toEqual(false);

        expect(() => fixture.onWriteCompletion(0)).toThrow("no write was pending");
        expect(fixture.protocolState.getHalted()).toEqual(true);
        expect(fixture.protocolState.getHaltError()?.toString()).toMatch("no write was pending");

        fixture.verifyEmpty();
    })
});

describe("connectedTransitionToDisconnected", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());

        fixture.advanceFromDisconnected(0, ProtocolStateType.Connected);

        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.Connected);
        expect(fixture.protocolState.getHalted()).toEqual(false);

        fixture.onConnectionClosed(0);

        expect(fixture.protocolState.getHalted()).toEqual(false);
        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.Disconnected);

        fixture.verifyEmpty();
    })
});

describe("connectedIncomingGarbageData", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());

        fixture.advanceFromDisconnected(0, ProtocolStateType.Connected);

        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.Connected);
        expect(fixture.protocolState.getHalted()).toEqual(false);

        expect(() => fixture.onIncomingData(0, new DataView(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer))).toThrow("handleNetworkEvent() failure");

        expect(fixture.protocolState.getHalted()).toEqual(true);
        expect(fixture.protocolState.getHaltError()?.toString()).toMatch("handleNetworkEvent() failure");

        fixture.verifyEmpty();
    })
});

let connectedResponsePackets : Map<string, mqtt5_packet.IPacket> = new Map<string, mqtt5_packet.IPacket>([
    [ "Connect", {
            type: mqtt5_packet.PacketType.Connect,
            cleanStart: true,
        } as model.ConnectPacketInternal
    ],
    [ "Connack", {
            type: mqtt5_packet.PacketType.Connack,
            reasonCode: mqtt5_packet.ConnectReasonCode.Success,
        } as model.ConnackPacketInternal
    ],
    [ "Pingreq", {
            type: mqtt5_packet.PacketType.Pingreq
        }
    ],
    [ "Subscribe", {
            type: mqtt5_packet.PacketType.Subscribe,
            packetId: 1,
            subscriptions: [
                {
                    topicFilter: "a/b",
                    qos: mqtt5_packet.QoS.AtMostOnce,
                }
            ]
        } as model.SubscribePacketInternal
    ],
    [ "Unsubscribe", {
            type: mqtt5_packet.PacketType.Unsubscribe,
            packetId: 1,
            topicFilters: ["a/b"]
        } as model.UnsubscribePacketInternal
    ],
]);

let connectedResponsePacketNames : Array<string> = Array.from(connectedResponsePackets.keys());

function doConnectedIncomingForbiddenPacketTest(packet: mqtt5_packet.IPacket, mode : model.ProtocolMode) {
    let context : BrokerTestContext = {
        protocolStateConfig: buildProtocolStateConfig(mode)
    };

    let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
    fixture.advanceFromDisconnected(0, ProtocolStateType.Connected);

    let badPacketView = encodePacketToBuffer(packet, mode);

    expect(() => fixture.onIncomingData(0, badPacketView)).toThrow(new RegExp("packet type not valid for current state|No decoder for packet type"));

    expect(fixture.protocolState.getHalted()).toEqual(true);
    expect(fixture.protocolState.getHaltError()?.toString()).toMatch(new RegExp("packet type not valid for current state|No decoder for packet type"));

    fixture.verifyEmpty();
}

describe("connectedIncomingForbiddenPacket - Mqtt311", () => {
    test.each(connectedResponsePacketNames)("Packet %p", (name) => {
        // @ts-ignore
        doConnectedIncomingForbiddenPacketTest(connectedResponsePackets.get(name), model.ProtocolMode.Mqtt311);
    })
});

describe("connectedIncomingForbiddenPacket - Mqtt5", () => {
    test.each(connectedResponsePacketNames)("Packet %p", (name) => {
        // @ts-ignore
        doConnectedIncomingForbiddenPacketTest(connectedResponsePackets.get(name), model.ProtocolMode.Mqtt5);
    })
});

test("connectedIncomingForbiddenDisconnectPacket - Mqtt311", () => {
    doConnectedIncomingForbiddenPacketTest({
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection
    } as model.DisconnectPacketInternal, model.ProtocolMode.Mqtt311);
});

function doUnknownAckPacketIdTest(packet: mqtt5_packet.IPacket, mode : model.ProtocolMode) {
    let context : BrokerTestContext = {
        protocolStateConfig: buildProtocolStateConfig(mode)
    };

    let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
    fixture.advanceFromDisconnected(0, ProtocolStateType.Connected);

    let badPacketView = encodePacketToBuffer(packet, mode);

    fixture.onIncomingData(0, badPacketView);

    expect(fixture.protocolState.getHalted()).toEqual(false);
    expect(fixture.protocolState.getHaltError()?.toString()).toBeUndefined();

    fixture.verifyEmpty();
}

describe("connectedIncomingUnknownPuback", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doUnknownAckPacketIdTest({
            type: mqtt5_packet.PacketType.Puback,
            packetId: 1,
            reasonCode: mqtt5_packet.PubackReasonCode.Success
        } as mqtt5_packet.PubackPacket,
            protocolVersionToMode(protocolVersion));
    })
});

describe("connectedIncomingUnknownSuback", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doUnknownAckPacketIdTest({
                type: mqtt5_packet.PacketType.Suback,
                packetId: 42,
                reasonCodes: [mqtt5_packet.SubackReasonCode.GrantedQoS1, (mode == model.ProtocolMode.Mqtt5) ? mqtt5_packet.SubackReasonCode.TopicFilterInvalid: mqtt5_packet.SubackReasonCode.Failure311]
            } as mqtt5_packet.SubackPacket,
            mode);
    })
});

describe("connectedIncomingUnknownUnsuback", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doUnknownAckPacketIdTest({
                type: mqtt5_packet.PacketType.Unsuback,
                packetId: 120,
                reasonCodes: [mqtt5_packet.UnsubackReasonCode.Success, mqtt5_packet.UnsubackReasonCode.NoSubscriptionExisted]
            } as mqtt5_packet.UnsubackPacket,
            protocolVersionToMode(protocolVersion));
    })
});

function doInvalidPacketIdTest(packet: mqtt5_packet.IPacket, mode : model.ProtocolMode) {
    let context : BrokerTestContext = {
        protocolStateConfig: buildProtocolStateConfig(mode)
    };

    let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
    fixture.advanceFromDisconnected(0, ProtocolStateType.Connected);

    let badPacketView = encodePacketToBuffer(packet, mode);

    expect(() => fixture.onIncomingData(0, badPacketView)).toThrow("not a valid packetId");

    expect(fixture.protocolState.getHalted()).toEqual(true);
    expect(fixture.protocolState.getHaltError()?.toString()).toMatch("not a valid packetId");

    fixture.verifyEmpty();
}

describe("connectedIncomingPublishInvalidPacketIdQos1", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doInvalidPacketIdTest({
                type: mqtt5_packet.PacketType.Publish,
                packetId: 0,
                qos: mqtt5_packet.QoS.AtLeastOnce,
                topicName: "a/b"
            } as mqtt5_packet.PublishPacket,
            protocolVersionToMode(protocolVersion));
    })
});

describe("connectedIncomingPubackInvalidPacketId", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doInvalidPacketIdTest({
                type: mqtt5_packet.PacketType.Puback,
                packetId: 0,
                reasonCode: mqtt5_packet.PubackReasonCode.Success
            } as mqtt5_packet.PubackPacket,
            protocolVersionToMode(protocolVersion));
    })
});

describe("connectedIncomingSubackInvalidPacketId", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doInvalidPacketIdTest({
                type: mqtt5_packet.PacketType.Suback,
                packetId: 0,
                reasonCodes: [mqtt5_packet.SubackReasonCode.GrantedQoS1, mqtt5_packet.SubackReasonCode.TopicFilterInvalid]
            } as mqtt5_packet.SubackPacket,
            protocolVersionToMode(protocolVersion));
    })
});

describe("connectedIncomingUnsubackInvalidPacketId", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doInvalidPacketIdTest({
                type: mqtt5_packet.PacketType.Unsuback,
                packetId: 0,
                reasonCodes: [mqtt5_packet.UnsubackReasonCode.Success, mqtt5_packet.UnsubackReasonCode.NoSubscriptionExisted]
            } as mqtt5_packet.UnsubackPacket,
            protocolVersionToMode(protocolVersion));
    })
});

function doPingSequenceTest(mode: model.ProtocolMode, connackDelayMillis: number, responseDelayMillis: number, requestDelayMillis: number) {
    let context : BrokerTestContext = {
        protocolStateConfig: buildProtocolStateConfig(mode)
    };

    context.protocolStateConfig.connectOptions.keepAliveIntervalSeconds = 20;
    context.protocolStateConfig.pingTimeoutMillis = 10000;

    let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
    fixture.advanceFromDisconnected(connackDelayMillis, ProtocolStateType.Connected);

    let currentTime = connackDelayMillis;
    let keepAliveMillis = context.protocolStateConfig.connectOptions.keepAliveIntervalSeconds * 1000;
    let rollingPingTime = currentTime + 20000;

    for (let i = 0; i < 5; i++) {
        expect(fixture.protocolState.getNextOutboundPingElapsedMillis()).toEqual(rollingPingTime);
        expect(fixture.protocolState.getPendingPingrespTimeoutElapsedMillis()).toBeUndefined();
        expect(fixture.protocolState.getNextServiceTimepoint(currentTime)).toEqual(rollingPingTime);
        expect(fixture.toServerPackets.length).toEqual(i + 1); // 1 Connect + i pings

        // trigger a ping, verify it goes out and a pingresp comes back
        currentTime = rollingPingTime + requestDelayMillis;
        let serverResponseBytes = fixture.serviceWithDrain(currentTime);
        expect(fixture.toServerPackets.length).toEqual(i + 2); // 1 Connect + (i + 1) pingreqs

        let [pingreqIndex, ] = findNthPacketOfType(fixture.toServerPackets, mqtt5_packet.PacketType.Pingreq, i + 1);
        expect(pingreqIndex).toEqual(i + 1);

        // verify next service time is the ping timeout
        let pingTimeout = currentTime + context.protocolStateConfig.pingTimeoutMillis;
        expect(fixture.protocolState.getNextServiceTimepoint(currentTime)).toEqual(pingTimeout);
        expect(fixture.protocolState.getPendingPingrespTimeoutElapsedMillis()).toEqual(pingTimeout);

        // receive pingresp, verify timeout reset
        expect(fixture.toClientPackets.length).toEqual(i + 2); // 1 Connack + (i + 1) pingresps
        let [pingrespIndex, ] = findNthPacketOfType(fixture.toClientPackets, mqtt5_packet.PacketType.Pingresp, i + 1);
        expect(pingrespIndex).toEqual(i + 1);

        fixture.onIncomingData(currentTime + responseDelayMillis, serverResponseBytes);
        expect(fixture.protocolState.getPendingPingrespTimeoutElapsedMillis()).toBeUndefined();
        rollingPingTime = currentTime + keepAliveMillis;
    }

    fixture.verifyEmpty();
}

describe("connectedPingSequence", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doPingSequenceTest(protocolVersionToMode(protocolVersion), 0, 0, 0);
    })
});

describe("connectedPingSequenceRespDelayed", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doPingSequenceTest(protocolVersionToMode(protocolVersion), 1, 2500, 0);
    })
});

describe("connectedPingSequenceReqDelayed", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doPingSequenceTest(protocolVersionToMode(protocolVersion), 5, 0, 500);
    })
});

describe("connectedPingSequenceBothDelayed", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doPingSequenceTest(protocolVersionToMode(protocolVersion), 7, 333, 131);
    })
});

function doSubscribeWithAck(fixture: ProtocolTestFixture, subscribeTime: number, subackTime: number, reasonCode: mqtt5_packet.SubackReasonCode) {

    let resultHolder = fixture.subscribe(subscribeTime, {
       subscriptions: [{
           topicFilter: "hello/world",
           qos: mqtt5_packet.QoS.AtLeastOnce
       }]
    });

    expect(resultHolder.state).toEqual(OperationResultStateType.Pending);

    let responseBytes = fixture.serviceWithDrain(subscribeTime);
    fixture.onIncomingData(subackTime, responseBytes);

    let [subscribeIndex, ] = findNthPacketOfType(fixture.toServerPackets, mqtt5_packet.PacketType.Subscribe, 1);
    expect(subscribeIndex).toEqual(1);

    expect(resultHolder.state).toEqual(OperationResultStateType.Success);
    let result = resultHolder.result;
    expect(result).toBeDefined();

    let suback = result as mqtt5_packet.SubackPacket;
    expect(suback.reasonCodes.length).toEqual(1);
    expect(suback.reasonCodes[0]).toEqual(reasonCode);

    let [subackIndex, ] = findNthPacketOfType(fixture.toClientPackets, mqtt5_packet.PacketType.Suback, 1);
    expect(subackIndex).toEqual(1);

    fixture.verifyEmpty();
}

function doUnsubscribeWithAck(fixture: ProtocolTestFixture, unsubscribeTime: number, unsubackTime: number, reasonCode: mqtt5_packet.UnsubackReasonCode) {

    let resultHolder = fixture.unsubscribe(unsubscribeTime, {
        topicFilters: ["hello/world"]
    });

    expect(resultHolder.state).toEqual(OperationResultStateType.Pending);

    let responseBytes = fixture.serviceWithDrain(unsubscribeTime);
    fixture.onIncomingData(unsubackTime, responseBytes);

    let [unsubscribeIndex, ] = findNthPacketOfType(fixture.toServerPackets, mqtt5_packet.PacketType.Unsubscribe, 1);
    expect(unsubscribeIndex).toEqual(1);

    expect(resultHolder.state).toEqual(OperationResultStateType.Success);
    let result = resultHolder.result;
    expect(result).toBeDefined();

    if (fixture.protocolState.getConfig().protocolVersion != model.ProtocolMode.Mqtt311) {
        let unsuback = result as mqtt5_packet.UnsubackPacket;
        expect(unsuback.reasonCodes.length).toEqual(1);
        expect(unsuback.reasonCodes[0]).toEqual(reasonCode);
    }

    let [unsubackIndex, ] = findNthPacketOfType(fixture.toClientPackets, mqtt5_packet.PacketType.Unsuback, 1);
    expect(unsubackIndex).toEqual(1);

    fixture.verifyEmpty();
}

function doPublishWithAck(fixture: ProtocolTestFixture, publishTime: number, pubackTime: number, reasonCode: mqtt5_packet.PubackReasonCode) {

    let resultHolder = fixture.publish(publishTime, {
        topicName: "hello/world",
        qos: mqtt5_packet.QoS.AtLeastOnce
    });

    expect(resultHolder.state).toEqual(OperationResultStateType.Pending);

    let responseBytes = fixture.serviceWithDrain(publishTime);
    fixture.onIncomingData(pubackTime, responseBytes);

    let [publishIndex, ] = findNthPacketOfType(fixture.toServerPackets, mqtt5_packet.PacketType.Publish, 1);
    expect(publishIndex).toEqual(1);

    expect(resultHolder.state).toEqual(OperationResultStateType.Success);
    let result = resultHolder.result;
    expect(result).toBeDefined();

    // @ts-ignore
    let puback : mqtt5_packet.PubackPacket = (result as PublishResult).packet;
    expect(puback.reasonCode).toEqual(reasonCode);

    let [pubackIndex, ] = findNthPacketOfType(fixture.toClientPackets, mqtt5_packet.PacketType.Puback, 1);
    expect(pubackIndex).toEqual(1);

    fixture.verifyEmpty();
}

type AckedOperationFunction<T> = (fixture: ProtocolTestFixture, outboundTime: number, ackTime: number, reasonCode: T) => void;

function doConnectedPingPushOutTest<T>(mode: model.ProtocolMode, operationFunction: AckedOperationFunction<T>, reasonCode: T, operationTime: number, ackTime: number) {
    let context : BrokerTestContext = {
        protocolStateConfig: buildProtocolStateConfig(mode)
    };

    context.protocolStateConfig.connectOptions.keepAliveIntervalSeconds = 20;
    context.protocolStateConfig.pingTimeoutMillis = 10000;
    let keepAliveMillis = context.protocolStateConfig.connectOptions.keepAliveIntervalSeconds * 1000;

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, ProtocolStateType.Connected);

    let baseNextPingTime = keepAliveMillis;
    expect(fixture.getNextServiceTimepoint(ackTime)).toEqual(baseNextPingTime);
    expect(fixture.protocolState.getNextOutboundPingElapsedMillis()).toEqual(baseNextPingTime);

    operationFunction(fixture, operationTime, ackTime, reasonCode);

    let pushedNextPingTime = operationTime + keepAliveMillis;
    expect(fixture.getNextServiceTimepoint(ackTime)).toEqual(pushedNextPingTime);
    expect(fixture.protocolState.getNextOutboundPingElapsedMillis()).toEqual(pushedNextPingTime);

    fixture.verifyEmpty();
}

describe("connectedPingPushOutBySubscribeCompletion", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doConnectedPingPushOutTest(protocolVersionToMode(protocolVersion), doSubscribeWithAck, mqtt5_packet.SubackReasonCode.GrantedQoS1, 1000, 3000);
    })
});

describe("connectedPingPushOutByUnsubscribeCompletion", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doConnectedPingPushOutTest(protocolVersionToMode(protocolVersion), doUnsubscribeWithAck, mqtt5_packet.UnsubackReasonCode.Success, 777, 4200);
    })
});

describe("connectedPingPushOutByPublishCompletion", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doConnectedPingPushOutTest(protocolVersionToMode(protocolVersion), doPublishWithAck, mqtt5_packet.PubackReasonCode.Success, 3456, 5111);
    })
});

/*
 */