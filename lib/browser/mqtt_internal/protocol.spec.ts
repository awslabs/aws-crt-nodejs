/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as encoder from "./encoder";
import * as decoder from "./decoder";
import * as model from "./model";
import * as protocol from "./protocol";
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

type PacketHandlerType = (packet : mqtt5_packet.IPacket, fixture: ProtocolTestFixture, responsePackets : Array<mqtt5_packet.IPacket>) => void;
type PacketHandlerSet = Map<mqtt5_packet.PacketType, PacketHandlerType>;

function defaultConnectHandler(packet : mqtt5_packet.IPacket, fixture: ProtocolTestFixture, responsePackets : Array<mqtt5_packet.IPacket>) {
    let connect = packet as model.ConnectPacketInternal;
    let context = fixture.getContext();

    let connack : mqtt5_packet.ConnackPacket = {
        type: mqtt5_packet.PacketType.Connack,
        reasonCode: context.connackOverrides?.reasonCode ?? mqtt5_packet.ConnectReasonCode.Success,
        sessionPresent: context.connackOverrides?.sessionPresent ?? false
    };

    if (context.protocolStateConfig.protocolVersion == model.ProtocolMode.Mqtt5) {
        if (!connect.clientId || !connect.clientId.length) {
            connack.assignedClientIdentifier = context.connackOverrides?.assignedClientIdentifier ?? `test-${uuid()}`;
        }

        if (context.connackOverrides?.maximumPacketSize) {
            connack.maximumPacketSize = context.connackOverrides?.maximumPacketSize;
        }

        if (context.connackOverrides?.receiveMaximum) {
            connack.receiveMaximum = context.connackOverrides?.receiveMaximum;
        }
    }

    responsePackets.push(connack);
    fixture.cleanStartFlags.push(connect.cleanStart);
}

function defaultSubscribeHandler(packet : mqtt5_packet.IPacket, fixture: ProtocolTestFixture, responsePackets : Array<mqtt5_packet.IPacket>) {
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

function defaultUnsubscribeHandler(packet : mqtt5_packet.IPacket, fixture: ProtocolTestFixture, responsePackets : Array<mqtt5_packet.IPacket>) {
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

function internalPublishHandler(packet : mqtt5_packet.IPacket, fixture: ProtocolTestFixture, responsePackets : Array<mqtt5_packet.IPacket>, reflectPublish : boolean) {
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

function defaultPublishHandler(packet : mqtt5_packet.IPacket, fixture: ProtocolTestFixture, responsePackets : Array<mqtt5_packet.IPacket>) {
    internalPublishHandler(packet, fixture, responsePackets, true);
}

function nonReflectivePublishHandler(packet : mqtt5_packet.IPacket, fixture: ProtocolTestFixture, responsePackets : Array<mqtt5_packet.IPacket>) {
    internalPublishHandler(packet, fixture, responsePackets, false);
}

function defaultPingreqHandler(packet : mqtt5_packet.IPacket, fixture: ProtocolTestFixture, responsePackets : Array<mqtt5_packet.IPacket>) {
    let pingresp : model.PingrespPacketInternal = {
        type: mqtt5_packet.PacketType.Pingresp
    };

    responsePackets.push(pingresp);
}

function throwHandler(packet : mqtt5_packet.IPacket, fixture: ProtocolTestFixture, responsePackets : Array<mqtt5_packet.IPacket>) {
    throw new CrtError("Unexpected packet received");
}

function nullHandler(packet : mqtt5_packet.IPacket, fixture: ProtocolTestFixture, responsePackets : Array<mqtt5_packet.IPacket>) {
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

    cleanStartFlags : Array<boolean> = [];

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

        handler(packet, this, responsePackets);

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

    serviceOnceWithDrain(elapsedMillis: number) : DataView {
        let responseBytes = new DynamicArrayBuffer(4096);

        let toSocket = this.service(elapsedMillis);
        if (!toSocket) {
            return responseBytes.getView();
        }

        this.onWriteCompletion(elapsedMillis);

        responseBytes.append(this.writeToSocket(toSocket));

        return responseBytes.getView();
    }

    serviceOnceRoundTrip(elapsedMillis: number) {
        let responseBytes = this.serviceOnceWithDrain(elapsedMillis);

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
                    result.state = OperationResultStateType.Failure;
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
                    result.state = OperationResultStateType.Failure;
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
                    result.state = OperationResultStateType.Failure;
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
                let fromServer = this.serviceWithDrain(elapsedMillis);
                this.onIncomingData(elapsedMillis, fromServer);
                break;

            case protocol.ProtocolStateType.Disconnected:
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

    getContext() : BrokerTestContext { return this.context; }
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

        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.PendingConnack);

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

        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.PendingConnack);

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
        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.PendingConnack);
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
        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.PendingConnack);
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
        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.PendingConnack);
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
        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.PendingConnack);
        expect(fixture.protocolState.getHalted()).toEqual(false);

        fixture.serviceWithDrain(0);

        fixture.onConnectionClosed(1);
        expect(fixture.protocolState.getHalted()).toEqual(false);
        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.Disconnected);

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
        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.PendingConnack);
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
    handlers.set(mqtt5_packet.PacketType.Connect, (packet : mqtt5_packet.IPacket, fixture: ProtocolTestFixture, responsePackets : Array<mqtt5_packet.IPacket>) => {
        // @ts-ignore
        responsePackets.push(packet);
    });

    let fixture = new ProtocolTestFixture(context, handlers);
    fixture.onConnectionOpened(0);
    expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.PendingConnack);
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

        fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.Connected);
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

        fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.Connected);
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

        fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.Connected);
        expect(fixture.protocolState.getHalted()).toEqual(false);

        fixture.onConnectionClosed(0);

        expect(fixture.protocolState.getHalted()).toEqual(false);
        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.Disconnected);

        fixture.verifyEmpty();
    })
});

describe("connectedIncomingGarbageData", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildProtocolStateConfig(protocolVersionToMode(protocolVersion))
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());

        fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

        expect(fixture.protocolState.getState()).toEqual(protocol.ProtocolStateType.Connected);
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
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

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
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

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
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

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
    fixture.advanceFromDisconnected(connackDelayMillis, protocol.ProtocolStateType.Connected);

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

function doPublish(fixture: ProtocolTestFixture, publishTime: number, pubackTime: number, reasonCode: mqtt5_packet.PubackReasonCode, qos: mqtt5_packet.QoS) {

    let resultHolder = fixture.publish(publishTime, {
        topicName: "hello/world",
        qos: qos
    });

    expect(resultHolder.state).toEqual(OperationResultStateType.Pending);

    let responseBytes = fixture.serviceWithDrain(publishTime);
    fixture.onIncomingData(pubackTime, responseBytes);

    let [publishIndex, ] = findNthPacketOfType(fixture.toServerPackets, mqtt5_packet.PacketType.Publish, 1);
    expect(publishIndex).toEqual(1);

    expect(resultHolder.state).toEqual(OperationResultStateType.Success);

    if (qos == mqtt5_packet.QoS.AtLeastOnce) {
        let result = resultHolder.result;
        expect(result).toBeDefined();

        // @ts-ignore
        let puback : mqtt5_packet.PubackPacket = (result as PublishResult).packet;
        expect(puback.reasonCode).toEqual(reasonCode);

        let [pubackIndex, ] = findNthPacketOfType(fixture.toClientPackets, mqtt5_packet.PacketType.Puback, 1);
        expect(pubackIndex).toEqual(1);
    }

    fixture.verifyEmpty();
}

function doQos1PublishWithAck(fixture: ProtocolTestFixture, publishTime: number, pubackTime: number, reasonCode: mqtt5_packet.PubackReasonCode) {
    doPublish(fixture, publishTime, pubackTime, reasonCode, mqtt5_packet.QoS.AtLeastOnce);
}

function doQos0Publish(fixture: ProtocolTestFixture, publishTime: number, pubackTime: number, reasonCode: mqtt5_packet.PubackReasonCode) {
    doPublish(fixture, publishTime, pubackTime, reasonCode, mqtt5_packet.QoS.AtMostOnce);
}

type AckedOperationFunction<T> = (fixture: ProtocolTestFixture, outboundTime: number, ackTime: number, reasonCode: T) => void;

function doConnectedPingPushOutTest<T>(mode: model.ProtocolMode, operationFunction: AckedOperationFunction<T>, reasonCode: T, operationTime: number, ackTime: number, expectedPushout: number) {
    let context : BrokerTestContext = {
        protocolStateConfig: buildProtocolStateConfig(mode)
    };

    context.protocolStateConfig.connectOptions.keepAliveIntervalSeconds = 20;
    context.protocolStateConfig.pingTimeoutMillis = 10000;
    let keepAliveMillis = context.protocolStateConfig.connectOptions.keepAliveIntervalSeconds * 1000;

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    let baseNextPingTime = keepAliveMillis;
    expect(fixture.getNextServiceTimepoint(ackTime)).toEqual(baseNextPingTime);
    expect(fixture.protocolState.getNextOutboundPingElapsedMillis()).toEqual(baseNextPingTime);

    operationFunction(fixture, operationTime, ackTime, reasonCode);

    let expectedPingTime = keepAliveMillis + expectedPushout;
    expect(fixture.getNextServiceTimepoint(ackTime)).toEqual(expectedPingTime);
    expect(fixture.protocolState.getNextOutboundPingElapsedMillis()).toEqual(expectedPingTime);

    fixture.verifyEmpty();
}

describe("connectedPingPushOutBySubscribeCompletion", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doConnectedPingPushOutTest(protocolVersionToMode(protocolVersion), doSubscribeWithAck, mqtt5_packet.SubackReasonCode.GrantedQoS1, 1000, 3000, 1000);
    })
});

describe("connectedPingPushOutByUnsubscribeCompletion", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doConnectedPingPushOutTest(protocolVersionToMode(protocolVersion), doUnsubscribeWithAck, mqtt5_packet.UnsubackReasonCode.Success, 777, 4200, 777);
    })
});

describe("connectedPingPushOutByQos1PublishCompletion", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doConnectedPingPushOutTest(protocolVersionToMode(protocolVersion), doQos1PublishWithAck, mqtt5_packet.PubackReasonCode.Success, 3456, 5111, 3456);
    })
});

describe("connectedPingNoPushOutByQos0PublishCompletion", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doConnectedPingPushOutTest(protocolVersionToMode(protocolVersion), doQos0Publish, mqtt5_packet.PubackReasonCode.Success, 3456, 5111, 0);
    })
});

function doPingTimeoutTest(mode: model.ProtocolMode, pingTimeoutMillis: number, keepAliveSeconds: number) {
    let context : BrokerTestContext = {
        protocolStateConfig: buildProtocolStateConfig(mode)
    };

    context.protocolStateConfig.connectOptions.keepAliveIntervalSeconds = keepAliveSeconds;
    context.protocolStateConfig.pingTimeoutMillis = pingTimeoutMillis;
    let keepAliveMillis = keepAliveSeconds * 1000;

    let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    let baseNextPingTime = keepAliveMillis;
    expect(fixture.getNextServiceTimepoint(0)).toEqual(baseNextPingTime);
    expect(fixture.protocolState.getNextOutboundPingElapsedMillis()).toEqual(baseNextPingTime);

    fixture.serviceWithDrain(baseNextPingTime);
    let internalPingTimeoutMillis = Math.min(pingTimeoutMillis, keepAliveMillis / 2);
    let expectedPingTimeoutMillis = baseNextPingTime + internalPingTimeoutMillis;
    expect(fixture.protocolState.getPendingPingrespTimeoutElapsedMillis()).toEqual(expectedPingTimeoutMillis);

    expect(fixture.toServerPackets.length).toEqual(2);
    let [pingreqIndex, ] = findNthPacketOfType(fixture.toServerPackets, mqtt5_packet.PacketType.Pingreq, 1);
    expect(pingreqIndex).toEqual(1);

    fixture.service(expectedPingTimeoutMillis - 1);
    expect(fixture.protocolState.getPendingPingrespTimeoutElapsedMillis()).toEqual(expectedPingTimeoutMillis);

    expect(fixture.protocolState.getHalted()).toEqual(false);

    fixture.service(expectedPingTimeoutMillis);

    expect(fixture.protocolState.getHalted()).toEqual(true);
    expect(fixture.protocolState.getHaltError()?.toString()).toMatch("Pingresp timeout");

    fixture.verifyEmpty();
}

describe("connectedPingTimeoutNormal", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doPingTimeoutTest(protocolVersionToMode(protocolVersion), 10000, 20);
    })
});

describe("connectedPingTimeoutMisconfigured", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doPingTimeoutTest(protocolVersionToMode(protocolVersion), 30000, 30);
    })
});

function doConnectedNoPingsIfZeroKeepAlive(mode: model.ProtocolMode) {
    let context : BrokerTestContext = {
        protocolStateConfig: buildProtocolStateConfig(mode)
    };

    context.protocolStateConfig.connectOptions.keepAliveIntervalSeconds = 0;
    context.protocolStateConfig.pingTimeoutMillis = 10000;

    let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    expect(fixture.getNextServiceTimepoint(0)).toBeUndefined();
    expect(fixture.protocolState.getNextOutboundPingElapsedMillis()).toBeUndefined();

    for (let i = 0; i < 120; i++) {
        let elapsedMillis : number = i * 1000;
        fixture.service(elapsedMillis);
        expect(fixture.getNextServiceTimepoint(elapsedMillis)).toBeUndefined();
        expect(fixture.protocolState.getNextOutboundPingElapsedMillis()).toBeUndefined();
        expect(fixture.toServerPackets.length).toEqual(1);
        expect(fixture.toClientPackets.length).toEqual(1);
        fixture.verifyEmpty();
    }
}

describe("connectedNoPingsIfZeroKeepAlive", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doConnectedNoPingsIfZeroKeepAlive(protocolVersionToMode(protocolVersion));
    })
});

function doSuccessfulOperationTest<T>(mode: model.ProtocolMode, operationFunction: AckedOperationFunction<T>, reasonCode: T) {
    let context : BrokerTestContext = {
        protocolStateConfig: buildProtocolStateConfig(mode)
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    operationFunction(fixture, 0, 100, reasonCode);
}

describe("connectedSubscribeSucccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doSuccessfulOperationTest(protocolVersionToMode(protocolVersion), doSubscribeWithAck, mqtt5_packet.SubackReasonCode.GrantedQoS1);
    })
});

describe("connectedUnsubscribeSucccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doSuccessfulOperationTest(protocolVersionToMode(protocolVersion), doUnsubscribeWithAck, mqtt5_packet.UnsubackReasonCode.Success);
    })
});

describe("connectedQos0PublishSucccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doSuccessfulOperationTest(protocolVersionToMode(protocolVersion), doQos0Publish, mqtt5_packet.PubackReasonCode.Success);
    })
});

describe("connectedQos1PublishSucccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doSuccessfulOperationTest(protocolVersionToMode(protocolVersion), doQos1PublishWithAck, mqtt5_packet.PubackReasonCode.Success);
    })
});

type QueueOperationFunction<T> = (fixture: ProtocolTestFixture, operationQueueTime: number) => OperationResult<T>;
type ResultVerifier<T> = (result: OperationResult<T>) => void;

enum InterruptedOperationOutcomeType {
    StayQueued,
    FailedOnDisconnect,
    FailedOnReconnect
}

function doReconnectWhileUserOperationQueuedTest<T>(mode: model.ProtocolMode, offlineQueuePolicy: protocol.OfflineQueuePolicy, queueOperationFunction: QueueOperationFunction<T>, operationOutcome: InterruptedOperationOutcomeType, verifier?: ResultVerifier<T>) {
    let config = buildProtocolStateConfig(mode);
    config.offlineQueuePolicy = offlineQueuePolicy;

    let context : BrokerTestContext = {
        protocolStateConfig: config
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    let result = queueOperationFunction(fixture, 0);
    expect(result.state).toEqual(OperationResultStateType.Pending);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

    fixture.onConnectionClosed(0);

    if (operationOutcome == InterruptedOperationOutcomeType.FailedOnDisconnect) {
        expect(result.state).toEqual(OperationResultStateType.Failure);
        expect(result.error?.toString()).toMatch("failed OfflineQueuePolicy");
        fixture.verifyEmpty();
        return;
    }

    expect(result.state).toEqual(OperationResultStateType.Pending);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    if (operationOutcome == InterruptedOperationOutcomeType.FailedOnReconnect) {
        expect(result.state).toEqual(OperationResultStateType.Failure);
        expect(result.error?.toString()).toMatch("failed OfflineQueuePolicy");
    } else {
        expect(operationOutcome).toEqual(InterruptedOperationOutcomeType.StayQueued);
        expect(result.state).toEqual(OperationResultStateType.Pending);
        expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

        fixture.serviceRoundTrip(0);

        expect(verifier).toBeDefined();
        // @ts-ignore
        verifier(result);
    }

    fixture.verifyEmpty();
}

function verifySuccessfulSuback(result: OperationResult<mqtt5_packet.SubackPacket>) : void {
    expect(result.state).toEqual(OperationResultStateType.Success);

    let suback = result.result as mqtt5_packet.SubackPacket;
    expect(suback.reasonCodes.length).toEqual(1);
    expect(suback.reasonCodes[0]).toEqual(mqtt5_packet.SubackReasonCode.GrantedQoS1);
}

function queueSubscribe(fixture: ProtocolTestFixture, operationQueueTime: number) : OperationResult<mqtt5_packet.SubackPacket> {
    return fixture.subscribe(operationQueueTime, {
        type: mqtt5_packet.PacketType.Subscribe,
        subscriptions: [
            {
                topicFilter: "hello/world",
                qos: mqtt5_packet.QoS.AtLeastOnce
            }
        ],
    });
}

describe("ReconnectWhileSubscribeQueuedSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueSubscribe, InterruptedOperationOutcomeType.StayQueued, verifySuccessfulSuback);
    })
});

describe("ReconnectWhileSubscribeQueuedFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueSubscribe, InterruptedOperationOutcomeType.FailedOnDisconnect);
    })
});

function verifySuccessfulUnsuback5(result: OperationResult<mqtt5_packet.UnsubackPacket>) : void {
    expect(result.state).toEqual(OperationResultStateType.Success);

    let unsuback = result.result as mqtt5_packet.UnsubackPacket;
    expect(unsuback.reasonCodes.length).toEqual(1);
    expect(unsuback.reasonCodes[0]).toEqual(mqtt5_packet.UnsubackReasonCode.Success);
}

function verifySuccessfulUnsuback311(result: OperationResult<mqtt5_packet.UnsubackPacket>) : void {
    expect(result.state).toEqual(OperationResultStateType.Success);

    let unsuback = result.result as mqtt5_packet.UnsubackPacket;
    expect(unsuback.reasonCodes.length).toEqual(0);
}

function verifySuccessfulUnsuback(result: OperationResult<mqtt5_packet.UnsubackPacket>, mode: model.ProtocolMode) : void {
    if (mode == model.ProtocolMode.Mqtt5) {
        verifySuccessfulUnsuback5(result);
    } else {
        verifySuccessfulUnsuback311(result);
    }
}

function queueUnsubscribe(fixture: ProtocolTestFixture, operationQueueTime: number) : OperationResult<mqtt5_packet.UnsubackPacket> {
    return fixture.unsubscribe(operationQueueTime, {
        type: mqtt5_packet.PacketType.Unsubscribe,
        topicFilters: [ "hello/world" ],
    });
}

describe("ReconnectWhileUnsubscribeQueuedSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doReconnectWhileUserOperationQueuedTest(mode, protocol.OfflineQueuePolicy.PreserveAll, queueUnsubscribe, InterruptedOperationOutcomeType.StayQueued,
            (result: OperationResult<mqtt5_packet.UnsubackPacket>) => { verifySuccessfulUnsuback(result, mode); });
    })
});

describe("ReconnectWhileUnsubscribeQueuedFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueUnsubscribe, InterruptedOperationOutcomeType.FailedOnDisconnect);
    })
});


function verifySuccessfulPuback5(result: OperationResult<protocol.PublishResult>) : void {
    expect(result.state).toEqual(OperationResultStateType.Success);

    let puback = result.result!.packet as mqtt5_packet.PubackPacket;
    expect(puback.reasonCode).toEqual(mqtt5_packet.PubackReasonCode.Success);
}

function verifySuccessfulPuback311(result: OperationResult<protocol.PublishResult>) : void {
    expect(result.state).toEqual(OperationResultStateType.Success);
}

function verifySuccessfulPuback(result: OperationResult<protocol.PublishResult>, mode: model.ProtocolMode) : void {
    if (mode == model.ProtocolMode.Mqtt5) {
        verifySuccessfulPuback5(result);
    } else {
        verifySuccessfulPuback311(result);
    }
}

function queueQos1Publish(fixture: ProtocolTestFixture, operationQueueTime: number) : OperationResult<protocol.PublishResult> {
    return fixture.publish(operationQueueTime, {
        type: mqtt5_packet.PacketType.Publish,
        topicName: "hello/world",
        qos: mqtt5_packet.QoS.AtLeastOnce,
    });
}

describe("ReconnectWhileQos1PublishQueuedSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doReconnectWhileUserOperationQueuedTest(mode, protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueQos1Publish, InterruptedOperationOutcomeType.StayQueued,
            (result: OperationResult<protocol.PublishResult>) => { verifySuccessfulPuback(result, mode); });
    })
});

describe("ReconnectWhileQos1PublishQueuedFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueQos1Publish, InterruptedOperationOutcomeType.FailedOnDisconnect);
    })
});

function verifySuccessfulQos0Publish(result: OperationResult<protocol.PublishResult>) : void {
    expect(result.state).toEqual(OperationResultStateType.Success);
}

function queueQos0Publish(fixture: ProtocolTestFixture, operationQueueTime: number) : OperationResult<protocol.PublishResult> {
    return fixture.publish(operationQueueTime, {
        type: mqtt5_packet.PacketType.Publish,
        topicName: "hello/world",
        qos: mqtt5_packet.QoS.AtMostOnce,
    });
}

describe("ReconnectWhileQos0PublishQueuedSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doReconnectWhileUserOperationQueuedTest(mode, protocol.OfflineQueuePolicy.PreserveAll, queueQos0Publish, InterruptedOperationOutcomeType.StayQueued, verifySuccessfulQos0Publish);
    })
});

describe("ReconnectWhileQos0PublishQueuedFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueQos0Publish, InterruptedOperationOutcomeType.FailedOnDisconnect);
    })
});

function doReconnectWhileOperationCurrentTest<T>(mode: model.ProtocolMode, offlineQueuePolicy: protocol.OfflineQueuePolicy, queueOperationFunction: QueueOperationFunction<T>, operationOutcome: InterruptedOperationOutcomeType, verifier?: ResultVerifier<T>) {
    let config = buildProtocolStateConfig(mode);
    config.offlineQueuePolicy = offlineQueuePolicy;

    let context : BrokerTestContext = {
        protocolStateConfig: config
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    let result = queueOperationFunction(fixture, 0);
    expect(result.state).toEqual(OperationResultStateType.Pending);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

    fixture.service(0);

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    expect(fixture.protocolState.getCurrentOperation()).toBeDefined();

    fixture.onConnectionClosed(0);

    expect(fixture.protocolState.getCurrentOperation()).toBeUndefined();

    if (operationOutcome == InterruptedOperationOutcomeType.FailedOnDisconnect) {
        expect(result.state).toEqual(OperationResultStateType.Failure);
        expect(result.error?.toString()).toMatch("failed OfflineQueuePolicy");
        fixture.verifyEmpty();
        return;
    }

    expect(result.state).toEqual(OperationResultStateType.Pending);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    if (operationOutcome == InterruptedOperationOutcomeType.FailedOnReconnect) {
        expect(result.state).toEqual(OperationResultStateType.Failure);
        expect(result.error?.toString()).toMatch("failed OfflineQueuePolicy");
    } else {
        expect(operationOutcome).toEqual(InterruptedOperationOutcomeType.StayQueued);
        expect(result.state).toEqual(OperationResultStateType.Pending);
        expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

        // packets have been set up to be split across two services by having a length > 4k and < 8k
        fixture.serviceOnceRoundTrip(0);
        expect(fixture.protocolState.getCurrentOperation()).toBeDefined();
        fixture.serviceOnceRoundTrip(0);
        expect(fixture.protocolState.getCurrentOperation()).toBeUndefined();

        expect(verifier).toBeDefined();
        // @ts-ignore
        verifier(result);
    }

    fixture.verifyEmpty();
}

function queueMultiServiceSubscribe(fixture: ProtocolTestFixture, operationQueueTime: number) : OperationResult<mqtt5_packet.SubackPacket> {
    return fixture.subscribe(operationQueueTime, {
        type: mqtt5_packet.PacketType.Subscribe,
        subscriptions: [
            {
                topicFilter: "a".repeat(5000),
                qos: mqtt5_packet.QoS.AtLeastOnce
            }
        ],
    });
}

describe("ReconnectWhileSubscribeCurrentOperationSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueMultiServiceSubscribe, InterruptedOperationOutcomeType.StayQueued, verifySuccessfulSuback);
    })
});

describe("ReconnectWhileSubscribeCurrentOperationFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueMultiServiceSubscribe, InterruptedOperationOutcomeType.FailedOnDisconnect);
    })
});

function queueMultiServiceUnsubscribe(fixture: ProtocolTestFixture, operationQueueTime: number) : OperationResult<mqtt5_packet.UnsubackPacket> {
    return fixture.unsubscribe(operationQueueTime, {
        type: mqtt5_packet.PacketType.Unsubscribe,
        topicFilters: [ "a".repeat(5000) ],
    });
}

describe("ReconnectWhileUnsubscribeCurrentOperationSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doReconnectWhileOperationCurrentTest(mode, protocol.OfflineQueuePolicy.PreserveAll, queueMultiServiceUnsubscribe, InterruptedOperationOutcomeType.StayQueued,
            (result: OperationResult<mqtt5_packet.UnsubackPacket>) => { verifySuccessfulUnsuback(result, mode); });
    })
});

describe("ReconnectWhileUnsubscribeCurrentOperationFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueMultiServiceUnsubscribe, InterruptedOperationOutcomeType.FailedOnDisconnect);
    })
});

function queueMultiServiceQos1Publish(fixture: ProtocolTestFixture, operationQueueTime: number) : OperationResult<protocol.PublishResult> {
    return fixture.publish(operationQueueTime, {
        type: mqtt5_packet.PacketType.Publish,
        topicName: "a".repeat(5000),
        qos: mqtt5_packet.QoS.AtLeastOnce,
    });
}

describe("ReconnectWhileQos1PublishCurrentOperationSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doReconnectWhileOperationCurrentTest(mode, protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueMultiServiceQos1Publish, InterruptedOperationOutcomeType.StayQueued,
            (result: OperationResult<protocol.PublishResult>) => { verifySuccessfulPuback(result, mode); });
    })
});

describe("ReconnectWhileQos1PublishCurrentOperationFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueMultiServiceQos1Publish, InterruptedOperationOutcomeType.FailedOnDisconnect);
    })
});

function queueMultiServiceQos0Publish(fixture: ProtocolTestFixture, operationQueueTime: number) : OperationResult<protocol.PublishResult> {
    return fixture.publish(operationQueueTime, {
        type: mqtt5_packet.PacketType.Publish,
        topicName: "a".repeat(5000),
        qos: mqtt5_packet.QoS.AtMostOnce,
    });
}

describe("ReconnectWhileQos0PublishCurrentOperationSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doReconnectWhileOperationCurrentTest(mode, protocol.OfflineQueuePolicy.PreserveAll, queueMultiServiceQos0Publish, InterruptedOperationOutcomeType.StayQueued, verifySuccessfulQos0Publish);
    })
});

describe("ReconnectWhileQos0PublishCurrentOperationFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueMultiServiceQos0Publish, InterruptedOperationOutcomeType.FailedOnDisconnect);
    })
});

type VerifyPendingFunction = (fixture: ProtocolTestFixture) => void;

function doReconnectWhileUserOperationPendingTest<T>(mode: model.ProtocolMode, offlineQueuePolicy: protocol.OfflineQueuePolicy, queueOperationFunction: QueueOperationFunction<T>, verifyPendingFunction: VerifyPendingFunction, operationOutcome: InterruptedOperationOutcomeType, verifier: ResultVerifier<T> | null, sessionPresent: boolean) {
    let config = buildProtocolStateConfig(mode);
    config.offlineQueuePolicy = offlineQueuePolicy;

    let context : BrokerTestContext = {
        protocolStateConfig: config,
        connackOverrides: {
            sessionPresent: sessionPresent,
            reasonCode: mqtt5_packet.ConnectReasonCode.Success
        }
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    let result = queueOperationFunction(fixture, 0);
    expect(result.state).toEqual(OperationResultStateType.Pending);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

    fixture.service(0);
    verifyPendingFunction(fixture);

    fixture.onConnectionClosed(0);

    if (operationOutcome == InterruptedOperationOutcomeType.FailedOnDisconnect) {
        expect(result.state).toEqual(OperationResultStateType.Failure);
        expect(result.error?.toString()).toMatch("failed OfflineQueuePolicy check on disconnect");
        fixture.verifyEmpty();
        return;
    }

    expect(result.state).toEqual(OperationResultStateType.Pending);

    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    if (operationOutcome == InterruptedOperationOutcomeType.FailedOnReconnect) {
        expect(result.state).toEqual(OperationResultStateType.Failure);
        expect(result.error?.toString()).toMatch("failed OfflineQueuePolicy check on reconnect");
    } else {
        expect(operationOutcome).toEqual(InterruptedOperationOutcomeType.StayQueued);
        expect(result.state).toEqual(OperationResultStateType.Pending);

        fixture.serviceRoundTrip(0);

        expect(verifier).toBeDefined();
        // @ts-ignore
        verifier(result);
    }

    fixture.verifyEmpty();
}

function verifyPendingAck(fixture: ProtocolTestFixture) {
    expect(fixture.protocolState.getPendingNonPublishAcks().size).toEqual(1);
}

describe("ReconnectNoSessionWhileSubscribePendingAckSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueSubscribe, verifyPendingAck, InterruptedOperationOutcomeType.StayQueued, verifySuccessfulSuback, false);
    })
});

describe("ReconnectSessionPresentWhileSubscribePendingAckSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueSubscribe, verifyPendingAck, InterruptedOperationOutcomeType.StayQueued, verifySuccessfulSuback, true);
    })
});

describe("ReconnectNoSessionWhileSubscribePendingAckFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueSubscribe, verifyPendingAck, InterruptedOperationOutcomeType.FailedOnDisconnect, null, false);
    })
});

describe("ReconnectSessionPresentWhileSubscribePendingAckFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueSubscribe, verifyPendingAck, InterruptedOperationOutcomeType.FailedOnDisconnect, null, true);
    })
});

describe("ReconnectNoSessionWhileUnsubscribePendingAckSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doReconnectWhileUserOperationPendingTest(mode, protocol.OfflineQueuePolicy.PreserveAll, queueUnsubscribe, verifyPendingAck, InterruptedOperationOutcomeType.StayQueued,
            (result: OperationResult<mqtt5_packet.UnsubackPacket>) => { verifySuccessfulUnsuback(result, mode); }, false);
    })
});

describe("ReconnectSessionPresentWhileUnsubscribePendingAckSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doReconnectWhileUserOperationPendingTest(mode, protocol.OfflineQueuePolicy.PreserveAll, queueUnsubscribe, verifyPendingAck, InterruptedOperationOutcomeType.StayQueued,
            (result: OperationResult<mqtt5_packet.UnsubackPacket>) => { verifySuccessfulUnsuback(result, mode); }, true);
    })
});

describe("ReconnectNoSessionWhileUnsubscribePendingAckFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueUnsubscribe, verifyPendingAck, InterruptedOperationOutcomeType.FailedOnDisconnect, null, false);
    })
});

describe("ReconnectSessionPresentWhileUnsubscribePendingAckFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueUnsubscribe, verifyPendingAck, InterruptedOperationOutcomeType.FailedOnDisconnect, null, true);
    })
});

function verifyPendingWriteCompleteOperation(fixture: ProtocolTestFixture) {
    expect(fixture.protocolState.getPendingWriteCompletionOperations().length).toEqual(1);
}

describe("ReconnectNoSessionWhileQos0PublishPendingAckSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueQos0Publish, verifyPendingWriteCompleteOperation, InterruptedOperationOutcomeType.StayQueued, verifySuccessfulQos0Publish, false);
    })
});

describe("ReconnectSessionPresentWhileQos0PublishPendingAckSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueQos0Publish, verifyPendingWriteCompleteOperation, InterruptedOperationOutcomeType.StayQueued, verifySuccessfulQos0Publish, true);
    })
});

describe("ReconnectNoSessionWhileQos0PublishPendingAckFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueQos0Publish, verifyPendingWriteCompleteOperation, InterruptedOperationOutcomeType.FailedOnDisconnect, null, false);
    })
});

describe("ReconnectSessionPresentWhileQos0PublishPendingAckFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doReconnectWhileUserOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueQos0Publish, verifyPendingWriteCompleteOperation, InterruptedOperationOutcomeType.FailedOnDisconnect, null, true);
    })
});

function verifyPendingQos1PublishOperation(fixture: ProtocolTestFixture) {
    expect(fixture.protocolState.getPendingPublishAcks().size).toEqual(1);
}

describe("ReconnectNoSessionWhileQos1PublishPendingAckSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doReconnectWhileUserOperationPendingTest(mode, protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueQos1Publish, verifyPendingQos1PublishOperation, InterruptedOperationOutcomeType.StayQueued,
            (result: OperationResult<protocol.PublishResult>) => { verifySuccessfulPuback(result, mode); },
            false);
    })
});

describe("ReconnectSessionPresentWhileQos1PublishPendingAckSuccessTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doReconnectWhileUserOperationPendingTest(mode, protocol.OfflineQueuePolicy.PreserveNothing, queueQos1Publish, verifyPendingQos1PublishOperation, InterruptedOperationOutcomeType.StayQueued,
            (result: OperationResult<protocol.PublishResult>) => { verifySuccessfulPuback(result, mode); },
            true);
    })
});

describe("ReconnectNoSessionWhileQos1PublishPendingAckFailureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        let mode = protocolVersionToMode(protocolVersion);
        doReconnectWhileUserOperationPendingTest(mode, protocol.OfflineQueuePolicy.PreserveNothing, queueQos1Publish, verifyPendingQos1PublishOperation, InterruptedOperationOutcomeType.FailedOnReconnect,
            null,
            false);
    })
});

function doOperationInternalValidationFailureTest<T>(queueOperationFunction: QueueOperationFunction<T>, failureVerifier: ResultVerifier<T>) {
    let config = buildProtocolStateConfig(model.ProtocolMode.Mqtt5);

    let context : BrokerTestContext = {
        protocolStateConfig: config,
        connackOverrides: {
            sessionPresent: false,
            reasonCode: mqtt5_packet.ConnectReasonCode.Success,
            maximumPacketSize: 6
        }
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    let result = queueOperationFunction(fixture, 0);
    expect(result.state).toEqual(OperationResultStateType.Pending);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

    fixture.service(0);
    failureVerifier(result);

    fixture.verifyEmpty();
}

function verifyValidationFailure<T>(result: OperationResult<T>) {
    expect(result.state).toEqual(OperationResultStateType.Failure);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toMatch("outbound packet validation failed");
}

test("SubscribeInternalOutboundValidationFailure", () => {
    doOperationInternalValidationFailureTest(queueSubscribe, verifyValidationFailure);
});

test("UnsubscribeInternalOutboundValidationFailure", () => {
    doOperationInternalValidationFailureTest(queueUnsubscribe, verifyValidationFailure);
});

test("PublishInternalOutboundValidationFailure", () => {
    doOperationInternalValidationFailureTest(queueQos1Publish, verifyValidationFailure);
});

function doOperationTimeoutFailureTest<T>(mode: model.ProtocolMode, queueOperationFunction: QueueOperationFunction<T>, pendingVerifier: VerifyPendingFunction) {
    let config = buildProtocolStateConfig(mode);
    config.connectOptions.keepAliveIntervalSeconds = 0;

    let context : BrokerTestContext = {
        protocolStateConfig: config,
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nullHandler);
    brokerHandlers.set(mqtt5_packet.PacketType.Subscribe, nullHandler);
    brokerHandlers.set(mqtt5_packet.PacketType.Unsubscribe, nullHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    let result = queueOperationFunction(fixture, 0);
    expect(result.state).toEqual(OperationResultStateType.Pending);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

    fixture.serviceRoundTrip(0);
    pendingVerifier(fixture);

    for (let i = 0; i < 30; i++) {
        let currentMillis = i * 1000;
        fixture.service(currentMillis);

        expect(result.state).toEqual(OperationResultStateType.Pending);
        expect(fixture.protocolState.getNextServiceTimepoint(currentMillis)).toEqual(30 * 1000);
    }

    fixture.service(30 * 1000 - 1);
    expect(result.state).toEqual(OperationResultStateType.Pending);

    fixture.service(30 * 1000);
    expect(result.state).toEqual(OperationResultStateType.Failure);
    expect(result.error?.toString()).toMatch("Operation timed out");

    fixture.verifyEmpty();
}

function queueSubscribeWithTimeout(fixture: ProtocolTestFixture) : OperationResult<mqtt5_packet.SubackPacket> {
    return fixture.subscribe(0, {
        subscriptions: [
            {
                topicFilter: "a/b/c/hello",
                qos: mqtt5_packet.QoS.AtMostOnce
            }
        ]
    }, {
        timeoutInMillis: 30000
    });
}

describe("SubscribeTimeoutFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOperationTimeoutFailureTest(protocolVersionToMode(protocolVersion), queueSubscribeWithTimeout, verifyPendingAck);
    })
});

function queueUnsubscribeWithTimeout(fixture: ProtocolTestFixture) : OperationResult<mqtt5_packet.UnsubackPacket> {
    return fixture.unsubscribe(0, {
        topicFilters: [ "a/b/c/hello" ]
    }, {
        timeoutInMillis: 30000
    });
}

describe("UnsubscribeTimeoutFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOperationTimeoutFailureTest(protocolVersionToMode(protocolVersion), queueUnsubscribeWithTimeout, verifyPendingAck);
    })
});

function queueQos1PublishWithTimeout(fixture: ProtocolTestFixture) : OperationResult<protocol.PublishResult> {
    return fixture.publish(0, {
        topicName: "a/b/c/hello",
        qos: mqtt5_packet.QoS.AtLeastOnce
    }, {
        timeoutInMillis: 30000
    });
}

describe("PublishTimeoutFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOperationTimeoutFailureTest(protocolVersionToMode(protocolVersion), queueQos1PublishWithTimeout, verifyPendingQos1PublishOperation);
    })
});

function doOfflineSubmitTest<T>(mode: model.ProtocolMode, offlineQueuePolicy: protocol.OfflineQueuePolicy, queueOperationFunction: QueueOperationFunction<T>, shouldFail: boolean) {
    let config = buildProtocolStateConfig(mode);
    config.offlineQueuePolicy = offlineQueuePolicy;

    let context : BrokerTestContext = {
        protocolStateConfig: config,
    };

    let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    let result = queueOperationFunction(fixture, 0);

    if (shouldFail) {
        expect(result.state).toEqual(OperationResultStateType.Failure);
        expect(result.error?.toString()).toMatch("did not pass offline queue policy");

        fixture.verifyEmpty();
    } else {
        expect(result.state).toEqual(OperationResultStateType.Pending);
    }
}

describe("SubscribeOfflineSubmitPreserveAllSuccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueSubscribe, false);
    })
});

describe("SubscribeOfflineSubmitPreserveAcknowledgedSuccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueSubscribe, false);
    })
});

describe("SubscribeOfflineSubmitPreserveQos1Failure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueSubscribe, true);
    })
});

describe("SubscribeOfflineSubmitPreserveNothingFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueSubscribe, true);
    })
});

describe("UnsubscribeOfflineSubmitPreserveAllSuccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueUnsubscribe, false);
    })
});

describe("UnsubscribeOfflineSubmitPreserveAcknowledgedSuccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueUnsubscribe, false);
    })
});

describe("UnsubscribeOfflineSubmitPreserveQos1Failure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueUnsubscribe, true);
    })
});

describe("UnsubscribeOfflineSubmitPreserveNothingFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueUnsubscribe, true);
    })
});

describe("Qos0PublishOfflineSubmitPreserveAllSuccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueQos0Publish, false);
    })
});

describe("Qos0PublishOfflineSubmitPreserveAcknowledgedFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueQos0Publish, true);
    })
});

describe("Qos0PublishOfflineSubmitPreserveQos1Failure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueQos0Publish, true);
    })
});

describe("Qos0PublishOfflineSubmitPreserveNothingFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueQos0Publish, true);
    })
});

describe("Qos1PublishOfflineSubmitPreserveAllSuccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueQos1Publish, false);
    })
});

describe("Qos1PublishOfflineSubmitPreserveAcknowledgedSuccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueQos1Publish, false);
    })
});

describe("Qos1PublishOfflineSubmitPreserveQos1Success", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueQos1Publish, false);
    })
});

describe("Qos1PublishOfflineSubmitPreserveNothingFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOfflineSubmitTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueQos1Publish, true);
    })
});

function doDisconnectWhileUserOperationQueuedTest<T>(mode: model.ProtocolMode, offlineQueuePolicy: protocol.OfflineQueuePolicy, queueOperationFunction: QueueOperationFunction<T>, shouldFail: boolean) {
    let config = buildProtocolStateConfig(mode);
    config.offlineQueuePolicy = offlineQueuePolicy;

    let context : BrokerTestContext = {
        protocolStateConfig: config
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    let result = queueOperationFunction(fixture, 0);
    expect(result.state).toEqual(OperationResultStateType.Pending);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

    fixture.onConnectionClosed(0);

    if (shouldFail) {
        expect(result.state).toEqual(OperationResultStateType.Failure);
        expect(result.error?.toString()).toMatch("failed OfflineQueuePolicy");
        fixture.verifyEmpty();
    } else {
        expect(result.state).toEqual(OperationResultStateType.Pending);
    }
}

describe("SubscribePreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueSubscribe, false);
    })
});

describe("SubscribePreserveAcknowledgedDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueSubscribe, false);
    })
});

describe("SubscribePreserveQos1DisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueSubscribe, true);
    })
});

describe("SubscribePreserveNothingDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueSubscribe, true);
    })
});

describe("UnsubscribePreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueUnsubscribe, false);
    })
});

describe("UnsubscribePreserveAcknowledgedDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueUnsubscribe, false);
    })
});

describe("UnsubscribePreserveQos1DisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueUnsubscribe, true);
    })
});

describe("UnsubscribePreserveNothingDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueUnsubscribe, true);
    })
});

describe("Qos0PublishPreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueQos0Publish, false);
    })
});

describe("Qos0PublishPreserveAcknowledgedDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueQos0Publish, true);
    })
});

describe("Qos0PublishPreserveQos1DisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueQos0Publish, true);
    })
});

describe("Qos0PublishPreserveNothingDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueQos0Publish, true);
    })
});

describe("Qos1PublishPreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueQos1Publish, false);
    })
});

describe("Qos1PublishPreserveAcknowledgedDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueQos1Publish, false);
    })
});

describe("Qos1PublishPreserveQos1DisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueQos1Publish, false);
    })
});

describe("Qos1PublishPreserveNothingDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileUserOperationQueuedTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueQos1Publish, true);
    })
});

function doDisconnectWhileOperationCurrentTest<T>(mode: model.ProtocolMode, offlineQueuePolicy: protocol.OfflineQueuePolicy, queueOperationFunction: QueueOperationFunction<T>, shouldFail: boolean) {
    let config = buildProtocolStateConfig(mode);
    config.offlineQueuePolicy = offlineQueuePolicy;

    let context : BrokerTestContext = {
        protocolStateConfig: config
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    let result = queueOperationFunction(fixture, 0);
    expect(result.state).toEqual(OperationResultStateType.Pending);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

    fixture.service(0);

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    expect(fixture.protocolState.getCurrentOperation()).toBeDefined();

    fixture.onConnectionClosed(0);

    expect(fixture.protocolState.getCurrentOperation()).toBeUndefined();

    if (shouldFail) {
        expect(result.state).toEqual(OperationResultStateType.Failure);
        expect(result.error?.toString()).toMatch("failed OfflineQueuePolicy");
        fixture.verifyEmpty();
    } else {
        expect(result.state).toEqual(OperationResultStateType.Pending);
    }
}

describe("CurrentOperationSubscribePreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueMultiServiceSubscribe, false);
    })
});

describe("CurrentOperationSubscribePreserveAcknowledgedDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueMultiServiceSubscribe, false);
    })
});

describe("CurrentOperationSubscribePreserveQos1OnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueMultiServiceSubscribe, true);
    })
});

describe("CurrentOperationSubscribePreserveNothingOnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueMultiServiceSubscribe, true);
    })
});

describe("CurrentOperationUnsubscribePreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueMultiServiceUnsubscribe, false);
    })
});

describe("CurrentOperationUnsubscribePreserveAcknowledgedDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueMultiServiceUnsubscribe, false);
    })
});

describe("CurrentOperationUnsubscribePreserveQos1OnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueMultiServiceUnsubscribe, true);
    })
});

describe("CurrentOperationUnsubscribePreserveNothingOnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueMultiServiceUnsubscribe, true);
    })
});

describe("CurrentOperationQos0PublishPreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueMultiServiceQos0Publish, false);
    })
});

describe("CurrentOperationQos0PublishPreserveAcknowledgedDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueMultiServiceQos0Publish, true);
    })
});

describe("CurrentOperationQos0PublishPreserveQos1OnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueMultiServiceQos0Publish, true);
    })
});

describe("CurrentOperationQos0PublishPreserveNothingOnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueMultiServiceQos0Publish, true);
    })
});

describe("CurrentOperationQos1PublishPreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueMultiServiceQos1Publish, false);
    })
});

describe("CurrentOperationQos1PublishPreserveAcknowledgedDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueMultiServiceQos1Publish, false);
    })
});

describe("CurrentOperationQos1PublishPreserveQos1OnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueMultiServiceQos1Publish, false);
    })
});

describe("CurrentOperationQos1PublishPreserveNothingOnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationCurrentTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueMultiServiceQos1Publish, true);
    })
});


function doDisconnectWhileOperationPendingTest<T>(mode: model.ProtocolMode, offlineQueuePolicy: protocol.OfflineQueuePolicy, queueOperationFunction: QueueOperationFunction<T>, shouldFail: boolean) {
    let config = buildProtocolStateConfig(mode);
    config.offlineQueuePolicy = offlineQueuePolicy;

    let context : BrokerTestContext = {
        protocolStateConfig: config,
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    let result = queueOperationFunction(fixture, 0);
    expect(result.state).toEqual(OperationResultStateType.Pending);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

    fixture.service(0);
    expect(fixture.protocolState.getPendingPublishAcks().size + fixture.protocolState.getPendingNonPublishAcks().size + fixture.protocolState.getPendingWriteCompletionOperations().length).toEqual(1);

    fixture.onConnectionClosed(0);

    if (shouldFail) {
        expect(result.state).toEqual(OperationResultStateType.Failure);
        expect(result.error?.toString()).toMatch("failed OfflineQueuePolicy check on disconnect");
        fixture.verifyEmpty();
    } else {
        expect(result.state).toEqual(OperationResultStateType.Pending);
    }
}

describe("PendingOperationSubscribePreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueSubscribe, false);
    })
});

describe("PendingOperationSubscribePreserveAcknowledgedDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueSubscribe, false);
    })
});

describe("PendingOperationSubscribePreserveQos1OnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueSubscribe, true);
    })
});

describe("PendingOperationSubscribePreserveNothingOnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueSubscribe, true);
    })
});

describe("PendingOperationUnsubscribePreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueUnsubscribe, false);
    })
});

describe("PendingOperationUnsubscribePreserveAcknowledgedDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueUnsubscribe, false);
    })
});

describe("PendingOperationUnsubscribePreserveQos1OnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueUnsubscribe, true);
    })
});

describe("PendingOperationUnsubscribePreserveNothingOnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueUnsubscribe, true);
    })
});

describe("PendingOperationQos0PublishPreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueQos0Publish, false);
    })
});

describe("PendingOperationQos0PublishPreserveAcknowledgedDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueQos0Publish, true);
    })
});

describe("PendingOperationQos0PublishPreserveQos1OnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueQos0Publish, true);
    })
});

describe("PendingOperationQos0PublishPreserveNothingOnDisconnectFailure", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueQos0Publish, true);
    })
});

describe("PendingOperationQos1PublishPreserveAllOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAll, queueQos1Publish, false);
    })
});

describe("PendingOperationQos1PublishPreserveAcknowledgedDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveAcknowledged, queueQos1Publish, false);
    })
});

describe("PendingOperationQos1PublishPreserveQos1OnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes, queueQos1Publish, false);
    })
});

// doesn't fail because we have to check session resumption on reconnect before failure
describe("PendingOperationQos1PublishPreserveNothingOnDisconnectPending", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileOperationPendingTest(protocolVersionToMode(protocolVersion), protocol.OfflineQueuePolicy.PreserveNothing, queueQos1Publish, false);
    })
});

function doDisconnectWhileQos1PublishPendingSetsDuplicateTest(mode: model.ProtocolMode) {
    let config = buildProtocolStateConfig(mode);
    config.offlineQueuePolicy = protocol.OfflineQueuePolicy.PreserveQos1PlusPublishes;

    let context : BrokerTestContext = {
        protocolStateConfig: config,
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(0);
    let result = queueQos1Publish(fixture, 0);
    expect(result.state).toEqual(OperationResultStateType.Pending);
    expect(fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length).toEqual(1);

    expect(fixture.protocolState.getOperations().size).toEqual(1);
    let operation : protocol.ClientOperation = fixture.protocolState.getOperations().values().next().value;
    let publishPacket = operation.packet as model.PublishPacketBinary;
    expect(publishPacket.duplicate ?? 0).toEqual(0);

    fixture.service(0);
    expect(fixture.protocolState.getPendingPublishAcks().size).toEqual(1);

    fixture.onConnectionClosed(0);
    expect(result.state).toEqual(OperationResultStateType.Pending);

    expect(publishPacket.duplicate).toEqual(1);
}

describe("PendingQos1PublishOnDisconnectSetsDuplicate", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doDisconnectWhileQos1PublishPendingSetsDuplicateTest(protocolVersionToMode(protocolVersion));
    })
});


function doResumeSessionPolicyTest(mode: model.ProtocolMode, resumeSessionPolicy: protocol.ResumeSessionPolicyType, expectedCleanStartFlags: Array<boolean>) {
    let config = buildProtocolStateConfig(mode);
    config.connectOptions.resumeSessionPolicy = resumeSessionPolicy;

    let context : BrokerTestContext = {
        protocolStateConfig: config,
    };

    let brokerHandlers = buildDefaultHandlerSet();
    let fixture = new ProtocolTestFixture(context, brokerHandlers);

    for (let i = 0; i < expectedCleanStartFlags.length; i++) {
        fixture.advanceFromDisconnected(i, protocol.ProtocolStateType.Connected);
        fixture.onConnectionClosed(i);
    }

    expect(fixture.cleanStartFlags).toEqual(expectedCleanStartFlags);
}

describe("ResumeSessionPolicyNever", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doResumeSessionPolicyTest(protocolVersionToMode(protocolVersion), protocol.ResumeSessionPolicyType.Never, [true, true, true, true]);
    })
});

describe("ResumeSessionPolicyAlways", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doResumeSessionPolicyTest(protocolVersionToMode(protocolVersion), protocol.ResumeSessionPolicyType.Always, [false, false, false, false]);
    })
});

describe("ResumeSessionPolicyPostSuccess", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doResumeSessionPolicyTest(protocolVersionToMode(protocolVersion), protocol.ResumeSessionPolicyType.PostSuccess, [true, false, false, false]);
    })
});

const RECEIVE_MAXIMUM_ITERATIONS : number = 10;

function doReceiveMaximumBackpressureTest(receiveMaximum: number) {
    let config = buildProtocolStateConfig(model.ProtocolMode.Mqtt5);
    config.connectOptions.keepAliveIntervalSeconds = 0;

    let context : BrokerTestContext = {
        protocolStateConfig: config,
        connackOverrides: {
            reasonCode: mqtt5_packet.ConnectReasonCode.Success,
            sessionPresent: false,
            receiveMaximum: receiveMaximum,
        }
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    for (let i = 0; i < RECEIVE_MAXIMUM_ITERATIONS; i++) {
        for (let j = 0; j < receiveMaximum; j++) {
            fixture.publish(0, {
                topicName: "a/b",
                qos: mqtt5_packet.QoS.AtLeastOnce
            })
        }
    }

    for (let i = 0; i < RECEIVE_MAXIMUM_ITERATIONS; i++) {
        expect(fixture.protocolState.getNextServiceTimepoint(i)).toEqual(i);

        let brokerData = fixture.serviceWithDrain(i);
        expect(fixture.toServerPackets.length).toEqual(1 + (i + 1) * receiveMaximum); // include 1 connect
        expect(fixture.protocolState.getNextServiceTimepoint(i)).toBeUndefined();

        for (let j = 0; j < 4; j++) {
            let shouldBeEmpty = fixture.serviceWithDrain(i);
            expect(shouldBeEmpty.byteLength).toEqual(0);
            expect(fixture.protocolState.getNextServiceTimepoint(i)).toBeUndefined();
        }

        fixture.onIncomingData(i, brokerData);
    }

    fixture.onConnectionClosed(RECEIVE_MAXIMUM_ITERATIONS);

    fixture.verifyEmpty();
}

const receiveMaximumValues = [1, 2, 3, 5, 10];

describe("ReceiveMaximumFlowControl", () => {
    test.each(receiveMaximumValues)(" %p", (receiveMaximum) => {
        doReceiveMaximumBackpressureTest(receiveMaximum);
    })
});

const EXHAUST_ID_PACKET_COUNT : number = 66000;

function doOutOfPacketIdsBackpressureTest(mode: model.ProtocolMode, queueOperationFunction: (fixture: ProtocolTestFixture, elapsed: number) => void) {
    let config = buildProtocolStateConfig(mode);
    config.connectOptions.keepAliveIntervalSeconds = 0;

    let context : BrokerTestContext = {
        protocolStateConfig: config
    };

    let brokerHandlers = buildDefaultHandlerSet();
    brokerHandlers.set(mqtt5_packet.PacketType.Publish, nonReflectivePublishHandler);

    let fixture = new ProtocolTestFixture(context, brokerHandlers);
    fixture.advanceFromDisconnected(0, protocol.ProtocolStateType.Connected);

    for (let i = 0; i < EXHAUST_ID_PACKET_COUNT; i++) {
        queueOperationFunction(fixture, 0);
    }

    let iterations : number = 0;
    let done : boolean = false;
    while (!done) {

        let responseViews: Array<DataView> = [];
        let blocked: boolean = false;
        while (!blocked && !done) {
            expect(fixture.protocolState.getNextServiceTimepoint(0)).toEqual(0);

            let brokerData = fixture.serviceWithDrain(0);

            if (brokerData.byteLength > 0) {
                responseViews.push(brokerData);
            }

            blocked = fixture.protocolState.getBoundPacketIds().size >= 65535;
            done = (fixture.protocolState.getOperationQueue(protocol.OperationQueueType.User).length == 0 && fixture.protocolState.getCurrentOperation() == undefined);
        }

        expect(fixture.protocolState.getNextServiceTimepoint(0)).toBeUndefined();
        let expectEmpty = fixture.serviceWithDrain(0);
        expect(expectEmpty.byteLength).toEqual(0);

        for (let responseData of responseViews) {
            fixture.onIncomingData(0, responseData);
        }

        iterations++;
    }

    expect(iterations > 1).toBeTruthy();

    fixture.onConnectionClosed(RECEIVE_MAXIMUM_ITERATIONS);

    fixture.verifyEmpty();
}

function queueBackpressureSubscribe(fixture: ProtocolTestFixture, time: number) {
    fixture.subscribe(time, {
        subscriptions: [
            {
                topicFilter: "a/b",
                qos: mqtt5_packet.QoS.AtLeastOnce
            }
        ]
    });
}

describe("UnackedSubscribesBackpressureTest", () => {
    test.each(modes)("MQTT %p", (protocolVersion) => {
        doOutOfPacketIdsBackpressureTest(protocolVersionToMode(protocolVersion), queueBackpressureSubscribe);
    })
});

/*


 */

