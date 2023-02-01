/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {NativeResourceMixin} from "./native_resource";
import {BufferedEventEmitter} from "../common/event";
import {CrtError} from "./error";
import * as io from "./io";
import crt_native from "./binding";

/**
 * Node.js specific eventstream rpc native bindings
 *
 * DEVELOPER PREVIEW DISCLAIMER
 *
 * Eventstream RPC support is currently in **developer preview**.  We encourage feedback at all times, but feedback
 * during the preview window is especially valuable in shaping the final product.  During the preview period we may make
 * backwards-incompatible changes to the public API, but in general, this is something we will try our best to avoid.
 *
 * @packageDocumentation
 * @module eventstream
 * @mergeTarget
 *
 */

/**
 * Supported types for the value within a Header
 */
export enum HeaderType {

    /** Value is True. No actual value is transmitted on the wire. */
    BooleanTrue = 0,

    /** Value is True. No actual value is transmitted on the wire. */
    BooleanFalse = 1,

    /** Value is signed 8-bit int. */
    Byte = 2,

    /** Value is signed 16-bit int. */
    Int16 = 3,

    /** Value is signed 32-bit int. */
    Int32 = 4,

    /** Value is signed 64-bit int. */
    Int64 = 5,

    /** Value is raw bytes. */
    ByteBuffer = 6,

    /** Value is a str.  Transmitted on the wire as utf-8. */
    String = 7,

    /** Value is a posix timestamp (seconds since Unix epoch).  Transmitted on the wire as a 64-bit int. */
    Timestamp = 8,

    /** Value is a UUID. Transmitted on the wire as 16 bytes. */
    UUID = 9,
}

export type Payload = string | Record<string, unknown> | ArrayBuffer | ArrayBufferView;

const MAX_INT8 : number = 127;
const MIN_INT8 : number = -128;
const MAX_INT16 : number = 65535;
const MIN_INT16 : number = -65536;
const MAX_INT32 : number = ((1 << 31) - 1);
const MIN_INT32 : number = -(1 << 31);
const MAX_INT64 : bigint = BigInt("9223372036854775807");
const MIN_INT64 : bigint = BigInt("-9223372036854775808");

export class Header {

    private constructor(public name: string, public type: HeaderType, public value?: any) {
    }

    static fromBoolean(name: string, value: boolean): Header {
        if (value) {
            return new Header(name, HeaderType.BooleanTrue);
        } else {
            return new Header(name, HeaderType.BooleanFalse);
        }
    }

    static fromByte(name: string, value: number): Header {
        if (value >= MIN_INT8 && value <= MAX_INT8 && Number.isSafeInteger(value)) {
            return new Header(name, HeaderType.Byte, value);
        }

        throw new CrtError("Illegal value for eventstream byte-valued header");
    }

    static fromInt16(name: string, value: number): Header {
        if (value >= MIN_INT16 && value <= MAX_INT16 && Number.isSafeInteger(value)) {
            return new Header(name, HeaderType.Int16, value);
        }

        throw new CrtError("Illegal value for eventstream int16-valued header");
    }

    static fromInt32(name: string, value: number): Header {
        if (value >= MIN_INT32 && value <= MAX_INT32 && Number.isSafeInteger(value)) {
            return new Header(name, HeaderType.Int32, value);
        }

        throw new CrtError("Illegal value for eventstream int32-valued header");
    }

    static fromInt64(name: string, value: bigint): Header {
        if (value >= MIN_INT64 && value <= MAX_INT64) {
            return new Header(name, HeaderType.Int64, value);
        }

        throw new CrtError("Illegal value for eventstream int64-valued header");
    }

    static fromByteBuffer(name: string, value: Payload): Header {
        return new Header(name, HeaderType.ByteBuffer, value);
    }

    static fromString(name: string, value: string): Header {
        return new Header(name, HeaderType.String, value);
    }

    static fromTimeStampAsSecondsSinceEpoch(name: string, secondsSinceEpoch: number): Header {
        if (Number.isSafeInteger(secondsSinceEpoch)) {
            return new Header(name, HeaderType.Timestamp, secondsSinceEpoch);
        }

        throw new CrtError("Illegal value for eventstream timestamp-valued header");
    }

    static fromTimeStampAsDate(name: string, date: Date): Header {
        const secondsSinceEpoch: number = date.getTime();
        if (Number.isSafeInteger(secondsSinceEpoch)) {
            return new Header(name, HeaderType.Timestamp, secondsSinceEpoch);
        }

        throw new CrtError("Illegal value for eventstream timestamp-valued header");
    }

    static fromUUID(name: string, value: ArrayBuffer): Header {
        if (value.byteLength == 16) {
            return new Header(name, HeaderType.UUID, value);
        }

        throw new CrtError("Illegal value for eventstream uuid-valued header");
    }

    private toValue(type: HeaderType): any {
        if (type != this.type) {
            throw new CrtError("");
        }

        return this.value;
    }

    asBoolean(): boolean {
        switch (this.type) {
            case HeaderType.BooleanFalse:
                return false;
            case HeaderType.BooleanTrue:
                return true;
            default:
                throw new CrtError("??");

        }
    }

    asByte(): number {
        return this.toValue(HeaderType.Byte) as number;
    }

    asInt16(): number {
        return this.toValue(HeaderType.Int16) as number;
    }

    asInt32(): number {
        return this.toValue(HeaderType.Int32) as number;
    }

    asInt64(): bigint {
        return this.toValue(HeaderType.Int64) as bigint;
    }

    asByteBuffer(): ArrayBuffer {
        return this.toValue(HeaderType.ByteBuffer) as ArrayBuffer;
    }

    asString(): string {
        return this.toValue(HeaderType.String) as string;
    }

    asTimestamp(): number {
        return this.toValue(HeaderType.Timestamp) as number;
    }

    asUUID(): ArrayBuffer {
        return this.toValue(HeaderType.UUID) as ArrayBuffer;
    }
}


/**
 * Flags for messages in the event-stream RPC protocol.
 *
 * Flags may be XORed together.
 * Not all flags can be used with all message types, consult documentation.
 */
export enum MessageFlags {

    /** Nothing */
    None = 0,

    /**
     * Connection accepted
     *
     * If this flag is absent from a :attr:`MessageType.CONNECT_ACK`, the connection has been rejected.
     */
    ConnectionAccepted = 0x1,

    /**
     * Terminate stream
     *
     * This message may be used with any message type.
     * The sender will close their connection after the message is written to the wire.
     * The receiver will close their connection after delivering the message to the user.
     */
    TerminateStream = 0x2,
}

/**
 *
 * Types of messages in the event-stream RPC protocol.
 * The :attr:`~MessageType.APPLICATION_MESSAGE` and :attr:`~MessageType.APPLICATION_ERROR` types may only be sent
 * on streams, and will never arrive as a protocol message (stream-id 0).
 *
 * For all other message types, they may only be sent as protocol messages
 * (stream-id 0), and will never arrive as a stream message.
 *
 * Different message types expect specific headers and flags, consult documentation.
 */
export enum MessageType {
    /** Application message */
    ApplicationMessage = 0,

    /** Application error */
    ApplicationError = 1,

    /** Ping */
    Ping = 2,

    /** Ping response */
    PingResponse = 3,

    /** Connect */
    Connect = 4,

    /**
     * Connect acknowledgement
     *
     * If the :attr:`MessageFlag.CONNECTION_ACCEPTED` flag is not present, the connection has been rejected.
     */
    ConnectAck = 5,

    /**
     * Protocol error
     */
    ProtocolError = 6,

    /**
     * Internal error
     */
    InternalError = 7,
}

export interface Message {
    
    type: MessageType,

    flags: MessageFlags,

    headers: Array<Header>,

    payload: Payload,
}

export interface ClientConnectionOptions {
    hostName: string;

    port: number;

    socketOptions?: io.SocketOptions;

    tlsCtx?: io.ClientTlsContext;
}

export interface ProtocolMessageOptions {
    message: Message;
}

export interface ActivateStreamOptions {
    message: Message;
}

export interface StreamMessageOptions {
    message: Message;
}

export interface DisconnectionEvent {
    errorCode: number;
}

export interface MessageEvent {
    message: Message;
}

export type MessageListener = (eventData: MessageEvent) => void;

export type DisconnectionListener = (eventData: DisconnectionEvent) => void;



enum ClientConnectionState {
    None,
    Connecting,
    Connected,
    Disconnected,
    Closed,
}

export class ClientConnection extends NativeResourceMixin(BufferedEventEmitter) {
    constructor(config: ClientConnectionOptions) {
        super();

        this.state = ClientConnectionState.None;

        this._super(crt_native.event_stream_client_connection_new(
            this,
            config,
            (connection: ClientConnection, errorCode: number) => { ClientConnection._s_on_disconnect(connection, errorCode); },
            (connection: ClientConnection, message: Message) => { ClientConnection._s_on_protocol_message(connection, message); },
            config.socketOptions ? config.socketOptions.native_handle() : null,
            config.tlsCtx ? config.tlsCtx.native_handle() : null
        ));
    }

    close() : void {
        if (this.state != ClientConnectionState.Closed) {
            this.state = ClientConnectionState.Closed;

            // invoke native binding close
            crt_native.event_stream_client_connection_close(this.native_handle());
        }
    }

    async connect() : Promise<void> {
        return new Promise<void>((resolve, reject) => {

            if (this.state != ClientConnectionState.None) {
                reject(new CrtError(`Event stream connection in a state (${this.state}) where connect() is not allowed.`));
            } else {
                this.state = ClientConnectionState.Connecting;

                function curriedPromiseCallback(connection: ClientConnection, errorCode: number){
                    return ClientConnection._s_on_connection_setup(resolve, reject, connection, errorCode);
                }

                try {
                    crt_native.event_stream_client_connection_connect(this.native_handle(), curriedPromiseCallback);
                } catch (e) {
                    this.state = ClientConnectionState.Disconnected;
                    reject(e);
                }
            }
        });

    }

    async sendProtocolMessage(options: ProtocolMessageOptions) : Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.state != ClientConnectionState.Connected) {
                reject(new CrtError(`Event stream connection in a state (${this.state}) where sending protocol messages is not allowed.`));
            } else {
                // invoke native binding send message;
                function curriedPromiseCallback(errorCode: number) {
                    return ClientConnection._s_on_connection_send_protocol_message_completion(resolve, reject, errorCode);
                }

                // invoke native binding send message;
                try {
                    crt_native.event_stream_client_connection_send_protocol_message(this.native_handle(), options, curriedPromiseCallback);
                } catch (e) {
                    reject(e);
                }
            }
        });
    }

    isConnected() : boolean {
        return this.state == ClientConnectionState.Connected;
    }

    newStream() : ClientStream {
        if (this.state != ClientConnectionState.Connected) {
            throw new CrtError(`Event stream connection in a state (${this.state}) where creating new streams is forbidden.`);
        }

        return new ClientStream(this);
    }

    on(event: 'disconnection', listener: DisconnectionListener): this;

    on(event: 'protocolMessage', listener: MessageListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    private static _s_on_connection_setup(resolve : (value: (void | PromiseLike<void>)) => void, reject : (reason?: any) => void, connection: ClientConnection, errorCode: number) {
        if (errorCode == 0 && connection.state == ClientConnectionState.Connecting) {
            connection.state = ClientConnectionState.Connected;
            resolve();
        } else {
            if (connection.state != ClientConnectionState.Closed) {
                connection.state = ClientConnectionState.Disconnected;
            }

            reject(io.error_code_to_string(errorCode));
        }
    }

    private static _s_on_disconnect(connection: ClientConnection, errorCode: number) {
        if (connection.state != ClientConnectionState.Closed) {
            connection.state = ClientConnectionState.Disconnected;
        }

        connection.emit('disconnection', {errorCode: errorCode});
    }

    private static _s_on_protocol_message(connection: ClientConnection, message: Message) {
        connection.emit('protocolMessage', { message: message });
    }

    private static _s_on_connection_send_protocol_message_completion(resolve : (value: (void | PromiseLike<void>)) => void, reject : (reason?: any) => void, errorCode: number) {
        if (errorCode == 0) {
            resolve();
        } else {
            reject(io.error_code_to_string(errorCode));
        }
    }

    private state : ClientConnectionState;

}

export interface StreamClosedEvent {
    errorCode: number;
}

export type StreamClosedListener = (eventData: StreamClosedEvent) => void;

enum ClientStreamState {
    None,
    Activating,
    Activated,
    Terminated,
    Closed,
}

export class ClientStream extends NativeResourceMixin(BufferedEventEmitter) {

    constructor(connection: ClientConnection) {
        super();

        this.state = ClientStreamState.None;

        this._super(crt_native.event_stream_client_stream_new(
            this,
            connection.native_handle(),
            (stream: ClientStream, errorCode: number) => { ClientStream._s_on_stream_terminated(stream, errorCode); },
            (stream: ClientStream, message: Message) => { ClientStream._s_on_continuation_message(stream, message); },
        ));
    }

    close() : void {
        if (this.state != ClientStreamState.Closed) {
            this.state = ClientStreamState.Closed;

            crt_native.event_stream_client_stream_close(this.native_handle());
        }
    }

    async activate(options: ActivateStreamOptions) : Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.state == ClientStreamState.None) {
                this.state = ClientStreamState.Activating;

                function curriedPromiseCallback(stream: ClientStream, errorCode: number){
                    return ClientStream._s_on_stream_activated(resolve, reject, stream, errorCode);
                }

                try {
                    crt_native.event_stream_client_stream_activate(this.native_handle(), options, curriedPromiseCallback);
                } catch (e) {
                    this.state = ClientStreamState.Terminated;
                    reject(e);
                }
            } else {
                reject(new CrtError(`Event stream in a state (${this.state}) where activation is not allowed.`));
            }
        });
    }

    async sendMessage(options: StreamMessageOptions) : Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.state != ClientStreamState.Activated) {
                reject(new CrtError(`Event stream in a state (${this.state}) where sending messages is not allowed.`));
                return;
            }

            function curriedPromiseCallback(errorCode: number) {
                return ClientStream._s_on_stream_send_message_completion(resolve, reject, errorCode);
            }

            // invoke native binding send message;
            try {
                crt_native.event_stream_client_stream_send_message(this.native_handle(), options, curriedPromiseCallback);
            } catch (e) {
                reject(e);
            }
        });
    }

    on(event: 'terminated', listener: StreamClosedListener): this;

    on(event: 'message', listener: MessageListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    private static _s_on_stream_activated(resolve : (value: (void | PromiseLike<void>)) => void, reject : (reason?: any) => void, stream: ClientStream, errorCode: number) {
        if (errorCode == 0 && stream.state == ClientStreamState.Activating) {
            stream.state = ClientStreamState.Activated;
            resolve();
        } else {
            if (stream.state != ClientStreamState.Closed) {
                stream.state = ClientStreamState.Terminated;
            }

            reject(io.error_code_to_string(errorCode));
        }
    }

    private static _s_on_stream_send_message_completion(resolve : (value: (void | PromiseLike<void>)) => void, reject : (reason?: any) => void, errorCode: number) {
        if (errorCode == 0) {
            resolve();
        } else {
            reject(io.error_code_to_string(errorCode));
        }
    }

    private static _s_on_stream_terminated(stream: ClientStream, errorCode: number) {
        stream.emit('terminated', {errorCode: errorCode});
    }

    private static _s_on_continuation_message(stream: ClientStream, message: Message) {
        stream.emit('message', { message: message });
    }

    private state : ClientStreamState;
}