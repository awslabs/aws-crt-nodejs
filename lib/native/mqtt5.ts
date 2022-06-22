/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt
 */

import crt_native from './binding';
import { NativeResourceMixin } from "./native_resource";
import { BufferedEventEmitter } from '../common/event';
import * as io from "./io";
import {HttpProxyOptions, HttpRequest} from './http';
import { AwsMqtt5PacketDisconnect, AwsMqtt5PacketConnack, AwsMqtt5PacketConnect, AwsMqtt5QoS } from "./mqtt5_packet";
import {CrtError} from "./error";
export { HttpProxyOptions } from './http';

/**
 * Controls how the MQTT5 client should behave with respect to MQTT sessions.
 */
export enum AwsMqtt5ClientSessionBehavior {
    /**
     * Always ask for a clean session when connecting
     */
    Clean = 0,

    /**
     * Always attempt to rejoin an existing session after an initial connection success.
     */
    RejoinPostSuccess,
}

/**
 * Additional controls for client behavior with respect to operation validation and flow control; these checks
 * go beyond the base mqtt5 spec to respect limits of specific MQTT brokers.
 */
export enum AwsMqtt5ClientExtendedValidationAndFlowControl {
    /**
     * Do not do any additional validation or flow control outside of the MQTT5 spec
     */
    None = 0,

    /**
     * Apply additional client-side validation and operational flow control that respects the
     * default AWS IoT Core limits.
     *
     * Currently applies the following additional validation:
     *  (1) No more than 8 subscriptions per SUBSCRIBE packet
     *  (2) Topics and topic filters have a maximum of 7 slashes (8 segments), not counting any AWS rules prefix
     *  (3) Topics must be <= 256 bytes in length
     *  (4) Client id must be <= 128 bytes in length
     *
     * Also applies the following flow control:
     *  (1) Outbound throughput throttled to 512KB/s
     *  (2) Outbound publish TPS throttled to 100
     */
    AwsIotCoreDefaults = 1,
}

/**
 * Controls how disconnects affect the queued and in-progress operations tracked by the client.  Also controls
 * how operations are handled while the client is not connected.  In particular, if the client is not connected,
 * then any operation that would be failed on disconnect (according to these rules) will be rejected.
 */
export enum AwsMqtt5ClientOperationQueueBehavior {
    /**
     * All operations that are not complete at the time of disconnection are failed, except those operations that
     * the mqtt 5 spec requires to be retransmitted (unacked qos1+ publishes).
     */
    FailAllOnDisconnect = 0,

    /**
     * Qos 0 publishes that are not complete at the time of disconnection are failed.  Unacked QoS 1+ publishes are
     * requeued at the head of the line for immediate retransmission on a session resumption.  All other operations
     * are requeued in original order behind any retransmissions.
     */
    FailQos0PublishOnDisconnect = 1,

    /**
     * Requeues QoS 1+ publishes on disconnect; unacked publishes go to the front, unprocessed publishes stay
     * in place.  All other operations (QoS 0 publishes, subscribe, unsubscribe) are failed.
     */
    FailNonQos1PublishOnDisconnect = 2,
}

/**
 * Controls how the reconnect delay is modified in order to smooth reconnects when applied to large sets of hosts.
 *
 * https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */
export enum AwsRetryJitterType {
    /**
     * Maps to Full
     */
    Default = 0,

    /**
     * Do not perform any randomization on the reconnect delay
     */
    None = 1,

    /**
     * ReconnectDelay = Random(0, CurrentExponentialBackoff)
     */
    Full = 2,

    /**
     * ReconnectDelay = Min(MaxReconnectDelay, Random(MinReconnectDelay, 3 * ReconnectDelay)
     */
    Decorrelated = 3,
}

/**
 * Mqtt behavior settings that are dynamically negotiated as part of the CONNECT/CONNACK exchange.
 */
export interface Mqtt5NegotiatedSettings {

    /**
     * The maximum QoS used between the server and client.
     */
    maximumQos: AwsMqtt5QoS;

    /**
     * the amount of time in seconds the server will retain the session after a disconnect.
     */
    sessionExpiryInterval: number;

    /**
     * the number of QoS 1 and QoS2 publications the server is willing to process concurrently.
     */
    receiveMaximumFromServer: number;

    /**
     * the maximum packet size the server is willing to accept.
     */
    maximumPacketSizeToServer: number;

    /**
     * the amount of time in seconds before the server will disconnect the client for inactivity.
     */
    serverKeepAlive: number;

    /**
     * whether the server supports retained messages.
     */
    retainAvailable: Boolean;

    /**
     * whether the server supports wildcard subscriptions.
     */
    wildcardSubscriptionsAvailable: Boolean;

    /**
     * whether the server supports subscription identifiers
     */
    subscriptionIdentifiersAvailable: Boolean;

    /**
     * whether the server supports shared subscriptions
     */
    sharedSubscriptionsAvailable: Boolean;

    /**
     * whether the client has rejoined an existing session.
     */
    rejoinedSession: Boolean;

    /**
     * The final client id in use by the newly-established connection
     */
    clientId: string;
}

/**
 * Client Error event handler signature
 */
export type Mqtt5ClientError = (error: CrtError) => void;

/**
 * Client Stopped lifecycle event handler signature
 */
export type Mqtt5ClientStopped = (client: Mqtt5Client) => void;

/**
 * Client AttemptingConnect lifecycle event handler signature
 */
export type Mqtt5ClientAttemptingConnect = (client: Mqtt5Client) => void;

/**
 * Client ConnectionSuccess lifecycle event handler signature
 */
export type Mqtt5ClientConnectionSuccess = (client: Mqtt5Client, connack: AwsMqtt5PacketConnack, settings: Mqtt5NegotiatedSettings) => void;

/**
 * Client ConnectionFailure lifecycle event handler signature
 */
export type Mqtt5ClientConnectionFailure = (client: Mqtt5Client, errorCode: number, connack?: AwsMqtt5PacketConnack) => void;

/**
 * Client Disconnection lifecycle event handler signature
 */
export type Mqtt5ClientDisconnection = (client: Mqtt5Client, errorCode: number, disconnect?: AwsMqtt5PacketDisconnect) => void;

/**
 * Configuration interface for the mqtt5 client lifecycle event handler set
 */
export interface Mqtt5ClientLifecycleHandlers {
    /**
     * Handler for the client's Stopped lifecycle event
     */
    onStopped : Mqtt5ClientStopped;

    /**
     * Handler for the client's AttemptingConnect lifecycle event
     */
    onAttemptingConnect : Mqtt5ClientAttemptingConnect;

    /**
     * Handler for the client's ConnectionSuccess lifecycle event
     */
    onConnectionSuccess : Mqtt5ClientConnectionSuccess;

    /**
     * Handler for the client's ConnectionFailure lifecycle event
     */
    onConnectionFailure : Mqtt5ClientConnectionFailure;

    /**
     * Handler for the client's Disconnection lifecycle event
     */
    onDisconnection : Mqtt5ClientDisconnection;
}

/**
 * Configuration interface for mqtt5 clients
 */
export interface Mqtt5ClientConfig {

    /**
     * Host name of the MQTT broker to connect to
     */
    hostName: string;

    /**
     * Host port of the MQTT broker to connect to
     */
    port: number;

    /**
     * Client bootstrap to use.  In almost all cases, this can be left undefined.
     */
    clientBootstrap?: io.ClientBootstrap;

    /**
     * Controls socket properties of the underlying MQTT connections made by the client
     */
    socketOptions?: io.SocketOptions;

    /**
     * TLS context for secure socket connections.
     * If None is provided, then an unencrypted connection is used.
     */
    tlsCtx?: io.ClientTlsContext;

    /**
     * Websocket configuration.  Websockets will be used if this is set to a valid transformation callback.  If null
     * or undefined, the connection will be made with direct mqtt.
     *
     * Callback that allows a custom transformation of the http request that functions as the websocket handshake.
     * To use websockets but not perform a transformation, just set this as a trivial completion callback.
     */
    websocketHandshakeTransform?: (request: HttpRequest, done: (error_code?: number) => void) => void;

    /**
     * Controls http proxy usage when establishing mqtt connections
     */
    proxyOptions?: HttpProxyOptions;

    /**
     * Controls how the MQTT5 client should behave with respect to MQTT sessions.
     */
    sessionBehavior? : AwsMqtt5ClientSessionBehavior;

    /**
     * Additional controls for client behavior with respect to operation validation and flow control; these checks
     * go beyond the base mqtt5 spec to respect limits of specific MQTT brokers.
     */
    extendedValidationAndFlowControlOptions? : AwsMqtt5ClientExtendedValidationAndFlowControl;

    /**
     * Controls how disconnects affect the queued and in-progress operations tracked by the client.  Also controls
     * how operations are handled while the client is not connected.  In particular, if the client is not connected,
     * then any operation that would be failed on disconnect (according to these rules) will be rejected.
     */
    offlineQueueBehavior? : AwsMqtt5ClientOperationQueueBehavior;

    /**
     * Controls how the reconnect delay is modified in order to smooth reconnects when applied to large sets of hosts.
     */
    retryJitterMode? : AwsRetryJitterType;

    /**
     * Minimum amount of time to wait to reconnect after a disconnect.  Exponential backoff is performed with jitter
     * after each connection failure.
     */
    minReconnectDelayMs? : number;

    /**
     * Maximum amount of time to wait to reconnect after a disconnect.  Exponential backoff is performed with jitter
     * after each connection failure.
     */
    maxReconnectDelayMs? : number;

    /**
     * Amount of time that must elapse with a "good" connection before the reconnect delay is reset to the minimum.
     * This helps alleviate bandwidth-waste in fast reconnect cycles due to permission failures on operations.
     */
    minConnectedTimeToResetReconnectDelayMs? : number;

    /**
     * Time interval to wait after sending a PINGREQ for a PINGRESP to arrive.  If one does not arrive, the connection
     * will be shut down.
     */
    pingTimeoutMs? : number;

    /**
     * Time interval to wait after sending a CONNECT request for a CONNACK to arrive.  If one does not arrive, the
     * connection will be shut down.
     */
    connackTimeoutMs? : number;

    /**
     * Time interval to wait for an ack after sending a QoS1+ PUBLISH, SUBSCRIBE, or UNSUBSCRIBE before
     * failing the packet, notifying the client of failure, and removing it from the retry queue.
     */
    operationTimeoutSeconds? : number;

    /**
     * All configurable options with respect to the CONNECT packet sent by the client.  This includes the will.
     */
    connectProperties?: AwsMqtt5PacketConnect;
}

/**
 * Node.js specific MQTT5 client.
 *
 * <TODO> Long-form client documentation
 */
export class Mqtt5Client extends NativeResourceMixin(BufferedEventEmitter) {

    /**
     * Client constructor
     *
     * @param config The configuration for this client
     */
    constructor(config: Mqtt5ClientConfig) {
        super();

        let lifecycle_event_handlers : Mqtt5ClientLifecycleHandlers = {
            onStopped : (client: Mqtt5Client) => { Mqtt5Client._s_on_stopped(client); },
            onAttemptingConnect : (client: Mqtt5Client) => { Mqtt5Client._s_on_attempting_connect(client); },
            onConnectionSuccess : (client: Mqtt5Client, connack : AwsMqtt5PacketConnack, settings: Mqtt5NegotiatedSettings) => { Mqtt5Client._s_on_connection_success(client, connack, settings); },
            onConnectionFailure : (client: Mqtt5Client, errorCode: number, connack? : AwsMqtt5PacketConnack) => { Mqtt5Client._s_on_connection_failure(client, new CrtError(errorCode), connack); },
            onDisconnection : (client: Mqtt5Client, errorCode: number, disconnect? : AwsMqtt5PacketDisconnect) => { Mqtt5Client._s_on_disconnection(client, new CrtError(errorCode), disconnect); },
        };

        this._super(crt_native.mqtt5_client_new(
            this,
            config,
            lifecycle_event_handlers,
            config.clientBootstrap ? config.clientBootstrap.native_handle() : null,
            config.socketOptions ? config.socketOptions.native_handle() : null,
            config.tlsCtx ? config.tlsCtx.native_handle() : null,
            config.proxyOptions ? config.proxyOptions.create_native_handle() : null
        ));

        /*
         * Failed mqtt operations (which is normal) emit error events as well as rejecting the original promise.
         * By installing a default error handler here we help prevent common issues where operation failures bring
         * the whole program to an end because a handler wasn't installed.  Programs that install their own handler
         * will be unaffected.
         */
        this.on('error', (error: CrtError) => {});
    }

    /* Client events */

    /**
     * Emitted when a client method invocation results in an error
     *
     * @param event the type of event (error)
     * @param listener the error event listener to add
     *
     * @event
     */
    on(event: 'error', listener: Mqtt5ClientError): this;

    /**
     * Emitted when the client reaches the 'Stopped' state as a result of the user invoking .stop()
     *
     * @param event the type of event (stopped)
     * @param listener the stopped event listener to add
     *
     * @event
     */
    on(event: 'stopped', listener: Mqtt5ClientStopped): this;

    /**
     * Emitted when the client begins a connection attempt
     *
     * @param event the type of event (attemptingConnect)
     * @param listener the attemptingConnect event listener to add
     *
     * @event
     */
    on(event: 'attemptingConnect', listener: Mqtt5ClientAttemptingConnect): this;

    /**
     * Emitted when the client successfully establishes an mqtt connection
     *
     * @param event the type of event (connectionSuccess)
     * @param listener the connectionSuccess event listener to add
     *
     * @event
     */
    on(event: 'connectionSuccess', listener: Mqtt5ClientConnectionSuccess): this;

    /**
     * Emitted when the client fails to establish an mqtt connection
     *
     * @param event the type of event (connectionFailure)
     * @param listener the connectionFailure event listener to add
     *
     * @event
     */
    on(event: 'connectionFailure', listener: Mqtt5ClientConnectionFailure): this;

    /**
     * Emitted when the client's current mqtt connection is shut down
     *
     * @param event the type of event (disconnection)
     * @param listener the disconnection event listener to add
     *
     * @event
     */
    on(event: 'disconnection', listener: Mqtt5ClientDisconnection): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    /* Public API for MQTT5 */

    /**
     * Notifies the native mqtt5 client that you want it to attempt to connect to the configured endpoint.
     * The client will attempt to stay connected using the properties of the reconnect-related parameters
     * in the mqtt5 client configuration.
     */
    start() {
        crt_native.mqtt5_client_start(this.native_handle());
    }

    /**
     * Notifies the mqtt5 client that you want it to transition to the stopped state.
     *
     * @param disconnectPacket (optional) properties of a DISCONNECT packet to send as part of the shutdown process
     */
    stop(disconnectPacket?: AwsMqtt5PacketDisconnect) {
        crt_native.mqtt5_client_stop(this.native_handle(), disconnectPacket);
    }

    /* Private helper functions */

    private static _s_on_stopped(client: Mqtt5Client) {
        client._on_stopped();
    }

    private static _s_on_attempting_connect(client: Mqtt5Client) {
        client._on_attempting_connect();
    }

    private static _s_on_connection_success(client: Mqtt5Client, connack: AwsMqtt5PacketConnack, settings: Mqtt5NegotiatedSettings) {
        client._on_connection_success(connack, settings);
    }

    private static _s_on_connection_failure(client: Mqtt5Client, error: CrtError, connack?: AwsMqtt5PacketConnack) {
        client._on_connection_failure(error, connack);
    }

    private static _s_on_disconnection(client: Mqtt5Client, error: CrtError, disconnect?: AwsMqtt5PacketDisconnect) {
        client._on_disconnection(error, disconnect);
    }

    private _on_stopped() {
        this.emit('stopped');
    }

    private _on_attempting_connect() {
        this.emit('attemptingConnect');
    }

    private _on_connection_success(connack: AwsMqtt5PacketConnack, settings: Mqtt5NegotiatedSettings) {
        this.emit('connectionSuccess', connack, settings);
    }

    private _on_connection_failure(error: CrtError, connack?: AwsMqtt5PacketConnack) {
        this.emit('connectionFailure', error, connack);
    }

    private _on_disconnection(error: CrtError, disconnect?: AwsMqtt5PacketDisconnect) {
        this.emit('disconnection', error, disconnect);
    }
}