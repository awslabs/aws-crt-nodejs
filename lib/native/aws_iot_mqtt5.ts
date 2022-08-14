/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Module for AWS IoT configuration and connection establishment
 *
 * @packageDocumentation
 * @module aws_iot_mqtt5
 * @mergeTarget
 */

import * as mqtt5 from "./mqtt5";
import * as mqtt5_packet from "../common/mqtt5_packet";
import * as io from "./io";
import * as auth from "./auth";
import {CrtError} from "./error";
import {HttpRequest} from "@awscrt/http";

/**
 * Websocket-specific MQTT5 connection AWS IoT configuration options
 *
 * @category IoT
 */
export interface WebsocketSigv4Config {

    /**
     * Sources the AWS Credentials used to sign the websocket connection handshake.  If not provided, the
     * default credentials provider chain is used.
     */
    credentialsProvider?: auth.AwsCredentialsProvider;

    /**
     * AWS region the websocket connection is being established in.  Must match the region embedded in the
     * endpoint.  If not provided, pattern-matching logic is used to extract the region from the endpoint.
     * Use this option if the pattern-matching logic has not yet been updated to handle new endpoint formats.
     */
    region?: string;
}

/**
 * Configuration options specific to
 * [AWS IoT Core custom authentication](https://docs.aws.amazon.com/iot/latest/developerguide/custom-authentication.html)
 * features.  For clients constructed by an {@link AwsIotMqtt5ConnectionConfigBuilder}, all parameters associated
 * with AWS IoT custom authentication are passed via the username and password properties in the CONNECT packet.
 */
export interface MqttConnectCustomAuthConfig {

    /**
     * Name of the custom authorizer to use.
     *
     * Required if the endpoint does not have a default custom authorizer associated with it.  It is strongly suggested
     * to URL-encode this value; the SDK will not do so for you.
     */
    authorizerName?: string;

    /**
     * The username to use with the custom authorizer.  Query-string elements of this property value will be unioned
     * with the query-string elements implied by other properties in this object.
     *
     * For example, if you set this to:
     *
     * 'MyUsername?someKey=someValue'
     *
     * and use {@link authorizerName} to specify the authorizer, the final username would look like:
     *
     * `MyUsername?someKey=someValue&x-amz-customauthorizer-name=<your authorizer's name>&<AWS IoT metrics query param>
     */
    username?: string;

    /**
     * The password to use with the custom authorizer.  Becomes the MQTT5 CONNECT packet's password property.
     * AWS IoT Core will base64 encode this binary data before passing it to the authorizer's lambda function.
     */
    password?: mqtt5_packet.BinaryData;

    /**
     * Key used to extract the custom authorizer token from MQTT username query-string properties.
     *
     * Required if the custom authorizer has signing enabled.  It is strongly suggested to URL-encode this value; the
     * SDK will not do so for you.
     */
    tokenKeyName?: string;

    /**
     * An opaque token value. This value must be signed by the private key associated with the custom authorizer and
     * the result placed in the {@link tokenSignature} property.
     *
     * Required if the custom authorizer has signing enabled.
     */
    tokenValue?: string;

    /**
     * The digital signature of the token value in the {@link tokenValue} property.  The signature must be based on
     * the private key associated with the custom authorizer.  The signature must be base64 encoded.
     *
     * Required if the custom authorizer has signing enabled.  It is strongly suggested to URL-encode this value; the
     * SDK will not do so for you.
     */
    tokenSignature?: string;
};

/**
 * Builder pattern class to create an {@link Mqtt5ClientConfig} which can then be used to create
 * an {@link Mqtt5Client}, configured for use with AWS IoT.
 *
 * @category IoT
 */
export class AwsIotMqtt5ConnectionConfigBuilder {

    private static DEFAULT_WEBSOCKET_MQTT_PORT : number = 443;
    private static DEFAULT_DIRECT_MQTT_PORT : number = 8883;
    private static DEFAULT_KEEP_ALIVE : 1200;

    private config: mqtt5.Mqtt5ClientConfig;

    private customAuthConfig?: MqttConnectCustomAuthConfig;

    private constructor(hostName : string, port: number, private tlsContextOptions: io.TlsContextOptions) {
        this.config = {
            hostName: hostName,
            port: port,
            connectProperties: {
                keepAliveIntervalSeconds: AwsIotMqtt5ConnectionConfigBuilder.DEFAULT_KEEP_ALIVE
            }
        };
    }

    /* Builders for difference connection methods to AWS IoT Core */

    /**
     * Create a new MQTT5 client builder with mTLS file paths
     *
     * @param hostName - AWS IoT endpoint to connect to
     * @param certPath - Path to certificate, in PEM format
     * @param keyPath - Path to private key, in PEM format
     */
    static newDirectMqttBuilderWithMtlsFromPath(hostName : string, certPath: string, keyPath: string) : AwsIotMqtt5ConnectionConfigBuilder {
        let builder = new AwsIotMqtt5ConnectionConfigBuilder(
            hostName,
            AwsIotMqtt5ConnectionConfigBuilder.DEFAULT_DIRECT_MQTT_PORT,
            io.TlsContextOptions.create_client_with_mtls_from_path(certPath, keyPath));

        if (io.is_alpn_available()) {
            builder.tlsContextOptions.alpn_list.unshift('x-amzn-mqtt-ca');
        }

        return builder;
    }

    /**
     * Create a new MQTT5 client builder with mTLS cert pair in memory
     *
     * @param hostName - AWS IoT endpoint to connect to
     * @param cert - Certificate, in PEM format
     * @param privateKey - Private key, in PEM format
     */
    static newDirectMqttBuilderWithMtlsFromMemory(hostName : string, cert: string, privateKey: string) : AwsIotMqtt5ConnectionConfigBuilder {
        let builder = new AwsIotMqtt5ConnectionConfigBuilder(
            hostName,
            AwsIotMqtt5ConnectionConfigBuilder.DEFAULT_DIRECT_MQTT_PORT,
            io.TlsContextOptions.create_client_with_mtls(cert, privateKey));

        if (io.is_alpn_available()) {
            builder.tlsContextOptions.alpn_list.unshift('x-amzn-mqtt-ca');
        }

        return builder;
    }

    /**
     * Create a new MQTT5 client builder with mTLS using a PKCS#11 library for private key operations.
     *
     * NOTE: This configuration only works on Unix devices.
     *
     * @param hostName - AWS IoT endpoint to connect to
     * @param pkcs11Options - PKCS#11 options.
     */
    static newDirectMqttBuilderWithMtlsFromPkcs11(hostName : string, pkcs11Options: io.TlsContextOptions.Pkcs11Options) : AwsIotMqtt5ConnectionConfigBuilder {
        let builder = new AwsIotMqtt5ConnectionConfigBuilder(
            hostName,
            AwsIotMqtt5ConnectionConfigBuilder.DEFAULT_DIRECT_MQTT_PORT,
            io.TlsContextOptions.create_client_with_mtls_pkcs11(pkcs11Options));

        if (io.is_alpn_available()) {
            builder.tlsContextOptions.alpn_list.unshift('x-amzn-mqtt-ca');
        }

        return builder;
    }

    /**
     * Create a new MQTT5 client builder with mTLS using a certificate in a Windows certificate store.
     *
     * NOTE: This configuration only works on Windows devices.
     *
     * @param hostName - AWS IoT endpoint to connect to
     * @param certificatePath - Path to certificate in a Windows certificate store.
     *      The path must use backslashes and end with the certificate's thumbprint.
     *      Example: `CurrentUser\MY\A11F8A9B5DF5B98BA3508FBCA575D09570E0D2C6`
     */
    static newDirectMqttBuilderWithMtlsFromWindowsCertStorePath(hostName : string, certificatePath: string) : AwsIotMqtt5ConnectionConfigBuilder {
        let builder = new AwsIotMqtt5ConnectionConfigBuilder(
            hostName,
            AwsIotMqtt5ConnectionConfigBuilder.DEFAULT_DIRECT_MQTT_PORT,
            io.TlsContextOptions.create_client_with_mtls_windows_cert_store_path(certificatePath));

        if (io.is_alpn_available()) {
            builder.tlsContextOptions.alpn_list.unshift('x-amzn-mqtt-ca');
        }

        return builder;
    }

    /**
     * Create a new MQTT5 client builder that will use direct mqtt and a custom authenticator controlled by
     * the username and password values.
     *
     * @param hostName - AWS IoT endpoint to connect to
     * @param customAuthConfig - AWS IoT custom auth configuration
     */
    static newDirectMqttBuilderWithCustomAuth(hostName : string, customAuthConfig: MqttConnectCustomAuthConfig) : AwsIotMqtt5ConnectionConfigBuilder {
        let builder = new AwsIotMqtt5ConnectionConfigBuilder(
            hostName,
            AwsIotMqtt5ConnectionConfigBuilder.DEFAULT_WEBSOCKET_MQTT_PORT,
            new io.TlsContextOptions());

        builder.customAuthConfig = customAuthConfig;
        builder.tlsContextOptions.alpn_list = ["mqtt"];

        return builder;
    }

    /**
     * Create a new MQTT5 client builder that will use websockets and AWS Sigv4 signing to establish
     * mutually-authenticated connections.
     *
     * @param hostName - AWS IoT endpoint to connect to
     * @param options - additional sigv4-oriented options to use
     */
    static newWebsocketMqttBuilderWithSigv4Auth(hostName : string, options?: WebsocketSigv4Config) : AwsIotMqtt5ConnectionConfigBuilder {
        let tlsContextOptions = new io.TlsContextOptions();
        tlsContextOptions.alpn_list = [];

        let builder = new AwsIotMqtt5ConnectionConfigBuilder(
            hostName,
            AwsIotMqtt5ConnectionConfigBuilder.DEFAULT_WEBSOCKET_MQTT_PORT,
            tlsContextOptions);

        let credentialsProvider = options?.credentialsProvider;
        if (!credentialsProvider) {
            credentialsProvider = auth.AwsCredentialsProvider.newDefault();
        }

        builder.config.websocketHandshakeTransform = async (request, done) => {
            const signingConfig : auth.AwsSigningConfig = {
                algorithm: auth.AwsSigningAlgorithm.SigV4,
                signature_type: auth.AwsSignatureType.HttpRequestViaQueryParams,
                provider: credentialsProvider as auth.AwsCredentialsProvider,
                region: options?.region ?? AwsIotMqtt5ConnectionConfigBuilder.extractRegionFromEndpoint(hostName),
                service: "iotdevicegateway",
                signed_body_value: auth.AwsSignedBodyValue.EmptySha256,
                omit_session_token: true,
            };

            try {
                await auth.aws_sign_request(request, signingConfig);
                done();
            } catch (error) {
                if (error instanceof CrtError) {
                    done(error.error_code);
                } else {
                    done(3); /* TODO: AWS_ERROR_UNKNOWN */
                }
            }
        };

        return builder;
    }

    /*
     * TODO: should this be eliminated or discouraged?
     *
     * Rationale: we pass all custom auth parameters by the MQTT CONNECT packet anyways and we must use 443 with ALPN,
     * so why add a pointless extra layer of protocol unless it's necessary (like in the browser)?
     */
    /**
     * Create a new MQTT5 client builder that will use mqtt over websockets and a custom authenticator controlled by
     * the username and password values.
     *
     * @param hostName - AWS IoT endpoint to connect to
     * @param customAuthConfig - AWS IoT custom auth configuration
     */
    static newWebsocketMqttBuilderWithCustomAuth(hostName : string, customAuthConfig: MqttConnectCustomAuthConfig) : AwsIotMqtt5ConnectionConfigBuilder {
        let builder = new AwsIotMqtt5ConnectionConfigBuilder(
            hostName,
            AwsIotMqtt5ConnectionConfigBuilder.DEFAULT_WEBSOCKET_MQTT_PORT,
            new io.TlsContextOptions());

        /* Pass in all custom auth configuration parameters via the CONNECT packet rather than the upgrade handshake */
        builder.config.websocketHandshakeTransform = (request: HttpRequest, done: (error_code?: number) => void) => { done(0); };
        builder.customAuthConfig = customAuthConfig;
        builder.tlsContextOptions.alpn_list = ["mqtt"];

        return builder;
    }

    /**
     * Creates a new MQTT5 client builder with default Tls options. This requires setting all connection details manually.
     * Defaults port to direct mqtt.
     */
    static newMqttBuilder(hostName : string) : AwsIotMqtt5ConnectionConfigBuilder {
        let builder = new AwsIotMqtt5ConnectionConfigBuilder(
            hostName,
            AwsIotMqtt5ConnectionConfigBuilder.DEFAULT_DIRECT_MQTT_PORT,
            new io.TlsContextOptions());

        return builder;
    }

    /* Instance Methods for various config overrides */

    /**
     * Overrides the default system trust store.
     * @param caDirpath - Only used on Unix-style systems where all trust anchors are
     * stored in a directory (e.g. /etc/ssl/certs).
     * @param caFilepath - Single file containing all trust CAs, in PEM format
     */
    withCertificateAuthorityFromPath(caDirpath?: string, caFilepath?: string) {
        this.tlsContextOptions.override_default_trust_store_from_path(caDirpath, caFilepath);
        return this;
    }

    /**
     * Overrides the default system trust store.
     * @param ca - Buffer containing all trust CAs, in PEM format
     */
    withCertificateAuthority(ca: string) {
        this.tlsContextOptions.override_default_trust_store(ca);
        return this;
    }


    private static extractRegionFromEndpoint(endpoint: string) : string {
        const regexpRegion = /^[\w\-]+.[\w\-]+.(\w+)./;
        const match = endpoint.match(regexpRegion);
        if (match) {
            return match[1];
        }

        throw new CrtError("AWS region could not be extracted from endpoint.  Use 'region' property on WebsocketConfig to set manually.");
    }
}