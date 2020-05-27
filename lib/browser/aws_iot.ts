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

import { SocketOptions } from "./io";
import { MqttConnectionConfig, MqttWill } from "./mqtt";
import * as platform from "../common/platform";

/**
 * Builder functions to create a {@link MqttConnectionConfig} which can then be used to create
 * a {@link MqttClientConnection}, configured for use with AWS IoT.
 *
 * @module aws-crt
 * @category IoT
 */
export class AwsIotMqttConnectionConfigBuilder {
    private params: MqttConnectionConfig

    private constructor() {
        this.params = {
            client_id: '',
            host_name: '',
            socket_options: new SocketOptions(),
            port: 8883,
            clean_session: false,
            keep_alive: undefined,
            will: undefined,
            username: `?SDK=BrowserJSv2&Version=${platform.crt_version()}`,
            password: undefined,
            websocket: {},
        };
    }

    /**
     * Creates a new builder using MQTT over websockets (the only option in browser)
     */
    static new_builder_for_websocket() {
        let builder = new AwsIotMqttConnectionConfigBuilder();
        return builder;
    }

    /**
     * Configures the IoT endpoint for this connection
     * @param endpoint The IoT endpoint to connect to
     */
    with_endpoint(endpoint: string) {
        this.params.host_name = endpoint;
        return this;
    }

    /**
     * The port to connect to on the IoT endpoint
     * @param port The port to connect to on the IoT endpoint. Usually 8883 for MQTT, or 443 for websockets
     */
    with_client_id(client_id: string) {
        this.params.client_id = client_id;
        return this;
    }

    /**
     * Determines whether or not the service should try to resume prior subscriptions, if it has any
     * @param clean_session true if the session should drop prior subscriptions when this client connects, false to resume the session
     */
    with_clean_session(clean_session: boolean) {
        this.params.clean_session = clean_session;
        return this;
    }

    /**
     * Configures the connection to use MQTT over websockets. No-op in the browser.
     */
    with_use_websockets() {
        /* no-op, but valid in the browser */
        return this;
    }

    /**
     * Configures MQTT keep-alive via PING messages. Note that this is not TCP keepalive.
     * @param keep_alive How often in seconds to send an MQTT PING message to the service to keep the connection alive
     */
    with_keep_alive_seconds(keep_alive: number) {
        this.params.keep_alive = keep_alive;
        return this;
    }

    /**
     * Configures the TCP socket timeout (in milliseconds)
     * @param timeout_ms TCP socket timeout
     */
    with_timeout_ms(timeout_ms: number) {
        this.params.timeout = timeout_ms;
        return this;
    }

    /**
     * Configures the will message to be sent when this client disconnects
     * @param will The will topic, qos, and message
     */
    with_will(will: MqttWill) {
        this.params.will = will;
        return this;
    }

    /**
     * Configures the common settings for the socket to use when opening a connection to the server
     * @param socket_options The socket settings
     */
    with_socket_options(socket_options: SocketOptions) {
        this.params.socket_options = socket_options;
        return this;
    }

    /**
     * Allows additional headers to be sent when establishing a websocket connection. Useful for custom authentication.
     * @param headers Additional headers to send during websocket connect
     */
    with_websocket_headers(headers: { [index: string]: string }) {
        this.params.websocket = {
            headers: headers
        };
        return this;
    }

    /**
     * Configures AWS credentials (usually from Cognito) for this connection
     * @param aws_region The service region to connect to
     * @param aws_access_id IAM Access ID
     * @param aws_secret_key IAM Secret Key
     * @param aws_sts_token STS token from Cognito (optional)
     */
    with_credentials(aws_region: string, aws_access_id: string, aws_secret_key: string, aws_sts_token?: string) {
        this.params.credentials = {
            aws_region: aws_region,
            aws_access_id: aws_access_id,
            aws_secret_key: aws_secret_key,
            aws_sts_token: aws_sts_token,
        };
        return this;
    }

    /**
     * Returns the configured MqttConnectionConfig
     * @returns The configured MqttConnectionConfig
     */
    build() {
        if (this.params.client_id === undefined || this.params.host_name === undefined) {
            throw 'client_id and endpoint are required';
        }

        return this.params;
    }
}
