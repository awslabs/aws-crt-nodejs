/*
 * Copyright 2010-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { ConnectionConfig } from "./mqtt";
import * as platform from "../common/platform";

export class AwsIotMqttConnectionConfigBuilder {
    private params: ConnectionConfig

    private constructor() {
        this.params = {
            client_id: '',
            host_name: '',
            connect_timeout: 3000,
            port: 8883,
            clean_session: false,
            keep_alive: undefined,
            will: undefined,
            username: `?SDK=BrowserJSv2&Version=${platform.crt_version()}`,
            password: undefined,
            websocket: {},
        };
    }

    static new_builder_for_websocket() {
        let builder = new AwsIotMqttConnectionConfigBuilder();
        return builder;
    }

    with_endpoint(endpoint: string) {
        this.params.host_name = endpoint;
        return this;
    }

    with_client_id(client_id: string) {
        this.params.client_id = client_id;
        return this;
    }

    with_clean_session(clean_session: boolean) {
        this.params.clean_session = clean_session;
        return this;
    }

    with_use_websockets() {
        /* no-op, but valid in the browser */
        return this;
    }

    with_keep_alive_seconds(keep_alive: number) {
        this.params.keep_alive = keep_alive;
        return this;
    }

    with_timeout_ms(timeout_ms: number) {
        this.params.timeout = timeout_ms;
        return this;
    }

    with_will(will: string) {
        this.params.will = will;
        return this;
    }

    with_connect_timeout_ms(timeout: number) {
        this.params.connect_timeout = timeout;
        return this;
    }

    with_websocket_headers(headers: { [index: string]: string }) {
        this.params.websocket = {
            headers: headers
        };
        return this;
    }

    with_credentials(aws_region: string, aws_access_id: string, aws_secret_key: string, aws_sts_token: string | undefined) {
        this.params.credentials = {
            aws_region: aws_region,
            aws_access_id: aws_access_id,
            aws_secret_key: aws_secret_key,
            aws_sts_token: aws_sts_token,
        };
        return this;
    }

    build() {
        if (this.params.client_id === undefined || this.params.host_name === undefined) {
            throw 'client_id and endpoint are required';
        }

        return this.params;
    }
}
