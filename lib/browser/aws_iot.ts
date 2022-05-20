/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Module for AWS IoT configuration and connection establishment
 *
 * @packageDocumentation
 * @module aws-iot
 * @preferred
 */

import { SocketOptions } from "./io";
import { MqttConnectionConfig, MqttWill } from "./mqtt";
import * as platform from "../common/platform";

/**
 * Builder functions to create a {@link MqttConnectionConfig} which can then be used to create
 * a {@link MqttClientConnection}, configured for use with AWS IoT.
 *
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
            credentialConfig: {
                algorithm: 0,
                signature_type: 0,
                service: "iotdevicegateway",
                region: ""
            },
        };
    }

    /**
     * For API compatibility with the native version. Does not set up mTLS.
     *
     * @returns a new websocket connection builder object with default TLS configuration
     */
    static new_mtls_builder(...args: any[]) {
        return AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket();
    }

    /**
     * For API compatibility with the native version. Alias for {@link new_builder_for_websocket}.
     *
     * @returns a new websocket connection builder object with default TLS configuration
     */
    static new_with_websockets(...args: any[]) {
        return AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket();
    }

    /**
     * Creates a new builder using MQTT over websockets (the only option in browser)
     *
     * @returns a new websocket connection builder object with default TLS configuration
     */
    static new_builder_for_websocket() {
        let builder = new AwsIotMqttConnectionConfigBuilder();
        return builder;
    }

    /**
     * Configures the IoT endpoint for this connection
     * @param endpoint The IoT endpoint to connect to
     *
     * @returns this builder object
     */
    with_endpoint(endpoint: string) {
        this.params.host_name = endpoint;
        return this;
    }

    /**
     * The client id to use for this connection
     * @param client_id The client id to use for this connection
     *
     * @returns this builder object
     */
    with_client_id(client_id: string) {
        this.params.client_id = client_id;
        return this;
    }

    /**
     * The port to connect to on the IoT endpoint
     * @param port The port to connect to on the IoT endpoint. Usually 8883 for MQTT, or 443 for websockets
     *
     * @returns this builder object
     */
    with_port(port: number) {
        this.params.port = port;
        return this;
    }

    /**
     * Determines whether or not the service should try to resume prior subscriptions, if it has any
     * @param clean_session true if the session should drop prior subscriptions when this client connects, false to resume the session
     *
     * @returns this builder object
     */
    with_clean_session(clean_session: boolean) {
        this.params.clean_session = clean_session;
        return this;
    }

    /**
     * Configures the connection to use MQTT over websockets. No-op in the browser.
     *
     * @returns this builder object
     */
    with_use_websockets() {
        /* no-op, but valid in the browser */
        return this;
    }

    /**
     * Configures MQTT keep-alive via PING messages. Note that this is not TCP keepalive.
     * @param keep_alive How often in seconds to send an MQTT PING message to the service to keep the connection alive
     *
     * @returns this builder object
     */
    with_keep_alive_seconds(keep_alive: number) {
        this.params.keep_alive = keep_alive;
        return this;
    }

    /**
     * Configures the TCP socket timeout (in milliseconds)
     * @param timeout_ms TCP socket timeout
     * @deprecated in favor of socket options
     *
     * @returns this builder object
     */
    with_timeout_ms(timeout_ms: number) {
        this.with_ping_timeout_ms(timeout_ms);
        return this;
    }

    /**
     * Configures the PINGREQ response timeout (in milliseconds)
     * @param ping_timeout PINGREQ response timeout
     *
     * @returns this builder object
     */
    with_ping_timeout_ms(ping_timeout: number) {
        this.params.ping_timeout = ping_timeout;
        return this;
    }

    /**
     * Configures the will message to be sent when this client disconnects
     * @param will The will topic, qos, and message
     *
     * @returns this builder object
     */
    with_will(will: MqttWill) {
        this.params.will = will;
        return this;
    }

    /**
     * Configures the common settings for the socket to use when opening a connection to the server
     * @param socket_options The socket settings
     *
     * @returns this builder object
     */
    with_socket_options(socket_options: SocketOptions) {
        this.params.socket_options = socket_options;
        return this;
    }

    /**
     * Allows additional headers to be sent when establishing a websocket connection. Useful for custom authentication.
     * @param headers Additional headers to send during websocket connect
     *
     * @returns this builder object
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
     * @param aws_sts_token session credentials token (optional)
     *
     * @returns this builder object
     */
     with_credentials(aws_region: string, aws_access_id: string, aws_secret_key: string, aws_sts_token?: string,
            customer_provider? : any, updateCredentialCallback?: Function) {
        this.params.credentialConfig.credentials_provider = {
            aws_region: aws_region,
            aws_access_id: aws_access_id,
            aws_secret_key: aws_secret_key,
            aws_sts_token: aws_sts_token,
            aws_provider: customer_provider

        };
        this.params.credentialConfig.updateCredentialCallback = updateCredentialCallback;
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
