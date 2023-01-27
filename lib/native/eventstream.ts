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

export enum HeaderType {

}

export interface Header {

}

export enum MessageFlags {

}

export enum MessageType {

}

export interface Message {

}

enum ClientConnectionState {
    None,
    Connecting,
    Connected,
    Disconnecting,
    Disconnected,
    Closed,
}

export interface ClientConnectionOptions {
    hostName: string;

    port: number;

    socketOptions?: io.SocketOptions;

    tlsCtx?: io.ClientTlsContext;
}

export interface ClientStreamOptions {

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

export class ClientConnection extends NativeResourceMixin(BufferedEventEmitter) {
    constructor(config: ClientConnectionOptions) {
        super();

        this.state = ClientConnectionState.None;

        this._super(crt_native.event_stream_client_connection_new(
            this,
            config,
            (connection: ClientConnection) => { ClientConnection._s_on_disconnect(connection); },
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
