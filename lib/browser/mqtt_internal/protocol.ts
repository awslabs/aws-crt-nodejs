/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as mqtt from "./mod";
import * as model from "./model";
import * as client from "./client";
import * as encoder from "./encoder";
import * as decoder from "./decoder";
import * as heap from "./heap";
import * as validate from "./validate";
import * as utils from "./utils";
import {CrtError} from "../error";

import * as mqtt5 from "../mqtt5";
import * as mqtt_shared from "../../common/mqtt_shared";
import * as mqtt5_utils from "../mqtt5_utils";
import {BufferedEventEmitter} from "../../common/event";

export interface ResultHandler<T> {
    onCompletionSuccess : (value : T) => void;
    onCompletionFailure : (error : CrtError) => void;
}

export enum ProtocolStateType {
    Disconnected,
    PendingConnack,
    Connected
}

export enum NetworkEventType {
    ConnectionOpened,
    ConnectionClosed,
    IncomingData,
    WriteCompletion,
}

export interface ConnectionOpenedContext {
    establishmentTimeoutMillis: number
}

export interface IncomingDataContext {
    data: DataView
}

export interface NetworkEventContext {
    type : NetworkEventType,
    context? : ConnectionOpenedContext | IncomingDataContext,
    elapsedMillis : number,
    decodedPackets? : Array<mqtt5_packet.IPacket> // in-order output sequence of all packets received during an incoming data event
}

export enum UserEventType {
    Publish,
    Subscribe,
    Unsubscribe,
    Disconnect
}

export interface PublishOptionsInternal {
    options: mqtt.PublishOptions,
    resultHandler : ResultHandler<mqtt.PublishResult>
}

export interface PublishContext {
    packet : mqtt5_packet.PublishPacket,
    options : PublishOptionsInternal
}

export interface SubscribeOptionsInternal {
    options: mqtt.SubscribeOptions,
    resultHandler : ResultHandler<mqtt5_packet.SubackPacket>
}

export interface SubscribeContext {
    packet : mqtt5_packet.SubscribePacket,
    options : SubscribeOptionsInternal
}

export interface UnsubscribeOptionsInternal {
    options: mqtt.UnsubscribeOptions,
    resultHandler : ResultHandler<mqtt5_packet.UnsubackPacket>
}

type OperationResultType = mqtt.PublishResult | mqtt5_packet.SubackPacket | mqtt5_packet.UnsubackPacket | undefined;

export interface UnsubscribeContext {
    packet : mqtt5_packet.UnsubscribePacket,
    options : UnsubscribeOptionsInternal
}

export interface DisconnectContext {
    packet : mqtt5_packet.DisconnectPacket,
    resultHandler : ResultHandler<void>
}

export interface UserEventContext {
    type: UserEventType,
    context: PublishContext | SubscribeContext | UnsubscribeContext | DisconnectContext,
    elapsedMillis: number
}

export interface ServiceContext {
    elapsedMillis: number,
    socketBuffer: ArrayBuffer,
}

export interface ServiceResult {
    toSocket?: DataView
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
export interface GenericOptionsInternal {
    resultHandler: ResultHandler<void>,
}

export type ClientOperationOptionsType = PublishOptionsInternal | SubscribeOptionsInternal | UnsubscribeOptionsInternal | GenericOptionsInternal;

export interface ClientOperation {
    type: mqtt5_packet.PacketType,

    id : number,

    options?: ClientOperationOptionsType,

    packet : model.IPacketBinary,

    packetId? : number,

    flushTimepoint? : number,

    numAttempts: number,
}

export interface ProtocolStateConfig {
    protocolVersion : model.ProtocolMode,
    offlineQueuePolicy : mqtt.OfflineQueuePolicy,
    connectOptions : mqtt.ConnectOptions,
    baseElapsedMillis : number,
    pingTimeoutMillis? : number,
}

export enum OperationQueueType {
    HighPriority,
    Resubmit,
    User
}

enum QueueEndType {
    Front,
    Back
}

enum ServiceQueueType {
    HighPriorityOnly,
    All
}

interface OperationTimeoutRecord {
    operationId: number,
    timeoutElapsedMillis: number
}

function compareTimeoutRecords(lhs: OperationTimeoutRecord, rhs: OperationTimeoutRecord) : boolean {
    if (lhs.timeoutElapsedMillis < rhs.timeoutElapsedMillis) {
        return true;
    } else if (lhs.timeoutElapsedMillis > rhs.timeoutElapsedMillis) {
        return false;
    } else {
        return lhs.operationId < rhs.operationId;
    }
}

/**
 * Classifies why the client has been halted.
 */
export enum HaltEventType {

    /**
     * The client has been halted due to an event not considered anomalous: user-initiated or server-initiated disconnect, rejected connection attempt, etc...
     */
    Normal,

    /**
     * The client has been halted due to unexpected, spec-breaking behavior from the remote broker
     */
    ProtocolError,

    /**
     * The client has been halted due to an unexpected internal state or exception
     */
    Unknown,

    /**
     * The client has been halted due to a network timeout (connack or ping)
     */
    Timeout
}

export interface HaltedEvent {
    reason: CrtError,
    type: HaltEventType
}

export type HaltedEventListener = (eventData: HaltedEvent) => void;

const MAXIMUM_NUMBER_OF_PACKET_IDS : number = 65535;
const MAXIMUM_PACKET_ID : number = 65535;

export class ProtocolState extends BufferedEventEmitter {

    private config : ProtocolStateConfig;
    private state : ProtocolStateType = ProtocolStateType.Disconnected;

    private haltState? : HaltedEvent;

    private elapsedMillis : number = 0;

    private pendingConnackTimeoutElapsedMillis? : number = undefined;
    private nextOutboundPingElapsedMillis? : number = undefined;
    private pendingPingrespTimeoutElapsedMillis? : number = undefined;

    private nextOperationId : number = 1;
    private operations : Map<number, ClientOperation> = new Map<number, ClientOperation>();
    private operationTimeouts : heap.MinHeap<OperationTimeoutRecord> = new heap.MinHeap<OperationTimeoutRecord>(compareTimeoutRecords);

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
    private pendingFlushOperations: Array<number> = new Array<number>();

    private pendingPublishAcks : Map<number, number> = new Map<number, number>();
    private pendingNonPublishAcks : Map<number, number> = new Map<number, number>();

    private lastNegotiatedSettings : mqtt5.NegotiatedSettings = createDefaultNegotiatedSettings();
    private lastOutboundConnect : model.ConnectPacketInternal = createDefaultConnect();

    private connectInTransit : boolean = false;
    private hasSuccessfullyConnected : boolean = false;

    constructor(config : ProtocolStateConfig) {
        super();
        this.config = config;
        this.encoder = new encoder.Encoder(encoder.buildClientEncodingFunctionSet(config.protocolVersion));
        this.decoder = new decoder.Decoder(decoder.buildClientDecodingFunctionSet(config.protocolVersion));
        this.elapsedMillis = config.baseElapsedMillis;
    }

    handleNetworkEvent(context: NetworkEventContext) : void {
        this.cork();

        try {
            this.updateElapsedMillis(context.elapsedMillis);

            switch (context.type) {
                case NetworkEventType.ConnectionOpened:
                    this.handleConnectionOpened(context.context as ConnectionOpenedContext);
                    break;
                case NetworkEventType.ConnectionClosed:
                    this.handleConnectionClosed();
                    break;
                case NetworkEventType.IncomingData:
                    this.handleIncomingData(context);
                    break;
                case NetworkEventType.WriteCompletion:
                    this.handleWriteCompletion();
                    break;
            }
        } catch (e) {
            this.halt(HaltEventType.Unknown, new CrtError(`handleNetworkEvent() failure: ${e}`));
        } finally {
            this.uncork();
        }
    }

    handleUserEvent(context: UserEventContext) : void {
        this.cork();

        try {
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
        } finally {
            this.uncork();
        }
    }

    service(context: ServiceContext) : ServiceResult {
        this.cork();

        try {
            this.updateElapsedMillis(context.elapsedMillis);
            if (!this.haltState) {

                switch (this.state) {
                    case ProtocolStateType.PendingConnack:
                        return this.servicePendingConnack(context);
                    case ProtocolStateType.Connected:
                        return this.serviceConnected(context);
                    default:
                        break;
                }
            }
        } catch (e) {
            this.halt(HaltEventType.Unknown, new CrtError(`service() failure: ${e}`));
        } finally {
            this.uncork();
        }

        return {};
    }

    getNextServiceTimepoint(elapsedMillis: number) : number | undefined {
        this.updateElapsedMillis(elapsedMillis);

        switch(this.state) {
            case ProtocolStateType.PendingConnack:
                return this.getNextServiceTimepointPendingConnack();
            case ProtocolStateType.Connected:
                return this.getNextServiceTimepointConnected();
            default:
                return undefined;
        }
    }

    /* Test accessors */
    getState() : ProtocolStateType { return this.state; }
    getHaltState() : HaltedEvent | undefined { return this.haltState; }
    getPendingConnackTimeoutElapsedMillis() : number | undefined { return this.pendingConnackTimeoutElapsedMillis; }
    getNextOutboundPingElapsedMillis() : number | undefined { return this.nextOutboundPingElapsedMillis; }
    getPendingPingrespTimeoutElapsedMillis() : number | undefined { return this.pendingPingrespTimeoutElapsedMillis; }
    getOperations() : Map<number, ClientOperation> { return this.operations; }
    getOperationTimeouts() : heap.MinHeap<OperationTimeoutRecord> { return this.operationTimeouts; }
    getCurrentOperation() : ClientOperation | undefined {
        let id = this.currentOperation;
        if (id != undefined) {
            return this.operations.get(id);
        }

        return undefined;
    }
    getConfig() : ProtocolStateConfig { return this.config; }

    getOperationQueue(type: OperationQueueType) : Array<number> {
        switch (type) {
            case OperationQueueType.User:
                return this.userOperationQueue;
            case OperationQueueType.Resubmit:
                return this.resubmitOperationQueue;
            case OperationQueueType.HighPriority:
                return this.highPriorityOperationQueue;
            default:
                throw new CrtError("Unknown operation queue type");
        }
    }

    getBoundPacketIds() : Map<number, number> { return this.boundPacketIds; }
    getPendingWriteCompletion() : boolean { return this.pendingWriteCompletion; }
    getPendingWriteCompletionOperations() : Array<number> { return this.pendingWriteCompletionOperations; }
    getPendingFlushOperations() : Array<number> { return this.pendingFlushOperations; }

    getPendingPublishAcks() : Map<number, number> { return this.pendingPublishAcks; }
    getPendingNonPublishAcks() : Map<number, number> { return this.pendingNonPublishAcks; }

    /**
     * Event emitted when the protocol object becomes halted.
     *
     * Listener type: {@link HaltedEventListener}
     *
     * @event
     */
    static HALTED : string = 'halted';

    /**
     * Registers a listener for the client's {@link HALTED} {@link HaltedEvent} event.  A
     * {@link HALTED} {@link HaltedEvent} event is emitted when the protocol object enters the halted state.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'halted', listener: HaltedEventListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    /* Internal Impl */
    private resetNextPing() {
        this.pendingPingrespTimeoutElapsedMillis = undefined;
        this.pushOutNextPing(this.elapsedMillis);
    }

    private pushOutNextPing(baseTime: number | undefined) {
        if (!this.config.connectOptions.keepAliveIntervalSeconds) {
            return;
        }

        if (baseTime != undefined) {
            let pingTime = baseTime + this.config.connectOptions.keepAliveIntervalSeconds * 1000;

            this.nextOutboundPingElapsedMillis = utils.foldTimeMax(this.nextOutboundPingElapsedMillis, pingTime);
        }
    }

    private unbindPacketId(id: number | undefined) {
        if (id == undefined) {
            return;
        }

        this.boundPacketIds.delete(id);
        this.pendingPublishAcks.delete(id);
        this.pendingNonPublishAcks.delete(id);
    }

    private failOperation(id: number, error: CrtError) {
        let operation = this.operations.get(id);
        if (operation) {
            this.unbindPacketId(operation.packetId);
            if (operation.options) {
                operation.options.resultHandler.onCompletionFailure(error);
            }

            this.operations.delete(id);
        }
    }

    private completeOperation(id: number, result: OperationResultType) {
        let operation = this.operations.get(id);
        if (operation) {
            this.unbindPacketId(operation.packetId);
            if (operation.options) {
                switch (operation.type) {
                    case mqtt5_packet.PacketType.Publish:
                        let publishHandler = operation.options.resultHandler as ResultHandler<mqtt.PublishResult>;
                        publishHandler.onCompletionSuccess(result as mqtt.PublishResult);
                        break;
                    case mqtt5_packet.PacketType.Subscribe:
                        let subscribeHandler = operation.options.resultHandler as ResultHandler<mqtt5_packet.SubackPacket>;
                        subscribeHandler.onCompletionSuccess(result as mqtt5_packet.SubackPacket);
                        break;
                    case mqtt5_packet.PacketType.Unsubscribe:
                        let unsubscribeHandler = operation.options.resultHandler as ResultHandler<mqtt5_packet.UnsubackPacket>;
                        unsubscribeHandler.onCompletionSuccess(result as mqtt5_packet.UnsubackPacket);
                        break;
                    default:
                        let genericOptions = operation.options as GenericOptionsInternal;
                        genericOptions.resultHandler.onCompletionSuccess();
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
        return utils.foldTimeMin(this.getQueueServiceTimepoint(ServiceQueueType.HighPriorityOnly), this.pendingConnackTimeoutElapsedMillis);
    }

    private getNextServiceTimepointConnected() : number | undefined {
        let serviceTime = this.getQueueServiceTimepoint(ServiceQueueType.All);
        serviceTime = utils.Min(serviceTime, this.nextOutboundPingElapsedMillis);
        serviceTime = utils.foldTimeMin(serviceTime, this.pendingPingrespTimeoutElapsedMillis);
        serviceTime = utils.foldTimeMin(serviceTime, this.operationTimeouts.peek()?.timeoutElapsedMillis);

        return serviceTime;
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
                    if (this.canDequeueUserOperation(id)) {
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

    private wouldOperationBreachReceiveMaximum(id: number) : boolean {
        let operation = this.operations.get(id);
        if (!operation) {
            return false;
        }

        if (operation.type != mqtt5_packet.PacketType.Publish) {
            return false;
        }

        let publishPacket = operation.packet as model.PublishPacketBinary;
        if (publishPacket.qos != mqtt5_packet.QoS.AtMostOnce) {
            if (this.pendingPublishAcks.size >= this.lastNegotiatedSettings.receiveMaximumFromServer) {
                return true;
            }
        }

        return false;
    }

    private canDequeueUserOperation(id: number) : boolean {
        if (this.operationNeedsPacketBinding(id) && !this.canAllocatePacketId()) {
            return false;
        }

        if (this.wouldOperationBreachReceiveMaximum(id)) {
            return false;
        }

        return true;
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
                        if (!this.canDequeueUserOperation(id)) {
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

    private onOperationProcessed(operation: ClientOperation) : boolean {
        operation.numAttempts++;
        this.pendingFlushOperations.push(operation.id);

        let timeoutMillis : number | undefined = undefined;

        switch (operation.type) {
            case mqtt5_packet.PacketType.Publish:
                if (operation.packetId != undefined) {
                    this.pendingPublishAcks.set(operation.packetId, operation.id);

                    let publishOptions = operation.options as PublishOptionsInternal;
                    timeoutMillis = publishOptions.options.timeoutInMillis;
                } else {
                    this.pendingWriteCompletionOperations.push(operation.id);
                }
                break;

            case mqtt5_packet.PacketType.Subscribe:
                if (operation.packetId != undefined) {
                    this.pendingNonPublishAcks.set(operation.packetId, operation.id);
                    let subscribeOptions = operation.options as SubscribeOptionsInternal;
                    timeoutMillis = subscribeOptions.options.timeoutInMillis;
                } else {
                    this.halt(HaltEventType.Unknown, new CrtError("Packet id not set for outbound subscribe"));
                }
                break;

            case mqtt5_packet.PacketType.Unsubscribe:
                if (operation.packetId != undefined) {
                    this.pendingNonPublishAcks.set(operation.packetId, operation.id);
                    let unsubscribeOptions = operation.options as UnsubscribeOptionsInternal;
                    timeoutMillis = unsubscribeOptions.options.timeoutInMillis;
                } else {
                    this.halt(HaltEventType.Unknown, new CrtError("Packet id not set for outbound unsubscribe"));
                }
                break;

            case mqtt5_packet.PacketType.Disconnect:
                this.pendingWriteCompletionOperations.push(operation.id);
                this.halt(HaltEventType.Normal, new CrtError("User-initiated disconnect"));
                break;

            default:
                this.pendingWriteCompletionOperations.push(operation.id);
                break;
        }

        if (timeoutMillis) {
            this.operationTimeouts.push({
                operationId : operation.id,
                timeoutElapsedMillis: this.elapsedMillis + timeoutMillis
            });
        }

        return this.haltState != undefined;
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
            if (this.currentOperation != undefined) {
                currentOperation = this.operations.get(this.currentOperation);
            }

            while (currentOperation == undefined) {
                currentOperation = this.dequeueNextOperation(serviceQueueType);
                if (currentOperation == undefined) {
                    break;
                }

                this.bindPacketId(currentOperation);

                let validationError : any = undefined;
                try {
                    validate.validateBinaryOutboundPacket(currentOperation.packet, this.config.protocolVersion, this.lastNegotiatedSettings);
                } catch (e) {
                    validationError = e;
                }

                if (validationError == undefined) {
                    this.currentOperation = currentOperation.id;
                    this.encoder.initForPacket(currentOperation.packet);
                } else {
                    this.failOperation(currentOperation.id, new CrtError(`Binary outbound packet validation failed: ${validationError}`));
                    currentOperation = undefined;
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
                    done = this.onOperationProcessed(currentOperation);
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
                this.halt(HaltEventType.Timeout, new CrtError("Connack timeout"));
                return {};
            }
        }

        return this.serviceOutboundOperations(ServiceQueueType.HighPriorityOnly, context.socketBuffer);
    }

    private servicePing() {
        if (!this.config.connectOptions.keepAliveIntervalSeconds) {
            return;
        }

        if (this.nextOutboundPingElapsedMillis) {
            if (this.elapsedMillis >= this.nextOutboundPingElapsedMillis) {
                let pingreq : model.PingreqPacketBinary = {
                    type: mqtt5_packet.PacketType.Pingreq
                };
                this.submitOperationHighPriority(model.convertInternalPacketToBinary(pingreq), QueueEndType.Front);

                this.pushOutNextPing(this.elapsedMillis);
                let timeoutMillis = utils.foldTimeMin(this.config.connectOptions.keepAliveIntervalSeconds * 1000 / 2, this.config.pingTimeoutMillis) ?? 0;
                this.pendingPingrespTimeoutElapsedMillis = this.elapsedMillis + timeoutMillis;
            }
        }

        if (this.pendingPingrespTimeoutElapsedMillis) {
            if (this.elapsedMillis >= this.pendingPingrespTimeoutElapsedMillis) {
                this.halt(HaltEventType.Timeout, new CrtError("Pingresp timeout"));
            }
        }
    }

    private serviceOperationTimeouts() {
        while (!this.operationTimeouts.empty()) {
            let top = this.operationTimeouts.peek();
            if (top == undefined) {
                break; // should be impossible
            }

            if (top.timeoutElapsedMillis > this.elapsedMillis) {
                break;
            }

            this.operationTimeouts.pop();
            this.failOperation(top.operationId, new CrtError("Operation timed out"));
        }
    }

    private serviceConnected(context: ServiceContext) : ServiceResult
    {
        this.servicePing();

        this.serviceOperationTimeouts();

        return this.serviceOutboundOperations(ServiceQueueType.All, context.socketBuffer);
    }

    private updateElapsedMillis(elapsedMillis: number) : void {
        this.elapsedMillis = elapsedMillis;
    }

    private submitOperation(operation: ClientOperation, userPacket: mqtt5_packet.IPacket | undefined, queueType: OperationQueueType, submitLocation : QueueEndType) : void {
        this.operations.set(operation.id, operation);

        try {
            if (userPacket) {
                validate.validateUserSubmittedOutboundPacket(userPacket, this.config.protocolVersion);
            }

            if (queueType == OperationQueueType.User) {
                if (this.state != ProtocolStateType.Connected) {
                    if (!this.operationPassesOfflineQueuePolicy(operation.id)) {
                        // gets failed properly in catch clause
                        throw new CrtError("User-submitted operation did not pass offline queue policy check");
                    }
                }
            }

            let queue = this.getOperationQueue(queueType);
            if (submitLocation == QueueEndType.Front) {
                queue.unshift(operation.id);
            } else {
                queue.push(operation.id);
            }
        } catch (e) {
            this.failOperation(operation.id, e as CrtError);
        }
    }

    private createDefaultResultHandler() : ResultHandler<void> {
        return {
            onCompletionSuccess: () => {},
            onCompletionFailure: (error: CrtError) => { this.halt(HaltEventType.Unknown, error); }
        };
    }

    private submitOperationHighPriority(packet : model.IPacketBinary, queueEnd: QueueEndType, resultHandler: ResultHandler<void> = this.createDefaultResultHandler()) {
        if (packet.type == undefined) {
            this.halt(HaltEventType.Unknown, new CrtError("Packet type not set"));
            return;
        }

        let operation : ClientOperation = {
            type: packet.type,
            id: this.nextOperationId++,
            packet: packet,
            options: {
                resultHandler: resultHandler
            },
            numAttempts: 0,
        };

        this.submitOperation(operation, undefined, OperationQueueType.HighPriority, queueEnd);
    }

    private handlePublish(context: PublishContext) : void {
        let operation : ClientOperation = {
            type: mqtt5_packet.PacketType.Publish,
            id: this.nextOperationId++,
            packet: model.convertPublishPacketToBinary(context.packet),
            options: context.options,
            numAttempts: 0,
        };

        this.submitOperation(operation, context.packet, OperationQueueType.User, QueueEndType.Back);
    }

    private handleSubscribe(context: SubscribeContext) : void {
        let operation : ClientOperation = {
            type: mqtt5_packet.PacketType.Subscribe,
            id: this.nextOperationId++,
            packet: model.convertSubscribePacketToBinary(context.packet),
            options: context.options,
            numAttempts: 0,
        };

        this.submitOperation(operation, context.packet, OperationQueueType.User, QueueEndType.Back);
    }

    private handleUnsubscribe(context: UnsubscribeContext) : void {
        let operation : ClientOperation = {
            type: mqtt5_packet.PacketType.Unsubscribe,
            id: this.nextOperationId++,
            packet: model.convertUnsubscribePacketToBinary(context.packet),
            options: context.options,
            numAttempts: 0,
        };

        this.submitOperation(operation, context.packet, OperationQueueType.User, QueueEndType.Back);
    }

    private handleDisconnect(context: DisconnectContext) : void {
        if (this.state != ProtocolStateType.Connected) {
            // TODO: Log
            return;
        }

        let operation = {
            type: mqtt5_packet.PacketType.Disconnect,
            id: this.nextOperationId++,
            packet: model.convertDisconnectPacketToBinary(context.packet),
            numAttempts: 0,
        };

        // disconnects go to the front of the high priority queue
        this.submitOperation(operation, context.packet, OperationQueueType.HighPriority, QueueEndType.Front);
    }

    private handleConnectionOpened(context: ConnectionOpenedContext) : void {
        if (this.state != ProtocolStateType.Disconnected) {
            throw new CrtError("Connection opened while not disconnected");
        }

        this.haltState = undefined;

        this.changeState(ProtocolStateType.PendingConnack);
        this.encoder.reset();
        this.decoder.reset();
        this.pendingConnackTimeoutElapsedMillis = context.establishmentTimeoutMillis;
        this.connectInTransit = true;

        let connect = this.buildConnectPacket();
        this.lastOutboundConnect = connect;

        let onConnectComplete = {
            onCompletionSuccess: () => { this.connectInTransit = false },
            onCompletionFailure: (error: CrtError) => { this.connectInTransit = false }
        };

        this.submitOperationHighPriority(model.convertInternalPacketToBinary(connect), QueueEndType.Front, onConnectComplete);
    }

    private handleConnectionClosed() : void {
        if (this.state == ProtocolStateType.Disconnected) {
            throw new CrtError("Connection closed while disconnected");
        }

        this.changeState(ProtocolStateType.Disconnected);
        this.requeueCurrentOperation();
        this.pendingWriteCompletion = false;
        this.pendingFlushOperations = [];
        this.operationTimeouts.clear();
        this.nextOutboundPingElapsedMillis = undefined;
        this.pendingPingrespTimeoutElapsedMillis = undefined;
        this.pendingConnackTimeoutElapsedMillis = undefined;

        let failError = new CrtError("failed OfflineQueuePolicy check on disconnect");

        // 0. fail high priority queue (disconnect, connect, pingreq, puback); if we ever support qos 2 this changes
        this.highPriorityOperationQueue.forEach((operationId) => { this.failOperation(operationId, failError)});
        this.highPriorityOperationQueue = [];

        // 1. filter write completions, keep survivors
        let remainingWriteCompletions = this.partitionAndFailQueueByOfflineQueuePolicy(this.pendingWriteCompletionOperations, failError);
        this.pendingWriteCompletionOperations = [];

        // 2. filter non-publish pending ack and append to user queue
        this.pendingNonPublishAcks.forEach((operationId) => {
            if (this.operationPassesOfflineQueuePolicy(operationId)) {
                this.userOperationQueue.push(operationId);
            } else {
                this.failOperation(operationId, failError);
            }
        });
        this.pendingNonPublishAcks.clear();

        // 3. mark publish pending ack as duplicate and append to resubmit queue
        this.pendingPublishAcks.forEach((operationId) => {
            let operation = this.operations.get(operationId);
            if (operation) {
                let publish = operation.packet as model.PublishPacketBinary;
                publish.duplicate = 1;
            }

            this.resubmitOperationQueue.push(operationId);
        });
        this.pendingPublishAcks.clear();

        // 4. filter user queue
        this.userOperationQueue = this.partitionAndFailQueueByOfflineQueuePolicy(this.userOperationQueue, failError);

        // 5. append preserved write completion operations to user queue
        this.userOperationQueue = this.userOperationQueue.concat(remainingWriteCompletions);

        // side-affected queues (user and resubmit) will be sorted on the transition to connected state
    }

    private isReceivedPacketTypeValidForState(type: mqtt5_packet.PacketType | undefined) : boolean {
        switch(this.state) {
            case ProtocolStateType.Connected:
                if (type == mqtt5_packet.PacketType.Publish ||
                       type == mqtt5_packet.PacketType.Puback ||
                       type == mqtt5_packet.PacketType.Suback ||
                       type == mqtt5_packet.PacketType.Unsuback ||
                       type == mqtt5_packet.PacketType.Pingresp) {
                    return true;
                }

                if (type == mqtt5_packet.PacketType.Disconnect) {
                    return this.config.protocolVersion == model.ProtocolMode.Mqtt5;
                }

                return false;

            case ProtocolStateType.PendingConnack:
                return type == mqtt5_packet.PacketType.Connack && !this.connectInTransit;

            case ProtocolStateType.Disconnected:
                return false;

            default:
                throw new CrtError("Unknown protocol state");
        }
    }

    private handleIncomingData(context: NetworkEventContext) : void {
        if (this.haltState) {
            return;
        }

        if (this.state == ProtocolStateType.Disconnected) {
            this.halt(HaltEventType.Unknown, new CrtError("Data received while disconnected"));
            return;
        }

        let incomingDataContext = context.context as IncomingDataContext;
        context.decodedPackets = this.decoder.decode(incomingDataContext.data);
        for (let packet of context.decodedPackets) {
            if (!this.isReceivedPacketTypeValidForState(packet.type)) {
                this.halt(HaltEventType.ProtocolError, new CrtError("Received packet type not valid for current state"));
                return;
            }

            try {
                validate.validateInboundPacket(packet, this.config.protocolVersion);
            } catch (e) {
                this.halt(HaltEventType.ProtocolError, e as CrtError);
                continue;
            }

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

    private handleIncomingConnack(packet: model.ConnackPacketInternal) : void {
        if (this.state != ProtocolStateType.PendingConnack) {
            this.halt(HaltEventType.ProtocolError, new CrtError("Connack received while not in PendingConnack state"));
            return;
        }

        this.pendingConnackTimeoutElapsedMillis = undefined;
        this.connectInTransit = false;

        if (packet.reasonCode == mqtt5_packet.ConnectReasonCode.Success) {
            this.hasSuccessfullyConnected = true;
            this.changeState(ProtocolStateType.Connected);
            this.lastNegotiatedSettings = createNegotiatedSettings(this.lastOutboundConnect, packet);
            this.resetNextPing();
            this.applySessionState(packet.sessionPresent);
        } else {
            this.halt(HaltEventType.Normal, new CrtError(`Connection rejected with reason code ${packet.reasonCode}`));
        }
    }

    private handleIncomingPublish(packet: model.PublishPacketInternal) : void {
        if (packet.qos == mqtt5_packet.QoS.AtLeastOnce) {
            if (!packet.packetId) {
                this.halt(HaltEventType.ProtocolError, new CrtError("QoS 1 publish received with illegal packet id"));
                return;
            }

            let puback : model.PubackPacketBinary = {
                type: mqtt5_packet.PacketType.Puback,
                packetId: packet.packetId,
                reasonCode: mqtt5_packet.PubackReasonCode.Success
            };

            this.submitOperationHighPriority(puback, QueueEndType.Back);
        }
    }

    private handleIncomingPuback(packet: model.PubackPacketInternal) : void {
        let id = packet.packetId;
        let operationId = this.pendingPublishAcks.get(id);
        if (!operationId) {
            // TODO: log, this is not an error, can happen due to timeouts
            return;
        }

        let operation = this.operations.get(operationId);
        if (!operation) {
            // TODO: log, this is not an error, can happen due to timeouts, etc...
            return;
        }

        this.pushOutNextPing(operation.flushTimepoint);
        this.completeOperation(operationId, {
            type: client.PublishResultType.Qos1,
            packet: packet,
        });
    }

    private handleIncomingSuback(packet: model.SubackPacketInternal) : void {
        let id = packet.packetId;
        let operationId = this.pendingNonPublishAcks.get(id);
        if (!operationId) {
            // TODO: log, this is not an error, can happen due to timeouts
            return;
        }

        let operation = this.operations.get(operationId);
        if (!operation) {
            // TODO: log
            return;
        }

        this.pushOutNextPing(operation.flushTimepoint);
        this.completeOperation(operationId, packet);
    }

    private handleIncomingUnsuback(packet: model.UnsubackPacketInternal) : void {
        let id = packet.packetId;
        let operationId = this.pendingNonPublishAcks.get(id);
        if (!operationId) {
            // TODO: log, this is not an error, can happen due to timeouts
            return;
        }

        let operation = this.operations.get(operationId);
        if (!operation) {
            // TODO: log
            return;
        }

        this.pushOutNextPing(operation.flushTimepoint);
        this.completeOperation(operationId, packet);
    }

    private handleIncomingDisconnect(packet: model.DisconnectPacketInternal) : void {
        // TODO: impl
        this.halt(HaltEventType.Normal, new CrtError("Server-side disconnect"));
    }

    private handleIncomingPingresp() : void {
        this.pendingPingrespTimeoutElapsedMillis = undefined;
    }

    private handleWriteCompletion() : void {
        if (this.haltState) {
            return;
        }

        if (this.state == ProtocolStateType.Disconnected) {
            this.halt(HaltEventType.Unknown, new CrtError("Received write completion while disconnected"));
            return;
        }

        if (!this.pendingWriteCompletion) {
            this.halt(HaltEventType.Unknown, new CrtError("Received write completion while no write was pending"));
            return;
        }

        this.pendingFlushOperations.forEach((id) => {
            let operation = this.operations.get(id);
            if (operation) {
                operation.flushTimepoint = this.elapsedMillis;
            }
        });

        this.pendingFlushOperations = [];

        this.pendingWriteCompletionOperations.forEach((id) => {
            this.completeOperation(id, undefined);
        })

        this.pendingWriteCompletionOperations = [];

        this.pendingWriteCompletion = false;
    }

    private computeCleanStart() : boolean {
        let resumeSessionPolicy = this.config.connectOptions.resumeSessionPolicy ?? ResumeSessionPolicyType.Default;

        switch (resumeSessionPolicy) {
            case ResumeSessionPolicyType.Always:
                return false;

            case ResumeSessionPolicyType.PostSuccess:
                return !this.hasSuccessfullyConnected;

            default:
                return true;
        }
    }

    private buildConnectPacket() : model.ConnectPacketInternal {
        let connectOptions = this.config.connectOptions;

        let connect_packet : model.ConnectPacketInternal = {
            type: mqtt5_packet.PacketType.Connect,
            keepAliveIntervalSeconds: connectOptions.keepAliveIntervalSeconds,
            cleanStart: this.computeCleanStart()
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

    private halt(type: HaltEventType, error: CrtError) {
        if (this.haltState) {
            return;
        }

        this.haltState = {
            type: type,
            reason: error
        };

        // TODO: potentially defer this in order to prevent recursive invocations
        this.emit(ProtocolState.HALTED, this.haltState);
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
        } else {
            this.highPriorityOperationQueue.unshift(this.currentOperation);
        }

        this.currentOperation = undefined;
    }

    private operationPassesOfflineQueuePolicy(operationId: number) : boolean {
        let operation = this.operations.get(operationId);
        if (!operation) {
            return false;
        }

        let queuePolicy = this.config.offlineQueuePolicy;
        if (queuePolicy == OfflineQueuePolicy.PreserveNothing) {
            return false;
        }

        switch (operation.type) {
            case mqtt5_packet.PacketType.Publish:
                if (queuePolicy == OfflineQueuePolicy.PreserveAll) {
                    return true;
                }

                let publish = operation.packet as model.PublishPacketBinary;
                return publish.qos != mqtt5_packet.QoS.AtMostOnce;

            case mqtt5_packet.PacketType.Subscribe:
            case mqtt5_packet.PacketType.Unsubscribe:
                return queuePolicy == OfflineQueuePolicy.PreserveAll || queuePolicy == OfflineQueuePolicy.PreserveAcknowledged;

            default:
                return false;
        }
    }

    private partitionAndFailQueueByOfflineQueuePolicy(queue: Array<number>, failError: CrtError) : Array<number> {
        let preserved : Array<number> = [];

        queue.forEach((operationId) => {
            if (this.operationPassesOfflineQueuePolicy(operationId)) {
                preserved.push(operationId);
            } else {
                this.failOperation(operationId, failError);
            }
        });

        return preserved;
    }

    private applySessionState(sessionPresent: boolean) {
        if (!sessionPresent) {
            let failError = new CrtError("failed OfflineQueuePolicy check on reconnect with no session");
            let remaining = this.partitionAndFailQueueByOfflineQueuePolicy(this.resubmitOperationQueue, failError);
            this.userOperationQueue = this.userOperationQueue.concat(remaining);
            this.resubmitOperationQueue = [];

            // undo all packet id bindings
            this.boundPacketIds.forEach((operationId, packetId) => {
                let operation = this.operations.get(operationId);
                if (operation) {
                    operation.packetId = undefined;
                }
            });
            this.boundPacketIds.clear();
            this.nextPacketId = 1;
        }

        this.sortOperationQueue(this.userOperationQueue);
        this.sortOperationQueue(this.resubmitOperationQueue);
    }

    private sortOperationQueue(queue: Array<number>) {
        queue.sort((lhs, rhs) => {
            if (lhs < rhs) {
                return -1;
            } else if (lhs > rhs) {
                return 1;
            }

            return 0;
        });
    }
}




function createNegotiatedSettings(connect: model.ConnectPacketInternal, connack: mqtt5.ConnackPacket) : mqtt5.NegotiatedSettings {
    return {
        maximumQos: Math.min(connack.maximumQos ?? mqtt5.QoS.ExactlyOnce, mqtt5.QoS.AtLeastOnce),
        sessionExpiryInterval: connack.sessionExpiryInterval ?? connect.sessionExpiryIntervalSeconds ?? 0,
        receiveMaximumFromServer: connack.receiveMaximum ?? mqtt5_utils.DEFAULT_RECEIVE_MAXIMUM,
        maximumPacketSizeToServer: connack.maximumPacketSize ?? mqtt5_utils.MAXIMUM_PACKET_SIZE,
        topicAliasMaximumToServer: 0, // TODO
        topicAliasMaximumToClient: 0, // TODO
        serverKeepAlive: connack.serverKeepAlive ?? connect.keepAliveIntervalSeconds ?? mqtt_shared.DEFAULT_KEEP_ALIVE,
        retainAvailable: connack.retainAvailable ?? true,
        wildcardSubscriptionsAvailable: connack.wildcardSubscriptionsAvailable ?? true,
        subscriptionIdentifiersAvailable: connack.subscriptionIdentifiersAvailable ?? true,
        sharedSubscriptionsAvailable: connack.sharedSubscriptionsAvailable ?? true,
        rejoinedSession: connack.sessionPresent,
        clientId: connack.assignedClientIdentifier ?? connect.clientId ?? ""
    };
}

function createDefaultNegotiatedSettings() : mqtt5.NegotiatedSettings {
    return {
        maximumQos: mqtt5.QoS.AtLeastOnce,
        sessionExpiryInterval: 0,
        receiveMaximumFromServer: mqtt5_utils.DEFAULT_RECEIVE_MAXIMUM,
        maximumPacketSizeToServer: mqtt5_utils.MAXIMUM_PACKET_SIZE,
        topicAliasMaximumToServer: 0,
        topicAliasMaximumToClient: 0,
        serverKeepAlive: mqtt_shared.DEFAULT_KEEP_ALIVE,
        retainAvailable: true,
        wildcardSubscriptionsAvailable: true,
        subscriptionIdentifiersAvailable: true,
        sharedSubscriptionsAvailable: true,
        rejoinedSession: false,
        clientId: ""
    }
}

function createDefaultConnect() : model.ConnectPacketInternal {
    return {
        keepAliveIntervalSeconds: mqtt_shared.DEFAULT_KEEP_ALIVE,
        cleanStart: true
    };
}