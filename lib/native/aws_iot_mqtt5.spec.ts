/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as test_utils from "@test/mqtt5";
import * as test_env from "@test/test_env"
import * as mqtt5 from "./mqtt5";
import * as iot from "./iot";
import * as fs from 'fs';
import * as auth from "./auth";
import * as io from "./io";

jest.setTimeout(10000);

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Aws Iot Core Direct Mqtt By File - Connection Success', async () => {
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        test_env.MQTT5_AWS_IOT_ENV.RSA_CERT,
        test_env.MQTT5_AWS_IOT_ENV.RSA_KEY
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});


test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Aws Iot Core Direct Mqtt By In-Memory - Connection Success', async () => {
    let cert = fs.readFileSync(test_env.MQTT5_AWS_IOT_ENV.RSA_CERT,'utf8');
    let key = fs.readFileSync(test_env.MQTT5_AWS_IOT_ENV.RSA_KEY,'utf8');
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromMemory(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        cert,
        key
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_custom_auth_unsigned())('Aws Iot Core Direct Mqtt Non-Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME,
        username: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME,
        password: Buffer.from(test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_PASSWORD, "utf-8")
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_custom_auth_signed())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        username: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        password: Buffer.from(test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD, "utf-8"),
        tokenKeyName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        tokenValue: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN,
        tokenSignature: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Aws Iot Core Websocket by Sigv4 - Connection Success', async () => {
    let provider: auth.AwsCredentialsProvider = auth.AwsCredentialsProvider.newStatic(
        test_env.MQTT5_AWS_IOT_ENV.CRED_ACCESS_KEY,
        test_env.MQTT5_AWS_IOT_ENV.CRED_SECRET_ACCESS_KEY,
        test_env.MQTT5_AWS_IOT_ENV.CRED_SESSION_TOKEN
    );
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        {
            credentialsProvider: provider
        }
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

// requires correct credentials to be sourced from the default credentials provider chain
test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_websocket())('Aws Iot Core Websocket Default Credentials - Connection Success', async () => {
    let provider: auth.AwsCredentialsProvider = auth.AwsCredentialsProvider.newDefault();
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        {
            credentialsProvider: provider
        }
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cognito())('Aws Iot Core Websocket Cognito Credentials - Connection Success', async () => {
    let provider: auth.AwsCredentialsProvider = auth.AwsCredentialsProvider.newCognito(
        {
            identity: test_env.MQTT5_AWS_IOT_ENV.COGNITO_IDENTITY,
            endpoint: test_env.MQTT5_AWS_IOT_ENV.COGNITO_ENDPOINT
        }
    );
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        {
            credentialsProvider: provider
        }
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_x509())('Aws Iot Core Websocket X509 Credentials - Connection Success', async () => {
    let tls_ctx_options: io.TlsContextOptions = io.TlsContextOptions.create_client_with_mtls_from_path(
        test_env.MQTT5_AWS_IOT_ENV.X509_CERT,
        test_env.MQTT5_AWS_IOT_ENV.X509_KEY
    );
    let tls_ctx = new io.ClientTlsContext(tls_ctx_options);
    let provider: auth.AwsCredentialsProvider = auth.AwsCredentialsProvider.newX509(
        {
            endpoint: test_env.MQTT5_AWS_IOT_ENV.X509_ENDPOINT,
            thingName: test_env.MQTT5_AWS_IOT_ENV.X509_THING_NAME,
            roleAlias: test_env.MQTT5_AWS_IOT_ENV.X509_ROLE_ALIAS,
            tlsContext: tls_ctx
        }
    );
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        {
            credentialsProvider: provider
        }
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_custom_auth_unsigned())('Aws Iot Core Direct Mqtt Non-Signing Custom Auth - Connection Failure Bad Password', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME,
        username: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME,
        password: Buffer.from("Thisisnotthepassword", "utf-8")
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_custom_auth_signed())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Failure Bad Password', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        username: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        password: Buffer.from("Thisisnotthepassword", "utf-8"),
        tokenKeyName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        tokenValue: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN,
        tokenSignature: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_custom_auth_signed())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Failure Bad Token Value', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        username: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        password: Buffer.from(test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD, "utf-8"),
        tokenKeyName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        tokenValue: "ThisIsNotTheTokenValue",
        tokenSignature: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_custom_auth_signed())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Failure Bad Token Signature', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        username: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        password: Buffer.from(test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD, "utf-8"),
        tokenKeyName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        tokenValue: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN,
        tokenSignature: "ThisIsNotTheTokenSignature"
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_custom_auth_unsigned())('Aws Iot Core Websocket Mqtt Non-Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME,
        username: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME,
        password: Buffer.from(test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_PASSWORD, "utf-8")
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithCustomAuth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_custom_auth_signed())('Aws Iot Core Websocket Mqtt Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        username: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        password: Buffer.from(test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD, "utf-8"),
        tokenKeyName: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        tokenValue: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN,
        tokenSignature: test_env.MQTT5_AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithCustomAuth(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_pkcs11())('Aws Iot Core PKCS11 - Connection Success', async () => {
    const pkcs11_lib = new io.Pkcs11Lib(test_env.MQTT5_AWS_IOT_ENV.PKCS11_LIB_PATH);
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPkcs11(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        {
            pkcs11_lib: pkcs11_lib,
            user_pin: test_env.MQTT5_AWS_IOT_ENV.PKCS11_PIN,
            token_label: test_env.MQTT5_AWS_IOT_ENV.PKCS11_TOKEN_LABEL,
            private_key_object_label: test_env.MQTT5_AWS_IOT_ENV.PKCS11_PRIVATE_KEY_LABEL,
            cert_file_path: test_env.MQTT5_AWS_IOT_ENV.PKCS11_CERT,
        }
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_pkcs12())('Aws Iot Core PKCS12 - Connection Success', async () => {
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPkcs12(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        {
            pkcs12_file : test_env.MQTT5_AWS_IOT_ENV.PKCS12_FILE,
            pkcs12_password : test_env.MQTT5_AWS_IOT_ENV.PKCS12_PASSWORD
        }
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_windows_cert())('Aws Iot Core Window Cert - Connection Success', async () => {
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromWindowsCertStorePath(
        test_env.MQTT5_AWS_IOT_ENV.HOST,
        test_env.MQTT5_AWS_IOT_ENV.WINDOWS_CERT
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

