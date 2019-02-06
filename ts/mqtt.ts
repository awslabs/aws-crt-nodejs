/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

const crt_native = require('../../build/Debug/aws-crt-nodejs');

import * as io from "./io";

export enum QoS {
    AtMostOnce = 0,
    AtLeastOnce = 1,
    ExactlyOnce = 2,
}

export class Client {
    public bootstrap: io.ClientBootstrap;
    public tls_ctx?: io.ClientTlsContext;

    private client_handle: any;

    constructor(bootstrap: io.ClientBootstrap, tls_ctx?: io.ClientTlsContext) {
        this.bootstrap = bootstrap;
        this.tls_ctx = tls_ctx;

        this.client_handle = crt_native.aws_nodejs_mqtt_client_new(bootstrap.native_handle())
    }

    native_handle(): any {
        return this.client_handle;
    }
}

interface ConnectionConnectParams {
    client_id: string;
    host_name: string;
    port: number;
    use_websocket?: boolean;
    clean_session?: boolean;
    keep_alive?: number;
    will?: any;
    username?: string;
    password?: string;
}

export class Connection {
    public client: Client;
    private connection_handle: any;

    constructor(client: Client, on_connection_interrupted?: (error_code: number) => void, on_connection_resumed?: (return_code: number, session_present: boolean) => void) {
        this.client = client;
        this.connection_handle = crt_native.aws_nodejs_mqtt_client_connection_new(client.native_handle(), on_connection_interrupted, on_connection_resumed);
    }

    async connect(args: ConnectionConnectParams) {
        return new Promise<boolean>((resolve, reject) => {

            function on_connect(error_code: number, return_code: number, session_present: boolean) {
                console.log("on_connect");
                if (error_code == 0 && return_code == 0) {
                    resolve(session_present);
                } else if (error_code != 0) {
                    reject("Failed to connect: " + io.error_code_to_string(error_code));
                } else {
                    reject("Server rejected connection.");
                }
            }

            try {
                crt_native.aws_nodejs_mqtt_client_connection_connect(
                    this.native_handle(),
                    args.client_id,
                    args.host_name,
                    args.port,
                    this.client.tls_ctx ? this.client.tls_ctx.native_handle() : null,
                    args.keep_alive,
                    args.will,
                    args.username,
                    args.password,
                    on_connect,
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    async disconnect() {
        return new Promise<void>((resolve, reject) => {

            function on_disconnect() {
                resolve();
            }

            try {
                crt_native.aws_nodejs_mqtt_client_connection_disconnect(
                    this.native_handle(),
                    on_disconnect,
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    native_handle(): any {
        return this.connection_handle;
    }
}
