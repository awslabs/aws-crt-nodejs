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
import { HttpProxyOptions } from './http';
import { AwsMqtt5PacketDisconnect, AwsMqtt5PacketConnack, AwsMqtt5PacketConnect, AwsMqtt5QoS } from "./mqtt5_packet";
import {CrtError} from "./error";
export { HttpProxyOptions } from './http';

export enum AwsMqtt5ClientSessionBehavior {
    Clean = 0,

    /**
     * Always attempt to rejoin an existing session after an initial connection success.
     */
    RejoinPostSuccess,
}

export enum AwsMqtt5ClientExtendedValidationAndFlowControl {
    None = 0,
    AwsIotCoreDefaults = 1,
}

export enum AwsMqtt5ClientOperationQueueBehavior {
    FailAllOnDisconnect = 0,
    FailQos0PublishOnDisconnect = 1,
    FailNonQos1PublishOnDisconnect = 2,
}

export enum AwsRetryJitterType {
    Default = 0,
    None = 1,
    Full = 2,
    Decorrelated = 3,
}

export interface Mqtt5NegotiatedSettings {
    maximumQos: AwsMqtt5QoS;

    sessionExpiryInterval: number;

    receiveMaximumFromServer: number;

    maximumPacketSizeToServer: number;

    serverKeepAlive: number;

    retainAvailable: Boolean;
    wildcardSubscriptionsAvailable: Boolean;
    subscriptionIdentifiersAvailable: Boolean;
    sharedSubscriptionsAvailable: Boolean;

    rejoinedSession: Boolean;

    clientId: string;
}

export type Mqtt5ClientError = (error: CrtError) => void;

export type Mqtt5ClientStopped = (client: Mqtt5Client) => void;

export type Mqtt5ClientAttemptingConnect = (client: Mqtt5Client) => void;

export type Mqtt5ClientConnectionSuccess = (client: Mqtt5Client, connack: AwsMqtt5PacketConnack, settings: Mqtt5NegotiatedSettings) => void;

export type Mqtt5ClientConnectionFailure = (client: Mqtt5Client, errorCode: number, connack?: AwsMqtt5PacketConnack) => void;

export type Mqtt5ClientDisconnection = (client: Mqtt5Client, errorCode: number, disconnect?: AwsMqtt5PacketDisconnect) => void;

export interface Mqtt5ClientLifecycleHandlers {
    onStopped : Mqtt5ClientStopped;

    onAttemptingConnect : Mqtt5ClientAttemptingConnect;

    onConnectionSuccess : Mqtt5ClientConnectionSuccess;

    onConnectionFailure : Mqtt5ClientConnectionFailure;

    onDisconnection : Mqtt5ClientDisconnection;
}

export interface Mqtt5ClientConfig {

    /** Server name to connect to */
    hostName: string;

    /** Server port to connect to */
    port: number;

    clientBootstrap?: io.ClientBootstrap;

    /** Optional socket options */
    socketOptions?: io.SocketOptions;

    /**
     * TLS context for secure socket connections.
     * If None is provided, then an unencrypted connection is used.
     */
    tlsCtx?: io.ClientTlsContext;

    /** Optional proxy options */
    proxyOptions?: HttpProxyOptions;

    sessionBehavior? : AwsMqtt5ClientSessionBehavior;

    extendedValidationAndFlowControlOptions? : AwsMqtt5ClientExtendedValidationAndFlowControl;

    offlineQueueBehavior? : AwsMqtt5ClientOperationQueueBehavior;

    retryJitterMode? : AwsRetryJitterType;

    minReconnectDelayMs? : number;
    maxReconnectDelayMs? : number;

    minConnectedTimeToResetReconnectDelayMs? : number;

    pingTimeoutMs? : number;

    connackTimeoutMs? : number;

    operationTimeoutSeconds? : number;

    connectProperties?: AwsMqtt5PacketConnect;
}

export class Mqtt5Client extends NativeResourceMixin(BufferedEventEmitter) {

    /**
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

    on(event: 'error', listener: Mqtt5ClientError): this;

    on(event: 'stopped', listener: Mqtt5ClientStopped): this;

    on(event: 'attemptingConnect', listener: Mqtt5ClientAttemptingConnect): this;

    on(event: 'connectionSuccess', listener: Mqtt5ClientConnectionSuccess): this;

    on(event: 'connectionFailure', listener: Mqtt5ClientConnectionFailure): this;

    on(event: 'disconnection', listener: Mqtt5ClientDisconnection): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    start() {
        crt_native.mqtt5_client_start(this.native_handle());
    }

    stop(disconnectPacket?: AwsMqtt5PacketDisconnect) {
        crt_native.mqtt5_client_stop(this.native_handle(), disconnectPacket);
    }

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