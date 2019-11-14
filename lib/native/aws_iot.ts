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
import { MqttConnectionConfig, MqttWill } from "./mqtt";
import * as io from "./io";
import * as platform from '../common/platform';
import { HttpProxyOptions } from "./http";
import { AwsCredentialsProvider, AwsSigner, AwsSigningConfig, AwsSigningAlgorithm } from "./auth";

export interface WebsocketConfig {
    credentials_provider: AwsCredentialsProvider;
    signer?: AwsSigner;
    create_signing_config?: () => AwsSigningConfig;

    proxy_options?: HttpProxyOptions;
    region: string;
    service?: string;
}

/** Creates a MqttConnectionConfig to simplify configuring a connection to IoT services */
export class AwsIotMqttConnectionConfigBuilder {
    private params: MqttConnectionConfig

    private constructor(private tls_ctx_options: io.TlsContextOptions) {
        this.params = {
            client_id: '',
            host_name: '',
            socket_options: new io.SocketOptions(),
            port: 8883,
            use_websocket: false,
            clean_session: false,
            keep_alive: undefined,
            will: undefined,
            username: `?SDK=NodeJSv2&Version=${platform.crt_version()}`,
            password: undefined,
            tls_ctx: undefined,
        };
    }

    /**
     * Create a new builder with mTLS file paths
     * @param cert_path - Path to certificate, in PEM format
     * @param key_path - Path to private key, in PEM format
     */
    static new_mtls_builder_from_path(cert_path: string, key_path: string) {
        let builder = new AwsIotMqttConnectionConfigBuilder(io.TlsContextOptions.create_client_with_mtls_from_path(cert_path, key_path));
        builder.params.port = 8883;

        if (io.is_alpn_available()) {
            builder.tls_ctx_options.alpn_list.unshift('x-amzn-mqtt-ca');
        }

        return builder;
    }

    /**
     * Create a new builder with mTLS cert pair in memory
     * @param cert - Certificate, in PEM format
     * @param private_key - Private key, in PEM format
     */
    static new_mtls_builder(cert: string, private_key: string) {
        let builder = new AwsIotMqttConnectionConfigBuilder(io.TlsContextOptions.create_client_with_mtls(cert, private_key));
        builder.params.port = 8883;

        if (io.is_alpn_available()) {
            builder.tls_ctx_options.alpn_list.unshift('x-amzn-mqtt-ca');
        }

        return builder;
    }

    /**
     * Configures the connection to use MQTT over websockets. Forces the port to 443.
     */
    static new_with_websockets(options?: WebsocketConfig) {
        let builder = new AwsIotMqttConnectionConfigBuilder(new io.TlsContextOptions());

        builder.params.use_websocket = true;
        builder.params.proxy_options = options?.proxy_options;

        if (builder.tls_ctx_options) {
            builder.tls_ctx_options.alpn_list = [];
            builder.params.port = 443;
        }

        if (options) {
            builder.params.websocket_handshake_transform = async (request, done) => {
                const signer: AwsSigner = options.signer ?? new AwsSigner();
                const signing_config = options.create_signing_config?.()
                    ?? new AwsSigningConfig(
                        AwsSigningAlgorithm.SigV4QueryParam,
                        options.credentials_provider,
                        options.region,
                        options.service ?? "iotdevicegateway",
                        new Date(),
                        ["x-amz-date", "x-amz-security-token"],
                        false,
                        true,
                        false);

                try {
                    await signer.sign_request(request, signing_config);
                    done();
                } catch(error) {
                    done(error);
                }
            };
        }

        return builder;
    }

    /**
     * Overrides the default system trust store.
     * @param ca_dirpath - Only used on Unix-style systems where all trust anchors are
     * stored in a directory (e.g. /etc/ssl/certs).
     * @param ca_filepath - Single file containing all trust CAs, in PEM format
     */
    with_certificate_authority_from_path(ca_dirpath?: string, ca_filepath?: string) {
        this.tls_ctx_options.override_default_trust_store_from_path(ca_dirpath, ca_filepath);
        return this;
    }

    /**
     * Overrides the default system trust store.
     * @param ca - Buffer containing all trust CAs, in PEM format
     */
    with_certificate_authority(ca: string) {
        this.tls_ctx_options.override_default_trust_store(ca);
        return this;
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
    with_port(port: number) {
        this.params.port = port;
        return this;
    }

    /**
     * Configures the client_id to use to connect to the IoT Core service
     * @param client_id The client id for this connection. Needs to be unique across all devices/clients.
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
    with_socket_options(socket_options: io.SocketOptions) {
        this.params.socket_options = socket_options;
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

        this.params.tls_ctx = new io.ClientTlsContext(this.tls_ctx_options);
        return this.params;
    }
}
