/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {NativeResourceMixin} from "@awscrt/native_resource";
import {BufferedEventEmitter} from "../common/event";
import {CrtError} from "./error";
import * as io from "@awscrt/io";
import crt_native from "@awscrt/binding";

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

export interface Header {
    name: string,

    type: HeaderType,

    value: any,
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

export type MessagePayload = string | Record<string, unknown> | ArrayBuffer | ArrayBufferView;

export interface Message {
    
    type: MessageType,

    flags: MessageFlags,

    headers: Array<Header>,

    payload: MessagePayload,
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

export interface DisconnectionEvent {
    errorCode: number;
}

export interface ProtocolMessageEvent {
    message: Message;
}

export type ProtocolMessageListener = (eventData: ProtocolMessageEvent) => void;

export type DisconnectionListener = (eventData: DisconnectionEvent) => void;

enum ClientConnectionState {
    None,
    Connecting,
    Connected,
    Disconnecting,
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
                    this.state = ClientConnectionState.None;
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
            }
        });
    }

    isConnected() : boolean {
        return this.state == ClientConnectionState.Connected;
    }

    on(event: 'disconnection', listener: DisconnectionListener): this;

    on(event: 'protocolMessage', listener: ProtocolMessageListener): this;

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
                connection.state = ClientConnectionState.None;
            }

            reject(io.error_code_to_string(errorCode));
        }
    }

    private static _s_on_disconnect(connection: ClientConnection, errorCode: number) {
        connection.emit('disconnection', {errorCode: errorCode});
    }

    private static _s_on_protocol_message(connection: ClientConnection, message: Message) {
        connection.emit('protocolMessage', { message: message });
    }

    private state : ClientConnectionState;

}
