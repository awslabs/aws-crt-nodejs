/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as model from "./model";
import * as encoder from "./encoder";
import * as decoder from "./decoder";
import * as heap from "./heap";
import * as validate from "./validate";
import {CrtError} from "../error";

import * as mqtt5 from "../mqtt5";
import * as mqtt_shared from "../../common/mqtt_shared";
import * as mqtt5_utils from "../mqtt5_utils";

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
    elapsedMillis : number,
    decodedPackets? : Array<mqtt5_packet.IPacket> // in-order output sequence of all packets received during an incoming data event
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

export interface ConnectOptions {
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
    will?: mqtt5_packet.PublishPacket;
    userProperties?: Array<mqtt5_packet.UserProperty>;
}

/**
 * Controls how disconnects affect the queued and in-progress operations tracked by the client.  Also controls
 * how operations are handled while the client is not connected.  In particular, if the client is not connected,
 * then any operation that would be failed on disconnect (according to these rules) will be rejected.
 *
 * A deliberate mirror of the native ClientOperationQueueBehavior enum
 */
export enum OfflineQueuePolicy {

    /** Same as FailQos0PublishOnDisconnect */
    Default = 0,

    /**
     * Re-queues QoS 1+ publishes on disconnect; un-acked publishes go to the front while unprocessed publishes stay
     * in place.  All other operations (QoS 0 publishes, subscribe, unsubscribe) are failed.
     */
    FailNonQos1PublishOnDisconnect = 1,

    /**
     * QoS 0 publishes that are not complete at the time of disconnection are failed.  Un-acked QoS 1+ publishes are
     * re-queued at the head of the line for immediate retransmission on a session resumption.  All other operations
     * are requeued in original order behind any retransmissions.
     */
    FailQos0PublishOnDisconnect = 2,

    /**
     * All operations that are not complete at the time of disconnection are failed, except operations that
     * the MQTT5 spec requires to be retransmitted (un-acked QoS1+ publishes).
     */
    FailAllOnDisconnect = 3,
}

export interface ProtocolStateConfig {
    protocolVersion : model.ProtocolMode,
    offlineQueuePolicy : OfflineQueuePolicy,
    connectOptions : ConnectOptions,
}

enum OperationQueueType {
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

const MAXIMUM_NUMBER_OF_PACKET_IDS : number = 65535;
const MAXIMUM_PACKET_ID : number = 65535;

export class ProtocolState implements IProtocolState {

    private config : ProtocolStateConfig;
    private state : ProtocolStateType = ProtocolStateType.Disconnected;

    private halted: boolean = false;
    private haltError? : CrtError;

    private elapsedMillis : number = 0;

    private pendingConnackTimeoutElapsedMillis? : number = undefined;
    private nextOutboundPingElapsedMillis? : number = undefined;
    private pendingPingrespTimeoutElapsedMillis? : number = undefined;

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
    private pendingFlushOperations: Array<number> = new Array<number>();

    private pendingPublishAcks : Map<number, number> = new Map<number, number>();
    private pendingNonPublishAcks : Map<number, number> = new Map<number, number>();

    private operationTimeouts : heap.MinHeap<OperationTimeoutRecord> = new heap.MinHeap<OperationTimeoutRecord>(compareTimeoutRecords);

    private lastNegotiatedSettings : mqtt5.NegotiatedSettings = createDefaultNegotiatedSettings();
    private lastOutboundConnect : model.ConnectPacketInternal = createDefaultConnect();

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
        this.pendingFlushOperations = [];

        this.operationTimeouts.clear();

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

        try {
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

    private resetNextPing() {
        this.pendingPingrespTimeoutElapsedMillis = undefined;
        this.pushOutNextPing(this.elapsedMillis);
    }

    private pushOutNextPing(baseTime: number | undefined) {
        if (!this.config.connectOptions.keepAliveIntervalSeconds) {
            return;
        }

        if (baseTime) {
            let pingTime = baseTime + this.config.connectOptions.keepAliveIntervalSeconds * 1000;

            this.nextOutboundPingElapsedMillis = foldTimeMax(this.nextOutboundPingElapsedMillis, pingTime);
        }
    }

    private unbindPacketId(id: number | undefined) {
        if (id == undefined) {
            return;
        }

        this.boundPacketIds.delete(id);
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
        return foldTimeMin(this.getQueueServiceTimepoint(ServiceQueueType.HighPriorityOnly), this.pendingConnackTimeoutElapsedMillis);
    }

    private getNextServiceTimepointConnected() : number | undefined {
        let serviceTime = this.getQueueServiceTimepoint(ServiceQueueType.All);
        serviceTime = foldTimeMin(serviceTime, this.nextOutboundPingElapsedMillis);
        serviceTime = foldTimeMin(serviceTime, this.pendingPingrespTimeoutElapsedMillis);
        serviceTime = foldTimeMin(serviceTime, this.operationTimeouts.peek()?.timeoutElapsedMillis);

        return serviceTime;
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
                    this.halt(new CrtError("Packet id not set for outbound subscribe"));
                }
                break;

            case mqtt5_packet.PacketType.Unsubscribe:
                if (operation.packetId != undefined) {
                    this.pendingNonPublishAcks.set(operation.packetId, operation.id);
                    let unsubscribeOptions = operation.options as UnsubscribeOptionsInternal;
                    timeoutMillis = unsubscribeOptions.options.timeoutInMillis;
                } else {
                    this.halt(new CrtError("Packet id not set for outbound unsubscribe"));
                }
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

            while (this.currentOperation == undefined) {
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

    private servicePing() {
        if (!this.config.connectOptions.keepAliveIntervalSeconds) {
            return;
        }

        if (this.nextOutboundPingElapsedMillis) {
            if (this.elapsedMillis >= this.nextOutboundPingElapsedMillis) {
                let pingreq : model.PingreqPacketBinary = {
                    type: mqtt5_packet.PacketType.Pingreq
                };
                this.submitOperationHighPriority(model.convertInternalPacketToBinary(pingreq));

                this.pushOutNextPing(this.elapsedMillis);
                this.pendingPingrespTimeoutElapsedMillis = this.elapsedMillis + this.config.connectOptions.keepAliveIntervalSeconds / 2;
            }
        }

        if (this.pendingPingrespTimeoutElapsedMillis) {
            if (this.elapsedMillis >= this.pendingPingrespTimeoutElapsedMillis) {
                this.halt(new CrtError("Pingresp timeout"));
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

    private servicePendingDisconnect(context: ServiceContext) : ServiceResult
    {
        return this.serviceOutboundOperations(ServiceQueueType.HighPriorityOnly, context.socketBuffer);
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

    private submitOperationHighPriority(packet : model.IPacketBinary) {
        if (packet.type == undefined) {
            this.halt(new CrtError("Packet type not set"));
            return;
        }

        let resultHandler : ResultHandler<void> = {
            onCompletionSuccess: () => {},
            onCompletionFailure: (error: CrtError) => { this.halt(error); }
        };

        let operation : ClientOperation = {
            type: packet.type,
            id: this.nextOperationId++,
            packet: packet,
            options: {
                resultHandler: resultHandler
            },
            numAttempts: 0,
        };

        this.submitOperation(operation, undefined, OperationQueueType.HighPriority, QueueEndType.Front);
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
        let options : GenericOptionsInternal = {
            resultHandler: {
                onCompletionSuccess: () => {
                    this.halt(new CrtError("User-initiated disconnect complete"));
                },
                onCompletionFailure: (error: CrtError) => {
                    this.halt(error);
                }
            }
        };

        let operation = {
            type: mqtt5_packet.PacketType.Disconnect,
            id: this.nextOperationId++,
            packet: model.convertDisconnectPacketToBinary(context.packet),
            options: options,
            numAttempts: 0,
        };

        // disconnects go to the front of the high priority queue
        this.submitOperation(operation, context.packet, OperationQueueType.HighPriority, QueueEndType.Front);
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
        this.lastOutboundConnect = connect;

        this.submitOperationHighPriority(model.convertInternalPacketToBinary(connect));
    }

    private handleConnectionClosed() : void {
        if (this.state == ProtocolStateType.Disconnected) {
            throw new CrtError("Connection closed while disconnected");
        }

        // TODO: Fail user/resub operations that do not pass offline queue policy

        this.changeState(ProtocolStateType.Disconnected);
    }

    private handleIncomingData(context: NetworkEventContext) : void {
        if (this.halted) {
            return;
        }

        if (this.state == ProtocolStateType.Disconnected) {
            this.halt(new CrtError("Data received while disconnected"));
            return;
        }

        let incomingDataContext = context.context as IncomingDataContext;
        context.decodedPackets = this.decoder.decode(incomingDataContext.data);
        for (let packet of context.decodedPackets) {
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
            this.halt(new CrtError("Connack received while not in PendingConnack state"));
            return;
        }

        this.pendingConnackTimeoutElapsedMillis = undefined;

        if (packet.reasonCode == mqtt5_packet.ConnectReasonCode.Success) {
            this.changeState(ProtocolStateType.Connected);
            this.lastNegotiatedSettings = createNegotiatedSettings(this.lastOutboundConnect, packet);
            this.resetNextPing();
        } else {
            this.halt(new CrtError(`Connection rejected with reason code ${packet.reasonCode}`));
        }
    }

    private handleIncomingPublish(packet: model.PublishPacketInternal) : void {
        if (packet.qos == mqtt5_packet.QoS.AtLeastOnce) {
            if (packet.packetId == undefined) {
                this.halt(new CrtError("QoS 1 publish received without packet id"));
                return;
            }

            let puback : model.PubackPacketBinary = {
                type: mqtt5_packet.PacketType.Puback,
                packetId: packet.packetId,
                reasonCode: mqtt5_packet.PubackReasonCode.Success
            };

            this.submitOperationHighPriority(puback);
        }
    }

    private handleIncomingPuback(packet: model.PubackPacketInternal) : void {
        let id = packet.packetId;
        let operationId = this.pendingPublishAcks.get(id);
        if (!operationId) {
            // TODO: log
            return;
        }

        let operation = this.operations.get(operationId);
        if (!operation) {
            // TODO: log
            return;
        }

        this.pushOutNextPing(operation.flushTimepoint);
        this.completeOperation(operationId, {
            type: PublishResultType.Qos1,
            packet: packet,
        });
    }

    private handleIncomingSuback(packet: model.SubackPacketInternal) : void {
        let id = packet.packetId;
        let operationId = this.pendingNonPublishAcks.get(id);
        if (!operationId) {
            // TODO: log
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
            // TODO: log
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
        this.halt(new CrtError("Server-side disconnect"));
    }

    private handleIncomingPingresp() : void {
        this.pendingPingrespTimeoutElapsedMillis = undefined;
    }

    private handleWriteCompletion() : void {
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

    private halt(error: CrtError) {
        if (this.halted) {
            return;
        }

        this.halted = true;
        this.haltError = error;
    }

    private throwIfHalted() {
        if (this.halted) {
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

    private getOperationQueue(type: OperationQueueType) : Array<number> {
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

    private operationPassesOfflineQueuePolicy(operationId: number) : boolean {
        // TODO: impl
        return false;
    }
}


function foldTimeMin(lhs : number | undefined, rhs : number | undefined) : number | undefined {
    if (lhs == undefined) {
        return rhs;
    }

    if (rhs == undefined) {
        return lhs;
    }

    return Math.min(lhs, rhs);
}

function foldTimeMax(lhs : number | undefined, rhs : number | undefined) : number | undefined {
    if (lhs == undefined) {
        return rhs;
    }

    if (rhs == undefined) {
        return lhs;
    }

    return Math.max(lhs, rhs);
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