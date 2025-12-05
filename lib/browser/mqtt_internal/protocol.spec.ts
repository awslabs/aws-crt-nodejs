/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as encoder from "./encoder";
import * as decoder from "./decoder";
import * as model from "./model";
import * as protocol from "./protocol";
import {ProtocolStateType} from "./protocol";
import {CrtError} from "../error";
import * as test_mqtt_internal_client from "@test/mqtt_internal_client";
import {v4 as uuid} from "uuid";

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

function defaultPublishHandler(packet : mqtt5_packet.IPacket, context: BrokerTestContext, responsePackets : Array<mqtt5_packet.IPacket>) {
    let incomingPublish = packet as model.PublishPacketInternal;
    if (incomingPublish.qos != mqtt5_packet.QoS.ExactlyOnce) {
        let outboundPublish : model.PublishPacketInternal = {
            type: mqtt5_packet.PacketType.Publish,
            topicName: incomingPublish.topicName,
            qos: incomingPublish.qos,
            retain: incomingPublish.retain,
            duplicate: false,
            payload: incomingPublish.payload
        };

        responsePackets.push(outboundPublish);

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

function buildDefaultProtocolStateConfig(mode: model.ProtocolMode) : protocol.ProtocolStateConfig {
    return {
        protocolVersion: mode,
            offlineQueuePolicy: protocol.OfflineQueuePolicy.Default,
            connectOptions: {
            keepAliveIntervalSeconds: 30,
                clientId: "test-client-id"
        },
        baseElapsedMillis: 0,
            pingTimeoutMillis: 30000
    };
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
            this.brokerEncoder.initForPacket(model.convertInternalPacketToBinary(responsePacket));

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
}
/*
function findNthPacketOfType(packets: Array<mqtt5_packet.IPacket>, packetType: mqtt5_packet.PacketType, n: number) : [number, mqtt5_packet.IPacket] | undefined {
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

    return undefined;
}

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


test('disconnectedStateFailsNetworkEvents', async () => {
    test.each([model.ProtocolMode.Mqtt311, model.ProtocolMode.Mqtt5])("mode %p", (mode) => {

    })
});
*/
let modes = [model.ProtocolMode.Mqtt311, model.ProtocolMode.Mqtt5];

describe("disconnectedStateFailsNetworkEvents", () => {
    test.each(modes)("mode %p", (mode) => {
        let context : BrokerTestContext = {
            protocolStateConfig: buildDefaultProtocolStateConfig(mode)
        };

        let fixture = new ProtocolTestFixture(context, buildDefaultHandlerSet());
        expect(fixture.protocolState.getState()).toEqual(ProtocolStateType.Disconnected);
    })
});

/*
#[test_matrix([5, 311])]
fn disconnected_state_network_event_handler_fails(protocol_version : i32) {
    let mut fixture = ProtocolStateTestFixture::new(build_standard_test_config(protocol_version));
    assert_eq!(ProtocolStateType::Disconnected, fixture.client_state.state);

    assert_matches!(fixture.on_connection_closed(0).err().unwrap(), GneissError::InternalStateError(_));
    assert!(fixture.client_packet_events.is_empty());

    assert_matches!(fixture.on_write_completion(0).err().unwrap(), GneissError::InternalStateError(_));
    assert!(fixture.client_packet_events.is_empty());

    let bytes : Vec<u8> = vec!(0, 1, 2, 3, 4, 5);
    assert_matches!(fixture.on_incoming_bytes(0, bytes.as_slice()).err().unwrap(), GneissError::InternalStateError(_));
    assert!(fixture.client_packet_events.is_empty());
}

#[test_matrix([5, 311])]
fn disconnected_state_next_service_time_never(protocol_version : i32) {
    let mut fixture = ProtocolStateTestFixture::new(build_standard_test_config(protocol_version));
    assert_eq!(ProtocolStateType::Disconnected, fixture.client_state.state);

    assert_eq!(None, fixture.get_next_service_time(0));
}
 */