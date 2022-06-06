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
export { HttpProxyOptions } from './http';

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

}

export class Mqtt5Client extends NativeResourceMixin(BufferedEventEmitter) {
    readonly tls_ctx?: io.ClientTlsContext; // this reference keeps the tls_ctx alive beyond the life of the connection

    /**
     * @param client The client that owns this connection
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
}