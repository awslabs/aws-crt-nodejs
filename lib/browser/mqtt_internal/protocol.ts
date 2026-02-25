/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from '../../common/mqtt5_packet';
import {PacketType} from '../../common/mqtt5_packet';
import * as model from "./model";
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

/**
 * Additional options that can be applied to a publish operation
 */
export interface PublishOptions {

    /**
     * Maximum time, in milliseconds, to wait for the operation to complete once it has been started.  Time in queue
     * is not considered in this timeout.
     */
    timeoutInMillis? : number
}

/**
 * Algebraic union indicator type for what is in the result of a publish operation
 */
export enum PublishResultType {
    Qos0,
    Qos1,
}

/**
 * Result of a successful publish operation -- a discriminated union containing all possible outcomes
 */
export interface PublishResult {
    type: PublishResultType,
    packet?: mqtt5_packet.PubackPacket,
}

/**
 * Additional options that can be applied to a subscribe operation
 */
export interface SubscribeOptions {

    /**
     * Maximum time, in milliseconds, to wait for the operation to complete once it has been started.  Time in queue
     * is not considered in this timeout.
     */
    timeoutInMillis? : number
}

/**
 * Additional options that can be applied to an unsubscribe operation
 */
export interface UnsubscribeOptions {

    /**
     * Maximum time, in milliseconds, to wait for the operation to complete once it has been started.  Time in queue
     * is not considered in this timeout.
     */
    timeoutInMillis? : number
}

/**
 * Controls how the client will attempt to use MQTT sessions.
 */
export enum ResumeSessionPolicyType {

    /** User clean start true until a successful connection is established.  Afterwards, always attempt to rejoin a session */
    PostSuccess = 0,

    /** Never rejoin a session.  Clean start is always true. */
    Never = 1,

    /** Always try to rejoin a session.  Clean start is always false.  This setting is technically not spec-compliant */
    Always = 2,

    /** Option to use when no option is specified. */
    Default = 0,
}

/**
 * Signature of a function that transforms the connect packet sent to the server when connecting.  Useful for scenarios
 * where the user wants dynamic control of the connect packet properties.
 *
 * Fields that are only relevant to MQTT5 are ignored by the client when operating in MQTT311 mode.
 */
export type ConnectPacketTransformer = (packet: mqtt5_packet.ConnectPacket) => void;

/**
 * Configuration options relevant to the Connect packet sent by the client when establishing a new connection
 */
export interface ConnectOptions {

    /** Optional transformation function for dynamic Connect packet construction */
    connectPacketTransformer? : ConnectPacketTransformer,

    /** MQTT Keep alive value, in seconds, to use */
    keepAliveIntervalSeconds: number;

    /** How the client should use MQTT sessions */
    resumeSessionPolicy?: ResumeSessionPolicyType,

    /** Client id to use */
    clientId?: string;

    /** Username to use */
    username?: string;

    /** Password to use */
    password?: BinaryData;

    /** Value to use for the session expiry interval property in the Connect packet */
    sessionExpiryIntervalSeconds?: number;

    /** Value to use for the request response information property in the Connect packet */
    requestResponseInformation?: boolean;

    /** Value to use for the request problem information property in the Connect packet */
    requestProblemInformation?: boolean;

    /** Value to use for the receive maximum property in the Connect packet */
    receiveMaximum?: number;

    /** Value to use for the maximum packet size property in the Connect packet */
    maximumPacketSizeBytes?: number;

    /** Value to use for the will delay interval property in the Connect packet */
    willDelayIntervalSeconds?: number;

    /** Value to use for the will property in the Connect packet */
    will?: mqtt5_packet.PublishPacket;

    /** u\User properties to use in the Connect packet */
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

    /** Operations are never failed due to connection state */
    PreserveAll = 0,

    /** Qos0 Publishes are failed when there is no connection, all other operations are left alone. */
    PreserveAcknowledged,

    /** Only QoS1 and QoS2 publishes are retained when there is no connection */
    PreserveQos1PlusPublishes,

    /** Nothing is retained when there is no connection */
    PreserveNothing,

    /** Keep everything by default */
    Default = 0,
}

/**
 * Generic encapsulation of operation callbacks for both the success and failure pathways
 */
export interface ResultHandler<T> {
    onCompletionSuccess : (value : T) => void;
    onCompletionFailure : (error : CrtError) => void;
}

/**
 * States that the protocol object can be in
 */
export enum ProtocolStateType {

    /** Not connected to anything */
    Disconnected,

    /** Transport connected, but connect-connack handshake has not completed */
    PendingConnack,

    /** An MQTT connection has been successfully established */
    Connected
}

/**
 * Different network-related events that the protocol implementation is interested in
 */
export enum NetworkEventType {

    /** A transport connection has been successfully established */
    ConnectionOpened,

    /** The current transport connection has been closed */
    ConnectionClosed,

    /** Data has been received on the current connection */
    IncomingData,

    /** Outbound data from the protocol state has been flushed to the socket */
    WriteCompletion,
}

/**
 * Supplemental information about a ConnectionOpened event
 */
export interface ConnectionOpenedContext {

    /** Remaining time, in milliseconds, for the MQTT handshake to complete before a timeout should occur */
    establishmentTimeoutMillis: number
}

/**
 * Supplemental information about an IncomingData event
 */
export interface IncomingDataContext {

    /** Binary data read from the socket */
    data: DataView,
}

/**
 * Discriminated union holding information about a network event that the protocol state needs to know about
 */
export interface NetworkEventContext {

    /** type of event (controls value for context) */
    type : NetworkEventType,

    /** Supplemental data about the event */
    context? : ConnectionOpenedContext | IncomingDataContext,

    /** Timestamp of the event */
    elapsedMillis : number,
}

/**
 * Discriminated union tag type for the different kind of user events that the protocol state handles.
 */
export enum UserEventType {

    /** Send a publish packet */
    Publish,

    /** Send a subscribe packet */
    Subscribe,

    /** Send an unsubscribe packet */
    Unsubscribe,

    /** Send a disconnect packet and halt the protocol state */
    Disconnect
}

/**
 * Publish options that includes both external (user) and internal (client) configuration
 */
export interface PublishOptionsInternal {

    /** User-facing options */
    options: PublishOptions,

    /** Completion callbacks */
    resultHandler : ResultHandler<PublishResult>
}

/**
 * Supplemental information for a publish operation
 */
export interface PublishContext {

    /** Publish packet to send */
    packet : mqtt5_packet.PublishPacket,

    /** Publish configuration options */
    options : PublishOptionsInternal
}

/**
 * Subscribe options that includes both external (user) and internal (client) configuration
 */
export interface SubscribeOptionsInternal {

    /** User-facing options */
    options: SubscribeOptions,

    /** Completion callbacks */
    resultHandler : ResultHandler<mqtt5_packet.SubackPacket>
}

/**
 * Supplemental information for a subscribe operation
 */
export interface SubscribeContext {

    /** Subscribe packet to send */
    packet : mqtt5_packet.SubscribePacket,

    /** Subscribe configuration options */
    options : SubscribeOptionsInternal
}

/**
 * Unsubscribe options that includes both external (user) and internal (client) configuration
 */
export interface UnsubscribeOptionsInternal {

    /** User-facing options */
    options: UnsubscribeOptions,

    /** Completion callbacks */
    resultHandler : ResultHandler<mqtt5_packet.UnsubackPacket>
}

/** Union of all possible operation results */
type OperationResultType = PublishResult | mqtt5_packet.SubackPacket | mqtt5_packet.UnsubackPacket | undefined;

/**
 * Supplemental information for an unsubscribe operation
 */
export interface UnsubscribeContext {

    /** Unsubscribe packet to send */
    packet : mqtt5_packet.UnsubscribePacket,

    /** Unsubscribe configuration options */
    options : UnsubscribeOptionsInternal
}

/**
 * Supplemental information for a disconnect operation
 */
export interface DisconnectContext {

    /** Disconnect packet to send */
    packet : mqtt5_packet.DisconnectPacket,

    /** Disconnect completion callbacks */
    resultHandler : ResultHandler<void>
}

/**
 * Discriminated union holding information about a user operation event that the protocol state must handle
 */
export interface UserEventContext {

    /** type of event (controls value for context) */
    type: UserEventType,

    /** Supplemental data about the event */
    context: PublishContext | SubscribeContext | UnsubscribeContext | DisconnectContext,

    /** Timestamp of the event */
    elapsedMillis: number
}

/**
 * Supplemental information about the service invocation
 */
export interface ServiceContext {

    /** Current timestamp */
    elapsedMillis: number,

    /** Fixed-size output buffer for any data that should be written to the socket */
    socketBuffer: ArrayBuffer,
}

/**
 * Result of a service invocation
 */
export interface ServiceResult {

    /** Data that should be written to the socket.  This DataView is over the buffer passed in to the service call */
    toSocket?: DataView
}

/**
 * Protocol state public API.  All additional public functions are test-only for state introspection.
 *
 * We don't use this interface explicitly.  It exists to show the simplicity of the protocol state contract.
 */
interface IProtocolState {

    /**
     * Handle a network-related event:
     *   connection open/close, incoming data, and socket write completion
     *
     * @param context information about the event
     */
    handleNetworkEvent(context: NetworkEventContext) : void;

    /**
     * Handle a user-submitted operation:
     *   Publish, Subscribe, Unsubscribe, or Disconnect
     *
     * @param context information about the operation
     */
    handleUserEvent(context: UserEventContext) : void;

    /**
     * Function that drives time-based protocol state processing
     *
     * @param context service context
     */
    service(context: ServiceContext) : ServiceResult;

    /**
     * Calculates the next time that the service function should be invoked, based on current state
     *
     * @param elapsedMillis current elapsed time
     */
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

/**
 * Internal options for non-public operations like  Disconnect, Connect, Pingreq, Puback
 */
export interface GenericOptionsInternal {

    /** Completion callbacks for the operation */
    resultHandler: ResultHandler<void>,
}

/**
 * Union type for all possible operation options types
 */
export type ClientOperationOptionsType = PublishOptionsInternal | SubscribeOptionsInternal | UnsubscribeOptionsInternal | GenericOptionsInternal;

/**
 * Holds all state related to a client operation (send a packet)
 */
export interface ClientOperation {

    /**
     * Type of packet this is an operation for
     */
    type: mqtt5_packet.PacketType,

    /**
     * Unique id for the operation using an id space internal to the protocol state
     */
    id : number,

    /**
     * Operation configuration options
     */
    options?: ClientOperationOptionsType,

    /**
     * Packet to send
     */
    packet : model.IPacketBinary,

    /**
     * Packet id if one has been bound
     */
    packetId? : number,

    /**
     * Timepoint when the packet was fully written to the socket
     */
    flushTimepoint? : number,

    /**
     * How many times have we tried to send this packet.  Used to determine if an interrupted current operation should
     * go in the resubmit queue or in the user queue.
     *
     * Later we could also use this to cap the number of retries to help resolve "poison" packets (packets that cause
     * IoT Core to disconnect but should be tried by spec).
     */
    numAttempts: number,
}

/**
 * Configuration options for protocol implementation
 */
export interface ProtocolStateConfig {

    /** Version of MQTT (5 or 311) to use */
    protocolVersion : model.ProtocolMode,

    /** How operations should be treated when there is no established MQTT connection */
    offlineQueuePolicy : OfflineQueuePolicy,

    /** Configuration for the Connect packet sent on transport connection establishment */
    connectOptions : ConnectOptions,

    /** Initial timepoint for all time calculations */
    baseElapsedMillis : number,

    /** Duration, in milliseconds, to wait for a Pingresp before shutting down the connection */
    pingTimeoutMillis? : number,
}

/**
 * Type of operation queue.
 *
 * The protocol implementation contains three seperate queues, that are ordered by priority.
 */
export enum OperationQueueType {

    /**
     * The high priority queue contains critical packets which must go out immediately:
     *     Connect, Puback, Disconnect, Pingreq
     */
    HighPriority,

    /**
     * The resubmit queue contains QoS1+ publishes which must be resent on reconnection as required by spec
     */
    Resubmit,

    /**
     * All other operations fall into the user queue, which is the lowest priority queue
     */
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

/**
 * Supplemental information about the Halted event.  This event is emitted when the protocol state
 * enters a terminal state relative to the connection.  A successful transport connection will break
 * the protocol state out of the halted state.
 */
export interface HaltedEvent {

    /** Exception with additional details about why the halt occurred */
    reason: CrtError,

    /** Reason category for the halt event */
    type: HaltEventType
}

/** Type for a HaltedEvent event listener function */
export type HaltedEventListener = (eventData: HaltedEvent) => void;

/**
 * Supplemental information about the PublishReceived event.  This event is emitted every time a Publish
 * packet is decoded from the incoming byte stream.
 */
export interface PublishReceivedEvent {

    /** The decoded publish packet */
    packet: mqtt5_packet.PublishPacket,
}

/** Type for a PublishReceivedEvent event listener function */
export type PublishReceivedEventListener = (eventData: PublishReceivedEvent) => void;

/**
 * Supplemental information about the DisconnectReceived event.  This event is emitted when a Disconnect
 * packet is decoded from the incoming byte stream.
 */
export interface DisconnectReceivedEvent {

    /** The decoded disconnect packet */
    packet: mqtt5_packet.DisconnectPacket,
}

/** Type for a DisconnectReceivedEvent event listener function */
export type DisconnectReceivedEventListener = (eventData: DisconnectReceivedEvent) => void;

/**
 * Supplemental information about the ConnackReceived event.  This event is emitted when the initial
 * Connack packet is received after sending a Connect packet.  Should the broker send additional Connacks
 * (a protocol error), this event will not be emitted and the protocol state will halt.
 */
export interface ConnackReceivedEvent {

    /** The decoded connack packet */
    packet: mqtt5_packet.ConnackPacket,
}

/** Type for a ConnackReceivedEvent event listener function */
export type ConnackReceivedEventListener = (eventData: ConnackReceivedEvent) => void;

const MAXIMUM_NUMBER_OF_PACKET_IDS : number = 65535;
const MAXIMUM_PACKET_ID : number = 65535;

/**
 * Encapsulates all MQTT  protocol-related behavior over the course of repeated connections to a remote broker.
 */
export class ProtocolState extends BufferedEventEmitter implements IProtocolState {

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

    private hasSuccessfullyConnected : boolean = false;

    constructor(config : ProtocolStateConfig) {
        super();
        this.config = config;
        this.encoder = new encoder.Encoder(encoder.buildClientEncodingFunctionSet(config.protocolVersion));
        this.decoder = new decoder.Decoder(decoder.buildClientDecodingFunctionSet(config.protocolVersion));
        this.elapsedMillis = config.baseElapsedMillis;
    }

    /**
     * Handle a network-related event:
     *   connection open/close, incoming data, and socket write completion
     *
     * @param context information about the event
     */
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

    /**
     * Handle a user-submitted operation:
     *   Publish, Subscribe, Unsubscribe, or Disconnect
     *
     * @param context information about the operation
     */
    handleUserEvent(context: UserEventContext) : void {
        this.cork();

        try {
            this.updateElapsedMillis(context.elapsedMillis);
            switch (context.type) {
                case UserEventType.Publish:
                    this.submitPublish(context.context as PublishContext);
                    break;
                case UserEventType.Subscribe:
                    this.submitSubscribe(context.context as SubscribeContext);
                    break;
                case UserEventType.Unsubscribe:
                    this.submitUnsubscribe(context.context as UnsubscribeContext);
                    break;
                case UserEventType.Disconnect:
                    this.submitDisconnect(context.context as DisconnectContext);
                    break;
            }
        } finally {
            this.uncork();
        }
    }

    /**
     * Function that drives time-based protocol state processing
     *
     * @param context service context
     */
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

    /**
     * Calculates the next time that the service function should be invoked, based on current state
     *
     * @param elapsedMillis current elapsed time
     */
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
     * Event emitted when a disconnect packet is received
     *
     * Listener type: {@link DisconnectReceivedEventListener}
     *
     * @event
     */
    static DISCONNECT_RECEIVED : string = 'disconnectReceived';

    /**
     * Event emitted when a publish packet is received
     *
     * Listener type: {@link PublishReceivedEventListener}
     *
     * @event
     */
    static PUBLISH_RECEIVED : string = 'publishReceived';

    /**
     * Event emitted when a connack packet is received
     *
     * Listener type: {@link ConnackReceivedEventListener}
     *
     * @event
     */
    static CONNACK_RECEIVED : string = 'connackReceived';

    /**
     * Registers a listener for the client's {@link HALTED} {@link HaltedEvent} event.  A
     * {@link HALTED} {@link HaltedEvent} event is emitted when the protocol object enters the halted state.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'halted', listener: HaltedEventListener): this;

    /**
     * Registers a listener for the client's {@link DISCONNECT_RECEIVED} {@link DisconnectReceivedEvent} event.  A
     * {@link DISCONNECT_RECEIVED} {@link DisconnectReceivedEvent} event is emitted when the protocol object decodes a Disconnect packet.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'disconnectReceived', listener: DisconnectReceivedEventListener): this;

    /**
     * Registers a listener for the client's {@link PUBLISH_RECEIVED} {@link PublishReceivedEvent} event.  A
     * {@link PUBLISH_RECEIVED} {@link PublishReceivedEvent} event is emitted when the protocol object decodes a Publish packet.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'publishReceived', listener: PublishReceivedEventListener): this;

    /**
     * Registers a listener for the client's {@link CONNACK_RECEIVED} {@link ConnackReceivedEvent} event.  A
     * {@link CONNACK_RECEIVED} {@link ConnackReceivedEvent} event is emitted when the protocol object decodes a Connack packet that indicates a successful broker connection.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'connackReceived', listener: ConnackReceivedEventListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    /* Internal Implementation */

    /**
     * Reset ping-related state.  Invoked after a Pingreq is sent.
     */
    private resetNextPing() {
        this.pendingPingrespTimeoutElapsedMillis = undefined;
        this.pushOutNextPing(this.elapsedMillis);
    }

    /**
     * Update the state to not send a pingreq until later due to the receipt of a successful ack,
     * which demonstrates a healthy connection at the time the original operation was sent.
     */
    private pushOutNextPing(baseTime: number | undefined) {
        if (!this.config.connectOptions.keepAliveIntervalSeconds) {
            return;
        }

        if (baseTime != undefined) {
            let pingTime = baseTime + this.config.connectOptions.keepAliveIntervalSeconds * 1000;

            this.nextOutboundPingElapsedMillis = utils.foldTimeMax(this.nextOutboundPingElapsedMillis, pingTime);
        }
    }

    /**
     * Releases a packet id, allowing it to be reused in outbound packets
     */
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
                        let publishHandler = operation.options.resultHandler as ResultHandler<PublishResult>;
                        if (result) {
                            publishHandler.onCompletionSuccess(result as PublishResult);
                        } else {
                            publishHandler.onCompletionSuccess({
                                type: PublishResultType.Qos0
                            });
                        }
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

    /**
     * Gets the next service timepoint when in the pending connack state.  This factors in the high-priority queue
     * (connect) and the pending connack timeout.
     */
    private getNextServiceTimepointPendingConnack() : number | undefined {
        return utils.foldTimeMin(this.getQueueServiceTimepoint(ServiceQueueType.HighPriorityOnly), this.pendingConnackTimeoutElapsedMillis);
    }

    /**
     * Gets the next service timepoint when in the connected state.  This factors in all operation queues,
     * ping functionality, and operation timeouts.
     */
    private getNextServiceTimepointConnected() : number | undefined {
        let serviceTime = this.getQueueServiceTimepoint(ServiceQueueType.All);
        serviceTime = utils.foldTimeMin(serviceTime, this.nextOutboundPingElapsedMillis);
        serviceTime = utils.foldTimeMin(serviceTime, this.pendingPingrespTimeoutElapsedMillis);
        serviceTime = utils.foldTimeMin(serviceTime, this.operationTimeouts.peek()?.timeoutElapsedMillis);

        return serviceTime;
    }

    /**
     * Gets the next service timepoint relative to operation queues.
     */
    private getQueueServiceTimepoint(serviceQueueType : ServiceQueueType) : number | undefined {
        // we don't service queued operations when there is an outstanding socket write
        if (this.pendingWriteCompletion) {
            return undefined;
        }

        // if we're in the middle of an operation, service now
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

                // user operations require more logic since there are certain conditions that we cannot
                // dequeue them (receive maximum limit, no packet ids, etc...)
                let id = this.userOperationQueue.shift();
                if (id != undefined) {
                    // there is no peek API, we have to pop and push back
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

    /**
     * Invoked on an operation after it is fully encoded to an output buffer.
     */
    private onOperationProcessed(operation: ClientOperation) : boolean {
        operation.numAttempts++;
        this.pendingFlushOperations.push(operation.id);

        let timeoutMillis : number | undefined = undefined;

        switch (operation.type) {
            case mqtt5_packet.PacketType.Publish:
                if (operation.packetId != undefined) {
                    // track the expected ack for qos 1 completion
                    this.pendingPublishAcks.set(operation.packetId, operation.id);

                    let publishOptions = operation.options as PublishOptionsInternal;
                    timeoutMillis = publishOptions.options.timeoutInMillis;
                } else {
                    // qos 0, complete the operation on write completion
                    this.pendingWriteCompletionOperations.push(operation.id);
                }
                break;

            case mqtt5_packet.PacketType.Subscribe:
                if (operation.packetId != undefined) {
                    // setup operation completion for corresponding suback
                    this.pendingNonPublishAcks.set(operation.packetId, operation.id);
                    let subscribeOptions = operation.options as SubscribeOptionsInternal;
                    timeoutMillis = subscribeOptions.options.timeoutInMillis;
                } else {
                    this.halt(HaltEventType.Unknown, new CrtError("Packet id not set for outbound subscribe"));
                }
                break;

            case mqtt5_packet.PacketType.Unsubscribe:
                if (operation.packetId != undefined) {
                    // setup operation completion for corresponding unsuback
                    this.pendingNonPublishAcks.set(operation.packetId, operation.id);
                    let unsubscribeOptions = operation.options as UnsubscribeOptionsInternal;
                    timeoutMillis = unsubscribeOptions.options.timeoutInMillis;
                } else {
                    this.halt(HaltEventType.Unknown, new CrtError("Packet id not set for outbound unsubscribe"));
                }
                break;

            case mqtt5_packet.PacketType.Disconnect:
                // complete the operation on write completion
                this.pendingWriteCompletionOperations.push(operation.id);

                // this is the last thing to be processed before halting
                this.halt(HaltEventType.Normal, new CrtError("User-initiated disconnect"));
                break;

            default:
                // pingreq, connect, puback
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
                // should never happen because we check that there's room before calling this
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

        operation.packetId = this.allocatePacketId(operation.id);

        switch (operation.type) {
            case mqtt5_packet.PacketType.Publish:
                (operation.packet as model.PublishPacketBinary).packetId = operation.packetId;
                break;

            case mqtt5_packet.PacketType.Subscribe:
                (operation.packet as model.SubscribePacketBinary).packetId = operation.packetId;
                break;

            case mqtt5_packet.PacketType.Unsubscribe:
                (operation.packet as model.UnsubscribePacketBinary).packetId = operation.packetId;
                break;

            default:
                this.halt(HaltEventType.Unknown, new CrtError("Invalid operation for packet id binding"));
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
                // nothing to do
                done = true;
            } else {
                let encodeResult = this.encoder.service(remainingView);
                if (encodeResult.type == encoder.ServiceResultType.InProgress) {
                    // ran out of room in the output buffer
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
            // there's data that should be written to the socket.  That's the caller's responsibility.
            result.toSocket = new DataView(socketBuffer, 0, socketBuffer.byteLength - remainingView.byteLength);
            this.pendingWriteCompletion = true;
        }

        return result;
    }

    private servicePendingConnack(context: ServiceContext) : ServiceResult
    {
        // check for and handle connack timeout
        if (this.pendingConnackTimeoutElapsedMillis != undefined) {
            if (this.elapsedMillis >= this.pendingConnackTimeoutElapsedMillis) {
                this.halt(HaltEventType.Timeout, new CrtError("Connack timeout"));
                return {};
            }
        }

        // service high-priority operations only
        return this.serviceOutboundOperations(ServiceQueueType.HighPriorityOnly, context.socketBuffer);
    }

    private servicePing() {
        // should we use ping at all?
        if (!this.config.connectOptions.keepAliveIntervalSeconds) {
            return;
        }

        // check for and handle sending a pingreq
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

        // check for and handle a pingresp timeout
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

    /**
     * Entry point for all operation submissions, both user and internal
     *
     * @param operation operation to add to an operation queue
     * @param userPacket original packet if this is a user operation.  Internal operations skip validation.
     * @param queueType what operation queue to submit to
     * @param submitLocation whether to submit to the front of back of the queue
     * @private
     */
    private submitOperation(operation: ClientOperation, userPacket: mqtt5_packet.IPacket | undefined, queueType: OperationQueueType, submitLocation : QueueEndType) : void {
        this.operations.set(operation.id, operation);

        try {
            if (userPacket) {
                // perform initial user-packet validation
                validate.validateUserSubmittedOutboundPacket(userPacket, this.config.protocolVersion);
            }

            // ofline queue policy check
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

    /**
     * Helper function to submit internal high-priority operations: connect, pingreq, puback
     */
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

    private submitPublish(context: PublishContext) : void {
        let operation : ClientOperation = {
            type: mqtt5_packet.PacketType.Publish,
            id: this.nextOperationId++,
            packet: model.convertPublishPacketToBinary(context.packet),
            options: context.options,
            numAttempts: 0,
        };

        this.submitOperation(operation, context.packet, OperationQueueType.User, QueueEndType.Back);
    }

    private submitSubscribe(context: SubscribeContext) : void {
        let operation : ClientOperation = {
            type: mqtt5_packet.PacketType.Subscribe,
            id: this.nextOperationId++,
            packet: model.convertSubscribePacketToBinary(context.packet),
            options: context.options,
            numAttempts: 0,
        };

        this.submitOperation(operation, context.packet, OperationQueueType.User, QueueEndType.Back);
    }

    private submitUnsubscribe(context: UnsubscribeContext) : void {
        let operation : ClientOperation = {
            type: mqtt5_packet.PacketType.Unsubscribe,
            id: this.nextOperationId++,
            packet: model.convertUnsubscribePacketToBinary(context.packet),
            options: context.options,
            numAttempts: 0,
        };

        this.submitOperation(operation, context.packet, OperationQueueType.User, QueueEndType.Back);
    }

    private submitDisconnect(context: DisconnectContext) : void {
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

        let connect = this.buildConnectPacket();
        this.lastOutboundConnect = connect;

        this.submitOperationHighPriority(model.convertInternalPacketToBinary(connect), QueueEndType.Front);
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
                return type == mqtt5_packet.PacketType.Connack;

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
        let packets = this.decoder.decode(incomingDataContext.data);
        for (let packet of packets) {
            if (!this.isReceivedPacketTypeValidForState(packet.type)) {
                this.halt(HaltEventType.ProtocolError, new CrtError(`Received packet type (${packet.type}) not valid for current state`));
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
        // at this point we can assume the packet is valid for the current state

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
        this.pendingConnackTimeoutElapsedMillis = undefined;

        this.emit(ProtocolState.CONNACK_RECEIVED, {
            packet: packet
        });

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

            // TODO: eventually support manual puback control
            let puback : model.PubackPacketBinary = {
                type: mqtt5_packet.PacketType.Puback,
                packetId: packet.packetId,
                reasonCode: mqtt5_packet.PubackReasonCode.Success
            };

            this.submitOperationHighPriority(puback, QueueEndType.Back);
        }

        this.emit(ProtocolState.PUBLISH_RECEIVED, {
            packet: packet
        });
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
            type: PublishResultType.Qos1,
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
        this.emit(ProtocolState.DISCONNECT_RECEIVED, {
            packet: packet
        });

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

    /**
     * Helper function to determine if the clean start flag should be set on the client's Connect packet
     */
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
            connect_packet.will = model.clonePublishShallow(connectOptions.will);
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
        // first event takes precedence
        if (this.haltState) {
            return;
        }

        this.haltState = {
            type: type,
            reason: error
        };

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
            // qos 1+ publishes that have been sent at least once must go in the resubmit queue
            let resubmit : boolean = operation.numAttempts > 0;
            if (resubmit && operation.type == PacketType.Publish) {
                let publish = operation.packet as model.PublishPacketBinary;
                if (publish.qos == mqtt5_packet.QoS.AtMostOnce) {
                    resubmit = false;
                }
            }

            if (resubmit) {
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

/* Negotiated settings helpers */

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