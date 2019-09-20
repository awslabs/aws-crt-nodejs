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

export class AwsIotMqttConnectionConfigBuilder {
    private params: MqttConnectionConfig   
    private tls_ctx_options?: io.TlsContextOptions

    private constructor() {
        this.params = {
            client_id: '', 
            host_name: '',
            connect_timeout: 3000, 
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
        let builder = new AwsIotMqttConnectionConfigBuilder();
        builder.tls_ctx_options = io.TlsContextOptions.create_client_with_mtls_from_path(cert_path, key_path);
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
        let builder = new AwsIotMqttConnectionConfigBuilder();
        builder.tls_ctx_options = io.TlsContextOptions.create_client_with_mtls(cert, private_key);
        builder.params.port = 8883;

        if (io.is_alpn_available()) {
            builder.tls_ctx_options.alpn_list.unshift('x-amzn-mqtt-ca');
        }

        return builder;
    }

    with_certificate_authority_from_path(ca_path?: string, ca_file?: string) {
        if (this.tls_ctx_options !== undefined) {
            this.tls_ctx_options.override_default_trust_store(ca_path, ca_file);
        }

        return this;
    }

    with_endpoint(endpoint: string) {
        this.params.host_name = endpoint;
        return this;
    }

    with_port(port: number) {
        this.params.port = port;
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
        this.params.use_websocket = true;

        if (this.tls_ctx_options !== undefined) {
            this.tls_ctx_options.alpn_list = [];
            this.params.port = 443;
        }

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

    with_will(will: MqttWill) {
        this.params.will = will;
        return this;
    }

    with_connect_timeout_ms(timeout: number) {
        this.params.connect_timeout = timeout;
        return this;
    }

    build() {
        if (this.params.client_id === undefined || this.params.host_name === undefined) {
            throw 'client_id and endpoint are required';
        }

        if (this.tls_ctx_options === undefined) {
            throw 'tls options have to be specified'
        }

        this.params.tls_ctx = new io.ClientTlsContext(this.tls_ctx_options);       
        return this.params;       
    }
}
