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
import { AwsMqtt5PacketDisconnect } from "./mqtt5_packet";
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

export interface Mqtt5ClientConfig {

    /** Server name to connect to */
    host_name: string;

    /** Server port to connect to */
    port: number;

    client_bootstrap?: io.ClientBootstrap;

    /** Optional socket options */
    socket_options?: io.SocketOptions;

    /**
     * TLS context for secure socket connections.
     * If None is provided, then an unencrypted connection is used.
     */
    tls_ctx?: io.ClientTlsContext;

    /** Optional proxy options */
    proxy_options?: HttpProxyOptions;

    session_behavior? : AwsMqtt5ClientSessionBehavior;

    extended_validation_and_flow_control_options? : AwsMqtt5ClientExtendedValidationAndFlowControl;

    offline_queue_behavior? : AwsMqtt5ClientOperationQueueBehavior;

    retry_jitter_mode? : AwsRetryJitterType;

    min_reconnect_delay_ms? : number;
    max_reconnect_delay_ms? : number;

    min_connected_time_to_reset_reconnect_delay_ms? : number;

    ping_timeout_ms? : number;

    connack_timeout_ms? : number;

    operation_timeout_seconds? : number;
}

export class Mqtt5Client extends NativeResourceMixin(BufferedEventEmitter) {

    /**
     * @param config The configuration for this connection
     */
    constructor(config: Mqtt5ClientConfig) {
        super();

        this._super(crt_native.mqtt5_client_new(
            config,
            config.client_bootstrap ? config.client_bootstrap.native_handle() : null,
            config.socket_options ? config.socket_options.native_handle() : null,
            config.tls_ctx ? config.tls_ctx.native_handle() : null,
            config.proxy_options ? config.proxy_options.create_native_handle() : null,
        ));

        /*
         * Failed mqtt operations (which is normal) emit error events as well as rejecting the original promise.
         * By installing a default error handler here we help prevent common issues where operation failures bring
         * the whole program to an end because a handler wasn't installed.  Programs that install their own handler
         * will be unaffected.
         */
        this.on('error', (error) => {
        });
    }

    start() {
        crt_native.mqtt5_client_start(this.native_handle());
    }

    stop(disconnect_packet?: AwsMqtt5PacketDisconnect) {
        crt_native.mqtt5_client_stop(this.native_handle(), disconnect_packet);
    }
}