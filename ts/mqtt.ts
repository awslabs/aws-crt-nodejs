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

const crt_native = require('../build/Debug/aws-crt-nodejs');

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
