/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt5
 * @mergeTarget
 */

import crt_native from './binding';
import { NativeResourceMixin } from "./native_resource";
import { BufferedEventEmitter } from '../common/event';
import * as io from "./io";
import {HttpProxyOptions, HttpRequest} from './http';
import {
    DisconnectPacket,
    ConnackPacket,
    PubackPacket,
    PublishPacket,
    SubscribePacket, SubackPacket,
    UnsubscribePacket, UnsubackPacket
} from "../common/mqtt5_packet";
import {
    NegotiatedSettings,
    IMqtt5Client,
    ErrorEventHandler,
    MessageReceivedEventHandler,
    StoppedEventHandler,
    AttemptingConnectEventHandler,
    ConnectionSuccessEventHandler,
    ConnectionFailureEventHandler,
    DisconnectionEventHandler,
    Mqtt5ClientConfigShared
} from "../common/mqtt5";
import {ICrtError} from "../common/error";
import {CrtError} from "./error";
export { HttpProxyOptions } from './http';

export { NegotiatedSettings, StoppedEventHandler, AttemptingConnectEventHandler, ConnectionSuccessEventHandler, ConnectionFailureEventHandler, DisconnectionEventHandler, MessageReceivedEventHandler, IMqtt5Client, ClientSessionBehavior, RetryJitterType, ClientOperationQueueBehavior, Mqtt5ClientConfigShared } from "../common/mqtt5";

/**
 * Websocket handshake http request transformation function signature
 */
export type WebsocketHandshakeTransform = (request: HttpRequest, done: (error_code?: number) => void) => void;

/**
 * Information about the client's queue of operations
 */
export interface ClientStatistics {

    /**
     * Total number of operations submitted to the client that have not yet been completed.  Unacked operations
     * are a subset of this.
     */
    incompleteOperationCount : number;

    /**
     * Total packet size of operations submitted to the client that have not yet been completed.  Unacked operations
     * are a subset of this.
     */
    incompleteOperationSize : number;

    /**
     * Total number of operations that have been sent to the server and are waiting for a corresponding ACK before
     * they can be completed.
     */
    unackedOperationCount : number;

    /**
     * Total packet size of operations that have been sent to the server and are waiting for a corresponding ACK before
     * they can be completed.
     */
    unackedOperationSize : number;
};

/**
 * Additional controls for client behavior with respect to operation validation and flow control; these checks
 * go beyond the MQTT5 spec to respect limits of specific MQTT brokers.
 */
export enum ClientExtendedValidationAndFlowControl {
    /**
     * Do not do any additional validation or flow control
     */
    None = 0,

    /**
     * Apply additional client-side validation and operational flow control that respects the
     * default AWS IoT Core limits.
     *
     * Currently applies the following additional validation:
     *
     * 1. No more than 8 subscriptions per SUBSCRIBE packet
     * 1. Topics and topic filters have a maximum of 7 slashes (8 segments), not counting any AWS rules prefix
     * 1. Topics must be <= 256 bytes in length
     * 1. Client id must be <= 128 bytes in length
     *
     * Also applies the following flow control:
     *
     * 1. Outbound throughput throttled to 512KB/s
     * 1. Outbound publish TPS throttled to 100
     */
    AwsIotCoreDefaults = 1,
}

/**
 * Configuration interface for mqtt5 clients
 */
export interface Mqtt5ClientConfig extends Mqtt5ClientConfigShared {


    /**
     * Client bootstrap to use.  In almost all cases, this can be left undefined.
     */
    clientBootstrap?: io.ClientBootstrap;

    /**
     * Controls socket properties of the underlying MQTT connections made by the client.  Leave undefined to use
     * defaults (no TCP keep alive, 10 second socket timeout).
     */
    socketOptions?: io.SocketOptions;

    /**
     * TLS context for secure socket connections.
     * If undefined, then a plaintext connection will be used.
     */
    tlsCtx?: io.ClientTlsContext;

    /**
     * This callback allows a custom transformation of the HTTP request that acts as the websocket handshake.
     * Websockets will be used if this is set to a valid transformation callback.  To use websockets but not perform
     * a transformation, just set this as a trivial completion callback.  If undefined, the connection will be made
     * with direct MQTT.
     */
    websocketHandshakeTransform?: WebsocketHandshakeTransform;

    /**
     * Configures (tunneling) HTTP proxy usage when establishing MQTT connections
     */
    proxyOptions?: HttpProxyOptions;

    /**
     * Additional controls for client behavior with respect to operation validation and flow control; these checks
     * go beyond the base MQTT5 spec to respect limits of specific MQTT brokers.
     */
    extendedValidationAndFlowControlOptions? : ClientExtendedValidationAndFlowControl;
}

/**
 * Node.js specific MQTT5 client.
 *
 * <TODO> Long-form client documentation
 */
export class Mqtt5Client extends NativeResourceMixin(BufferedEventEmitter) implements IMqtt5Client {

    /**
     * Client constructor
     *
     * @param config The configuration for this client
     */
    constructor(config: Mqtt5ClientConfig) {
        super();

        this._super(crt_native.mqtt5_client_new(
            this,
            config,
            (client: Mqtt5Client) => { Mqtt5Client._s_on_stopped(client); },
            (client: Mqtt5Client) => { Mqtt5Client._s_on_attempting_connect(client); },
            (client: Mqtt5Client, connack : ConnackPacket, settings: NegotiatedSettings) => { Mqtt5Client._s_on_connection_success(client, connack, settings); },
            (client: Mqtt5Client, errorCode: number, connack? : ConnackPacket) => { Mqtt5Client._s_on_connection_failure(client, new CrtError(errorCode), connack); },
            (client: Mqtt5Client, errorCode: number, disconnect? : DisconnectPacket) => { Mqtt5Client._s_on_disconnection(client, new CrtError(errorCode), disconnect); },
            (client: Mqtt5Client, message : PublishPacket) => { Mqtt5Client._s_on_message_received(client, message); },
            config.clientBootstrap ? config.clientBootstrap.native_handle() : null,
            config.socketOptions ? config.socketOptions.native_handle() : null,
            config.tlsCtx ? config.tlsCtx.native_handle() : null,
            config.proxyOptions ? config.proxyOptions.create_native_handle() : null
        ));

        /*
         * Failed MQTT operations (which is normal) emit error events as well as rejecting the original promise.
         * By installing a default error handler here we help prevent common issues where operation failures bring
         * the whole program to an end because a handler wasn't installed.  Programs that install their own handler
         * will be unaffected.
         */
        this.on('error', (error: ICrtError) => {});
    }


    /**
     * Emitted when a client method invocation results in an error
     *
     * @param event the type of event (error)
     * @param listener the error event listener to add
     *
     * @event
     */
    on(event: 'error', listener: ErrorEventHandler): this;

    /**
     * Emitted when an MQTT PUBLISH packet is received by the client
     *
     * @param event the type of event (messageReceived)
     * @param listener the messageReceived event listener to add
     *
     * @event
     */
    on(event: 'messageReceived', listener: MessageReceivedEventHandler): this;

    /**
     * Emitted when the client begins a connection attempt
     *
     * @param event the type of event (attemptingConnect)
     * @param listener the attemptingConnect event listener to add
     *
     * @event
     */
    on(event: 'attemptingConnect', listener: AttemptingConnectEventHandler): this;

    /**
     * Emitted when the client successfully establishes an MQTT connection
     *
     * @param event the type of event (connectionSuccess)
     * @param listener the connectionSuccess event listener to add
     *
     * @event
     */
    on(event: 'connectionSuccess', listener: ConnectionSuccessEventHandler): this;

    /**
     * Emitted when the client fails to establish an MQTT connection
     *
     * @param event the type of event (connectionFailure)
     * @param listener the connectionFailure event listener to add
     *
     * @event
     */
    on(event: 'connectionFailure', listener: ConnectionFailureEventHandler): this;

    /**
     * Emitted when the client's current MQTT connection is shut down
     *
     * @param event the type of event (disconnection)
     * @param listener the disconnection event listener to add
     *
     * @event
     */
    on(event: 'disconnection', listener: DisconnectionEventHandler): this;

    /**
     * Emitted when the client reaches the 'Stopped' state as a result of the user invoking .stop()
     *
     * @param event the type of event (stopped)
     * @param listener the stopped event listener to add
     *
     * @event
     */
    on(event: 'stopped', listener: StoppedEventHandler): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }


    /**
     * Triggers cleanup of native resources associated with the MQTT5 client.  Once this has been invoked, callbacks
     * and events are not guaranteed to be received.
     *
     * This must be called when finished with a client; otherwise, native resources will leak.  It is not safe
     * to invoke any further operations on the client after close() has been called.
     *
     * This is an asynchronous operation.
     */
    close() {
        crt_native.mqtt5_client_close(this.native_handle());
    }

    /**
     * Notifies the MQTT5 client that you want it maintain connectivity to the configured endpoint.
     * The client will attempt to stay connected using the properties of the reconnect-related parameters
     * in the mqtt5 client configuration.
     *
     * This is an asynchronous operation.
     */
    start() {
        crt_native.mqtt5_client_start(this.native_handle());
    }

    /**
     * Notifies the MQTT5 client that you want it to end connectivity to the configured endpoint, disconnecting any
     * existing connection and halting any reconnect attempts.
     *
     * This is an asynchronous operation.
     *
     * @param disconnectPacket (optional) properties of a DISCONNECT packet to send as part of the shutdown process
     */
    stop(disconnectPacket?: DisconnectPacket) {
        crt_native.mqtt5_client_stop(this.native_handle(), disconnectPacket);
    }

    /**
     * Tells the client to attempt to subscribe to one or more topic filters.
     *
     * @param packet SUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the SUBACK response
     */
    async subscribe(packet: SubscribePacket) : Promise<SubackPacket> {
        return new Promise<SubackPacket>((resolve, reject) => {

            function curriedPromiseCallback(client: Mqtt5Client, errorCode: number, suback?: SubackPacket){
                return Mqtt5Client._s_on_suback_callback(resolve, reject, client, errorCode, suback);
            }

            try {
                crt_native.mqtt5_client_subscribe(this.native_handle(), packet, curriedPromiseCallback);
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Tells the client to attempt to unsubscribe from one or more topic filters.
     *
     * @param packet UNSUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the UNSUBACK response
     */
    async unsubscribe(packet: UnsubscribePacket) : Promise<UnsubackPacket> {
        return new Promise<UnsubackPacket>((resolve, reject) => {

            function curriedPromiseCallback(client: Mqtt5Client, errorCode: number, unsuback?: UnsubackPacket){
                return Mqtt5Client._s_on_unsuback_callback(resolve, reject, client, errorCode, unsuback);
            }

            try {
                crt_native.mqtt5_client_unsubscribe(this.native_handle(), packet, curriedPromiseCallback);
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Tells the client to attempt to send a PUBLISH packet
     *
     * @param packet PUBLISH packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the PUBACK response
     */
    async publish(packet: PublishPacket) : Promise<PubackPacket> {
        return new Promise<PubackPacket>((resolve, reject) => {

            function curriedPromiseCallback(client: Mqtt5Client, errorCode: number, puback?: PubackPacket){
                return Mqtt5Client._s_on_puback_callback(resolve, reject, client, errorCode, puback);
            }

            try {
                crt_native.mqtt5_client_publish(this.native_handle(), packet, curriedPromiseCallback);
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Node-only API
     *
     * returns a small set of statistics about the current state of the operation queue
     */
    getQueueStatistics() : ClientStatistics {
        return crt_native.mqtt5_client_get_queue_statistics(this.native_handle());
    }

    /*
     * Private helper functions
     *
     * Callbacks come through static functions so that the native threadsafe function objects do not
     * capture the client object itself, simplifying the number of strong references to the client floating around.
     */

    private static _s_on_stopped(client: Mqtt5Client) {
        process.nextTick(() => {
            client.emit('stopped');
        });
    }

    private static _s_on_attempting_connect(client: Mqtt5Client) {
        process.nextTick(() => {
            client.emit('attemptingConnect');
        });
    }

    private static _s_on_connection_success(client: Mqtt5Client, connack: ConnackPacket, settings: NegotiatedSettings) {
        process.nextTick(() => {
            client.emit('connectionSuccess', connack, settings);
        });
    }

    private static _s_on_connection_failure(client: Mqtt5Client, error: CrtError, connack?: ConnackPacket) {
        process.nextTick(() => {
            client.emit('connectionFailure', error, connack);
        });
    }

    private static _s_on_disconnection(client: Mqtt5Client, error: CrtError, disconnect?: DisconnectPacket) {
        process.nextTick(() => {
            client.emit('disconnection', error, disconnect);
        });
    }

    private static _emitErrorOnNext(client: Mqtt5Client, errorCode: number) {
        process.nextTick(() => {
            client.emit('error', new CrtError(errorCode));
        });
    }

    private static _s_on_suback_callback(resolve : (value: (SubackPacket | PromiseLike<SubackPacket>)) => void, reject : (reason?: any) => void, client: Mqtt5Client, errorCode: number, suback?: SubackPacket) {
        if (errorCode == 0 && suback !== undefined) {
            resolve(suback);
        } else {
            reject("Failed to subscribe: " + io.error_code_to_string(errorCode));
            Mqtt5Client._emitErrorOnNext(client, errorCode);
        }
    }

    private static _s_on_unsuback_callback(resolve : (value: (UnsubackPacket | PromiseLike<UnsubackPacket>)) => void, reject : (reason?: any) => void, client: Mqtt5Client, errorCode: number, unsuback?: UnsubackPacket) {
        if (errorCode == 0 && unsuback !== undefined) {
            resolve(unsuback);
        } else {
            reject("Failed to unsubscribe: " + io.error_code_to_string(errorCode));
            Mqtt5Client._emitErrorOnNext(client, errorCode);
        }
    }

    private static _s_on_puback_callback(resolve : (value: (PubackPacket | PromiseLike<PubackPacket>)) => void, reject : (reason?: any) => void, client: Mqtt5Client, errorCode: number, puback?: PubackPacket) {
        if (errorCode == 0 && puback !== undefined) {
            resolve(puback);
        } else {
            reject("Failed to publish: " + io.error_code_to_string(errorCode));
            Mqtt5Client._emitErrorOnNext(client, errorCode);
        }
    }

    private static _s_on_message_received(client: Mqtt5Client, message : PublishPacket) {
        process.nextTick(() => {
            client.emit('messageReceived', message);
        });
    }
}