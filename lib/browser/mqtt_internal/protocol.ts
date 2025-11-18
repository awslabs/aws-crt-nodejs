/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as model from "./model";
import * as encoder from "./encoder";
import * as decoder from "./decoder";
import * as validate from "./validate";
import {CrtError} from "../error";
import {BinaryData, PublishPacket, UserProperty} from "../../common/mqtt5_packet";

interface ResultHandler<T> {
    onCompletionSuccess : (value : T) => void;
    onCompletionFailure : (error : CrtError) => void;
}

// type ResultHandler<T> = (value: T | undefined, err: CrtError | undefined) => void;

enum ProtocolStateType {
    Disconnected,
    PendingConnack,
    Connected,
    PendingDisconnect
}

enum NetworkEventType {
    ConnectionOpened,
    ConnectionClosed,
    IncomingData,
    WriteCompletion,
}

interface ConnectionOpenedContext {
    establishmentTimeout: number
}

interface IncomingDataContext {
    data: DataView
}

interface NetworkEventContext {
    type : NetworkEventType,
    context? : ConnectionOpenedContext | IncomingDataContext,
    elapsedMillis : number
}

enum UserEventType {
    Publish,
    Subscribe,
    Unsubscribe,
    Disconnect
}

interface PublishOptions {
    timeoutInMillis? : number
}

enum PublishResultType {
    Qos0,
    Qos1,
}

interface PublishResult {
    type: PublishResultType,
    packet?: mqtt5_packet.PubackPacket,
}

interface PublishOptionsInternal {
    options: PublishOptions,
    resultHandler : ResultHandler<PublishResult>
}

interface PublishContext {
    packet : mqtt5_packet.PublishPacket,
    options : PublishOptionsInternal
}

interface SubscribeOptions {
    timeoutInMillis? : number
}

interface SubscribeOptionsInternal {
    options: SubscribeOptions,
    resultHandler : ResultHandler<mqtt5_packet.SubackPacket>
}

interface SubscribeContext {
    packet : mqtt5_packet.SubscribePacket,
    options : SubscribeOptionsInternal
}

interface UnsubscribeOptions {
    timeoutInMillis? : number
}

interface UnsubscribeOptionsInternal {
    options: UnsubscribeOptions,
    resultHandler : ResultHandler<mqtt5_packet.UnsubackPacket>
}

type OperationResultType = PublishResult | mqtt5_packet.SubackPacket | mqtt5_packet.UnsubackPacket | undefined;

interface UnsubscribeContext {
    packet : mqtt5_packet.UnsubscribePacket,
    options : UnsubscribeOptionsInternal
}

interface DisconnectContext {
    packet : mqtt5_packet.DisconnectPacket
}

interface UserEventContext {
    type: UserEventType,
    context: PublishContext | SubscribeContext | UnsubscribeContext | DisconnectContext,
    elapsedMillis: number
}

interface ServiceContext {
    elapsedMillis: number,
    socketBuffer: ArrayBuffer,
}

interface ServiceResult {
    toSocket?: DataView
}

enum ResetType {
    Connection,
    Session
}

interface ResetContext {
    elapsedMillis: number,
    type: ResetType
}

interface IProtocolState {

    reset(context: ResetContext) : void;

    handleNetworkEvent(context: NetworkEventContext) : void;

    handleUserEvent(context: UserEventContext) : void;

    service(context: ServiceContext) : ServiceResult;

    getNextServiceTimepoint(elapsedMillis: number) : number | undefined;
}

function isUserOperationType(type: mqtt5_packet.PacketType): boolean {
    switch(type) {
        case mqtt5_packet.PacketType.Publish:
        case mqtt5_packet.PacketType.Subscribe:
        case mqtt5_packet.PacketType.Unsubscribe:
        case mqtt5_packet.PacketType.Disconnect:
            return true;

        default:
            return false;
    }
}

// Disconnect, Connect, Pingreq
interface GenericOptionsInternal {
    resultHandler: ResultHandler<void>,
}

type ClientOperationOptionsType = PublishOptionsInternal | SubscribeOptionsInternal | UnsubscribeOptionsInternal | GenericOptionsInternal;

interface ClientOperation {
    type: mqtt5_packet.PacketType,

    id : number,

    options?: ClientOperationOptionsType,

    packet : model.IPacketBinary,

    packetId? : number,

    flushTimepoint? : number,

    numAttempts: number,
}

type ConnectPacketTransformer = (packet: mqtt5_packet.ConnectPacket) => void;

interface ConnectOptions {
    connectPacketTransformer? : ConnectPacketTransformer,
    keepAliveIntervalSeconds: number;
    clientId?: string;
    username?: string;
    password?: BinaryData;
    sessionExpiryIntervalSeconds?: number;
    requestResponseInformation?: boolean;
    requestProblemInformation?: boolean;
    receiveMaximum?: number;
    maximumPacketSizeBytes?: number;
    willDelayIntervalSeconds?: number;
    will?: PublishPacket;
    userProperties?: Array<UserProperty>;
}



interface ProtocolStateConfig {
    protocolVersion : model.ProtocolMode,

    connectOptions : ConnectOptions,
}

enum ServiceQueueType {
    HighPriorityOnly,
    All
}

const MAXIMUM_NUMBER_OF_PACKET_IDS : number = 65535;
const MAXIMUM_PACKET_ID : number = 65535;

export class ProtocolState implements IProtocolState {

    private config : ProtocolStateConfig;
    private state : ProtocolStateType = ProtocolStateType.Disconnected;

    private halted: boolean = false;
    private haltError? : CrtError;

    private elapsedMillis : number = 0;
    private pendingConnackTimeoutElapsedMillis? : number = undefined;

    private nextOperationId : number = 1;
    private operations : Map<number, ClientOperation> = new Map<number, ClientOperation>();

    private userOperationQueue : Array<number> = new Array<number>();
    private resubmitOperationQueue : Array<number> = new Array<number>();
    private highPriorityOperationQueue : Array<number> = new Array<number>();
    private currentOperation? : number = undefined;

    private nextPacketId : number = 1;
    private boundPacketIds : Map<number, number> = new Map<number, number>();

    private encoder : encoder.Encoder;
    private decoder : decoder.Decoder;

    private pendingWriteCompletion : boolean = false;
    private pendingWriteCompletionOperations : Array<number> = new Array<number>();

    private pendingPublishAcks : Map<number, number> = new Map<number, number>();
    private pendingNonPublishAcks : Map<number, number> = new Map<number, number>();

    constructor(config : ProtocolStateConfig) {
        this.config = config;
        this.encoder = new encoder.Encoder(encoder.buildClientEncodingFunctionSet(config.protocolVersion));
        this.decoder = new decoder.Decoder(decoder.buildClientDecodingFunctionSet(config.protocolVersion));
    }

    reset(context: ResetContext) : void {
        this.updateElapsedMillis(context.elapsedMillis);

        this.requeueCurrentOperation();
        this.pendingWriteCompletion = false;
        this.pendingWriteCompletionOperations.forEach((id : number) => this.failOperation(id, new CrtError("Protocol state reset")));
        this.pendingWriteCompletionOperations = [];

        this.highPriorityOperationQueue.forEach((id: number)=> this.failOperation(id, new CrtError("Protocol state reset")));
        this.highPriorityOperationQueue = [];

        this.state = ProtocolStateType.Disconnected;
        this.halted = false;
        this.haltError = undefined;
        this.pendingConnackTimeoutElapsedMillis = undefined;
        this.encoder.reset();
        this.decoder.reset();

        if (context.type == ResetType.Session) {
            this.resetForNewSession();
        }
    }

    handleNetworkEvent(context: NetworkEventContext) : void {
        this.updateElapsedMillis(context.elapsedMillis);
        this.throwIfHalted();

        try {
            switch (context.type) {
                case NetworkEventType.ConnectionOpened:
                    this.handleConnectionOpened(context.context as ConnectionOpenedContext);
                    break;
                case NetworkEventType.ConnectionClosed:
                    this.handleConnectionClosed();
                    break;
                case NetworkEventType.IncomingData:
                    this.handleIncomingData(context.context as IncomingDataContext);
                    break;
                case NetworkEventType.WriteCompletion:
                    this.handleWriteCompletion();
                    break;
            }
        } catch (e) {
            this.halt(new CrtError(`handleNetworkEvent() failure: ${e}`));
        }

        this.throwIfHalted();
    }

    handleUserEvent(context: UserEventContext) : void {
        this.updateElapsedMillis(context.elapsedMillis);
        switch (context.type) {
            case UserEventType.Publish:
                this.handlePublish(context.context as PublishContext);
                break;
            case UserEventType.Subscribe:
                this.handleSubscribe(context.context as SubscribeContext);
                break;
            case UserEventType.Unsubscribe:
                this.handleUnsubscribe(context.context as UnsubscribeContext);
                break;
            case UserEventType.Disconnect:
                this.handleDisconnect(context.context as DisconnectContext);
                break;
        }
    }

    service(context: ServiceContext) : ServiceResult {
        this.updateElapsedMillis(context.elapsedMillis);
        this.throwIfHalted();

        try {
            switch (this.state) {
                case ProtocolStateType.PendingConnack:
                    return this.servicePendingConnack(context);
                case ProtocolStateType.Connected:
                    return this.serviceConnected(context);
                case ProtocolStateType.PendingDisconnect:
                    return this.servicePendingDisconnect(context);
                default:
                    return {};
            }
        } catch (e) {
            this.halt(new CrtError(`service() failure: ${e}`));
        }

        this.throwIfHalted();
        return {};
    }

    getNextServiceTimepoint(elapsedMillis: number) : number | undefined {
        this.updateElapsedMillis(elapsedMillis);

        switch(this.state) {
            case ProtocolStateType.PendingConnack:
                return this.getNextServiceTimepointPendingConnack();
            case ProtocolStateType.Connected:
                return this.getNextServiceTimepointConnected();
            case ProtocolStateType.PendingDisconnect:
                return this.getNextServiceTimepointPendingDisconnect();
            default:
                return undefined;
        }
    }

    private failOperation(id: number, error: CrtError) {
        let operation = this.operations.get(id);
        if (operation) {
            if (operation.options) {
                operation.options.resultHandler.onCompletionFailure(error);
            }

            this.operations.delete(id);
        }
    }

    private completeOperation(id: number, result: OperationResultType) {
        let operation = this.operations.get(id);
        if (operation) {
            if (operation.options) {
                switch (operation.type) {
                    case mqtt5_packet.PacketType.Publish:
                        let publishHandler = operation.options.resultHandler as ResultHandler<PublishResult>;
                        publishHandler.onCompletionSuccess(result as PublishResult);
                        break;
                    case mqtt5_packet.PacketType.Subscribe:
                        let subscribeHandler = operation.options.resultHandler as ResultHandler<mqtt5_packet.SubackPacket>;
                        subscribeHandler.onCompletionSuccess(result as mqtt5_packet.SubackPacket);
                        break;
                    case mqtt5_packet.PacketType.Unsubscribe:
                        let unsubscribeHandler = operation.options.resultHandler as ResultHandler<mqtt5_packet.UnsubackPacket>;
                        unsubscribeHandler.onCompletionSuccess(result as mqtt5_packet.UnsubackPacket);
                        break;
                }
            }

            this.operations.delete(id);
        }
    }

    private changeState(newState: ProtocolStateType) {
        this.state = newState;
    }

    private getNextServiceTimepointPendingConnack() : number | undefined {
        return foldTime(this.getQueueServiceTimepoint(ServiceQueueType.HighPriorityOnly), this.pendingConnackTimeoutElapsedMillis);
    }

    private getNextServiceTimepointConnected() : number | undefined {
        // TODO: ping, ping timeout, operation timeout
        return this.getQueueServiceTimepoint(ServiceQueueType.All);
    }

    private getNextServiceTimepointPendingDisconnect() : number | undefined {
        return this.getQueueServiceTimepoint(ServiceQueueType.HighPriorityOnly);
    }

    private getQueueServiceTimepoint(serviceQueueType : ServiceQueueType) : number | undefined {
        if (this.pendingWriteCompletion) {
            return undefined;
        }

        if (this.currentOperation != undefined) {
            return this.elapsedMillis;
        }

        switch(serviceQueueType) {
            case ServiceQueueType.HighPriorityOnly:
                return (this.highPriorityOperationQueue.length > 0) ? this.elapsedMillis : undefined;

            case ServiceQueueType.All:
                if (this.highPriorityOperationQueue.length > 0 || this.resubmitOperationQueue.length > 0) {
                    return this.elapsedMillis;
                }

                let id = this.userOperationQueue.shift();
                if (id != undefined) {
                    this.userOperationQueue.unshift(id);
                    if (!this.operationNeedsPacketBinding(id) || this.canAllocatePacketId()) {
                        return this.elapsedMillis;
                    }
                }
                return undefined;

            default:
                return undefined;
        }
    }

    private canAllocatePacketId() : boolean {
        return this.pendingPublishAcks.size + this.pendingNonPublishAcks.size < MAXIMUM_NUMBER_OF_PACKET_IDS;
    }

    private dequeueNextOperation(serviceQueueType : ServiceQueueType) : ClientOperation | undefined {
        if (this.pendingWriteCompletion) {
            return undefined;
        }

        let id : number | undefined = undefined;

        switch(serviceQueueType) {
            case ServiceQueueType.HighPriorityOnly:
                id = this.highPriorityOperationQueue.shift();
                break;

            case ServiceQueueType.All:
                id = this.highPriorityOperationQueue.shift();

                if (id == undefined) {
                    id = this.resubmitOperationQueue.shift();
                }

                if (id == undefined) {
                    id = this.userOperationQueue.shift();
                    if (id != undefined) {
                        if (this.operationNeedsPacketBinding(id) && !this.canAllocatePacketId()) {
                            this.userOperationQueue.unshift(id);
                            id = undefined;
                        }
                    }
                }
                break;

            default:
                return undefined;
        }

        if (id == undefined) {
            return undefined;
        }

        return this.operations.get(id);
    }

    private onOperationProcessed(operation: ClientOperation) {
        switch (operation.type) {
            case mqtt5_packet.PacketType.Publish:
                if (operation.packetId != undefined) {
                    this.pendingPublishAcks.set(operation.packetId, operation.id);
                } else {
                    this.pendingWriteCompletionOperations.push(operation.id);
                }
                break;

            case mqtt5_packet.PacketType.Subscribe:
            case mqtt5_packet.PacketType.Unsubscribe:
                if (operation.packetId != undefined) {
                    this.pendingNonPublishAcks.set(operation.packetId, operation.id);
                } else {
                    throw new CrtError("Packet id not set for outbound subscribe/unsubscribe");
                }
                break;

            default:
                this.pendingWriteCompletionOperations.push(operation.id);
                break;
        }
    }

    private operationNeedsPacketBinding(id: number) : boolean {
        let operation = this.operations.get(id);
        if (!operation) {
            return false;
        }

        if (operation.packetId != undefined) {
            return false;
        }

        switch (operation.type) {
            case mqtt5_packet.PacketType.Subscribe:
            case mqtt5_packet.PacketType.Unsubscribe:
                return true;

            case mqtt5_packet.PacketType.Publish:
                let publish = operation.packet as model.PublishPacketBinary;
                return publish.qos != 0;

            default:
                return false;
        }
    }

    private advanceNextPacketId() : number {
        let packetId = this.nextPacketId++;
        if (this.nextPacketId > MAXIMUM_PACKET_ID) {
            this.nextPacketId = 1;
        }

        return packetId;
    }

    private allocatePacketId(operationId : number) : number {
        let packetId = this.advanceNextPacketId();
        let startingId = packetId;

        while (this.boundPacketIds.has(packetId)) {
            packetId = this.advanceNextPacketId();

            if (packetId == startingId) {
                throw new CrtError("Packet id space exhausted");
            }
        }

        this.boundPacketIds.set(packetId, operationId);
        return packetId;
    }

    private bindPacketId(operation: ClientOperation) {
        if (!this.operationNeedsPacketBinding(operation.id)) {
            return;
        }

        switch (operation.type) {
            case mqtt5_packet.PacketType.Publish:
                operation.packetId = this.allocatePacketId(operation.id);
                (operation.packet as model.PublishPacketBinary).packetId = operation.packetId;
                break;

            case mqtt5_packet.PacketType.Subscribe:
                operation.packetId = this.allocatePacketId(operation.id);
                (operation.packet as model.SubscribePacketBinary).packetId = operation.packetId;
                break;

            case mqtt5_packet.PacketType.Unsubscribe:
                operation.packetId = this.allocatePacketId(operation.id);
                (operation.packet as model.UnsubscribePacketBinary).packetId = operation.packetId;
                break;
        }
    }

    private serviceOutboundOperations(serviceQueueType : ServiceQueueType, socketBuffer: ArrayBuffer) : ServiceResult {
        let done : boolean = false;
        let remainingView = new DataView(socketBuffer);

        while (!done) {
            let currentOperation : ClientOperation | undefined = undefined;

            if (this.currentOperation == undefined) {
                currentOperation = this.dequeueNextOperation(serviceQueueType);
                if (currentOperation != undefined) {
                    this.currentOperation = currentOperation.id;
                    this.bindPacketId(currentOperation);
                    this.encoder.initForPacket(currentOperation.packet);
                }
            }

            if (currentOperation == undefined) {
                done = true;
            } else {
                let encodeResult = this.encoder.service(remainingView);
                if (encodeResult.type == encoder.ServiceResultType.InProgress) {
                    done = true;
                } else {
                    this.currentOperation = undefined;
                    this.onOperationProcessed(currentOperation);
                }

                remainingView = encodeResult.nextView;
            }
        }

        let result : ServiceResult = {};
        if (remainingView.byteLength < socketBuffer.byteLength) {
            result.toSocket = new DataView(socketBuffer, 0, socketBuffer.byteLength - remainingView.byteLength);
            this.pendingWriteCompletion = true;
        }

        return result;
    }

    private servicePendingConnack(context: ServiceContext) : ServiceResult
    {
        if (this.pendingConnackTimeoutElapsedMillis != undefined) {
            if (this.elapsedMillis >= this.pendingConnackTimeoutElapsedMillis) {
                this.halt(new CrtError("Connack timeout"));
                return {};
            }
        }

        return this.serviceOutboundOperations(ServiceQueueType.HighPriorityOnly, context.socketBuffer);
    }

    private serviceConnected(context: ServiceContext) : ServiceResult
    {
        return this.serviceOutboundOperations(ServiceQueueType.All, context.socketBuffer);
    }

    private servicePendingDisconnect(context: ServiceContext) : ServiceResult
    {
        return this.serviceOutboundOperations(ServiceQueueType.HighPriorityOnly, context.socketBuffer);
    }

    private updateElapsedMillis(elapsedMillis: number) : void {
        this.elapsedMillis = elapsedMillis;
    }

    private submitOperation(operation: ClientOperation, packet: mqtt5_packet.IPacket) : void {
        this.operations.set(operation.id, operation);

        try {
            validate.validateUserSubmittedOutboundPacket(packet, this.config.protocolVersion);
        } catch (e) {
            this.failOperation(operation.id, e as CrtError);
            return;
        }

        this.userOperationQueue.push(operation.id);
    }

    private handlePublish(context: PublishContext) : void {
        let operation = {
            type: mqtt5_packet.PacketType.Publish,
            id: this.nextOperationId++,
            packet: model.convertPublishPacketToBinary(context.packet),
            options: context.options,
        };

        this.submitOperation(operation, context.packet);
    }

    private handleSubscribe(context: SubscribeContext) : void {
        let operation = {
            type: mqtt5_packet.PacketType.Subscribe,
            id: this.nextOperationId++,
            packet: model.convertSubscribePacketToBinary(context.packet),
            options: context.options,
        };

        this.submitOperation(operation, context.packet);
    }

    private handleUnsubscribe(context: UnsubscribeContext) : void {
        let operation = {
            type: mqtt5_packet.PacketType.Unsubscribe,
            id: this.nextOperationId++,
            packet: model.convertUnsubscribePacketToBinary(context.packet),
            options: context.options,
        };

        this.submitOperation(operation, context.packet);
    }

    private handleDisconnect(context: DisconnectContext) : void {
        let operation = {
            type: mqtt5_packet.PacketType.Disconnect,
            id: this.nextOperationId++,
            packet: model.convertDisconnectPacketToBinary(context.packet)
        };

        this.operations.set(operation.id, operation);

        try {
            validate.validateUserSubmittedOutboundPacket(context.packet, this.config.protocolVersion);
        } catch (e) {
            this.failOperation(operation.id, e as CrtError);
            return;
        }

        // disconnects go to the front of the queue
        this.highPriorityOperationQueue.unshift(operation.id);
    }

    private handleConnectionOpened(context: ConnectionOpenedContext) : void {
        if (this.state != ProtocolStateType.Disconnected) {
            throw new CrtError("Connection opened while not disconnected");
        }

        this.changeState(ProtocolStateType.PendingConnack);
        this.encoder.reset();
        this.decoder.reset();
        this.pendingConnackTimeoutElapsedMillis = context.establishmentTimeout;

        let connect = this.buildConnectPacket();
        this.submitInternalHighPriority(model.convertInternalPacketToBinary(connect), {
            onCompletionSuccess: () => {},
            onCompletionFailure: (error: CrtError) => {
                this.halt(error);
            }
        });
    }

    private handleConnectionClosed() : void {
        if (this.state == ProtocolStateType.Disconnected || this.state == ProtocolStateType.Halted) {
            throw new CrtError("Connection closed while disconnected");
        }

        this.changeState(ProtocolStateType.PendingDisconnect);
    }

    private handleIncomingData(context: IncomingDataContext) : void {
        if (this.state == ProtocolStateType.Disconnected || this.state == ProtocolStateType.Halted) {
            this.halt(new CrtError("Data received while disconnected"));
            return;
        }

        let packets = this.decoder.decode(context.data);
        for (let packet of packets) {
            this.handleIncomingPacket(packet);
        }
    }

    private handleIncomingPacket(packet: mqtt5_packet.IPacket) : void {
        switch(packet.type) {
            case mqtt5_packet.PacketType.Connack:
                this.handleIncomingConnack(packet as model.ConnackPacketInternal);
                break;

            case mqtt5_packet.PacketType.Publish:
                this.handleIncomingPublish(packet as model.PublishPacketInternal);
                break;

            case mqtt5_packet.PacketType.Puback:
                this.handleIncomingPuback(packet as model.PubackPacketInternal);
                break;

            case mqtt5_packet.PacketType.Suback:
                this.handleIncomingSuback(packet as model.SubackPacketInternal);
                break;

            case mqtt5_packet.PacketType.Unsuback:
                this.handleIncomingUnsuback(packet as model.UnsubackPacketInternal);
                break;

            case mqtt5_packet.PacketType.Disconnect:
                this.handleIncomingDisconnect(packet as model.DisconnectPacketInternal);
                break;

            case mqtt5_packet.PacketType.Pingresp:
                this.handleIncomingPingresp();
                break;

            default:
                throw new CrtError("Unexpected incoming packet type");
        }
    }

    private handleIncomingConnack(packet: model.ConnackPacketInternal) : void {}
    private handleIncomingPublish(packet: model.PublishPacketInternal) : void {}
    private handleIncomingPuback(packet: model.PubackPacketInternal) : void {}
    private handleIncomingSuback(packet: model.SubackPacketInternal) : void {}
    private handleIncomingUnsuback(packet: model.UnsubackPacketInternal) : void {}
    private handleIncomingDisconnect(packet: model.DisconnectPacketInternal) : void {}
    private handleIncomingPingresp() : void {}

    private handleWriteCompletion() : void {
        for (let id of this.pendingWriteCompletionOperations) {
            this.completeOperation(id, undefined);
        }

        this.pendingWriteCompletionOperations = [];
        this.pendingWriteCompletion = false;
    }

    private buildConnectPacket() : model.ConnectPacketInternal {
        let connectOptions = this.config.connectOptions;

        let connect_packet : model.ConnectPacketInternal = {
            type: mqtt5_packet.PacketType.Connect,
            keepAliveIntervalSeconds: connectOptions.keepAliveIntervalSeconds,
            cleanStart: true
        };

        if (connectOptions.clientId != undefined) {
            connect_packet.clientId = connectOptions.clientId;
        }
        if (connectOptions.username != undefined) {
            connect_packet.username = connectOptions.username;
        }
        if (connectOptions.password != undefined) {
            connect_packet.password = connectOptions.password;
        }
        if (connectOptions.sessionExpiryIntervalSeconds != undefined) {
            connect_packet.sessionExpiryIntervalSeconds = connectOptions.sessionExpiryIntervalSeconds;
        }
        if (connectOptions.requestResponseInformation != undefined) {
            connect_packet.requestResponseInformation = connectOptions.requestResponseInformation;
        }
        if (connectOptions.requestProblemInformation != undefined) {
            connect_packet.requestProblemInformation = connectOptions.requestProblemInformation;
        }
        if (connectOptions.receiveMaximum != undefined) {
            connect_packet.receiveMaximum = connectOptions.receiveMaximum;
        }
        if (connectOptions.maximumPacketSizeBytes != undefined) {
            connect_packet.maximumPacketSizeBytes = connectOptions.maximumPacketSizeBytes;
        }
        if (connectOptions.willDelayIntervalSeconds != undefined) {
            connect_packet.willDelayIntervalSeconds = connectOptions.willDelayIntervalSeconds;
        }
        if (connectOptions.will != undefined) {
            connect_packet.will = connectOptions.will;
        }
        if (connectOptions.userProperties != undefined) {
            connect_packet.userProperties = connectOptions.userProperties;
        }

        if (connectOptions.connectPacketTransformer) {
            connectOptions.connectPacketTransformer(connect_packet);
        }

        return connect_packet;
    }

    // Pingreq, Puback, Connect
    private submitInternalHighPriority(packet: model.IPacketBinary, resultHandler: ResultHandler<void>) {
        if (packet.type == undefined) {
            throw new CrtError("Packet type must be set on internal packets");
        }

        let operation = {
            type: packet.type,
            id: this.nextOperationId++,
            packet: packet,
            options: {
                resultHandler: resultHandler
            }
        };

        this.operations.set(operation.id, operation);
        this.highPriorityOperationQueue.unshift(operation.id);
    }

    private halt(error: CrtError) {
        if (this.state == ProtocolStateType.Halted) {
            return;
        }

        this.state = ProtocolStateType.Halted;
        this.haltError = error;
    }

    private throwIfHalted() {
        if (this.state == ProtocolStateType.Halted) {
            throw this.haltError;
        }
    }

    private requeueCurrentOperation() {
        if (this.currentOperation == undefined) {
            return;
        }

        let operation = this.operations.get(this.currentOperation);
        if (operation == undefined) {
            return;
        }

        if (isUserOperationType(operation.type)) {
            if (operation.numAttempts > 0) {
                this.resubmitOperationQueue.unshift(this.currentOperation);
            } else {
                this.userOperationQueue.unshift(this.currentOperation);
            }
        }
    }

    private resetForNewSession() {
        this.operations.forEach((operation: ClientOperation) => this.failOperation(operation.id, new CrtError("Protocol state reset")));
        this.operations.clear();
        this.nextOperationId = 1;

        this.userOperationQueue = [];
        this.resubmitOperationQueue = [];
        this.highPriorityOperationQueue = [];
        this.currentOperation = undefined;
        this.nextPacketId = 1;
        this.boundPacketIds.clear();
    }
}


function foldTime(lhs : number | undefined, rhs : number | undefined) : number | undefined {
    if (lhs == undefined) {
        return rhs;
    }

    if (rhs == undefined) {
        return lhs;
    }

    return Math.min(lhs, rhs);
}