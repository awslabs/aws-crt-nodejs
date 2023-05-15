/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt311 from "./mqtt";
import * as aws_iot_mqtt311 from "./aws_iot";
import * as io from "./io"
import * as auth from "./auth"
import { v4 as uuid } from 'uuid';

const conditional_test = (condition: boolean) => condition ? it : it.skip;

class AWS_IOT_ENV {
    public static HOST = process.env.AWS_TEST_MQTT311_IOT_CORE_HOST ?? "";
    public static REGION = process.env.AWS_TEST_MQTT311_IOT_CORE_REGION ?? "";

    public static CUSTOM_AUTH_UNSIGNED_NAME = process.env.AWS_TEST_MQTT311_IOT_CORE_NO_SIGNING_AUTHORIZER_NAME ?? "";
    public static CUSTOM_AUTH_UNSIGNED_USERNAME = process.env.AWS_TEST_MQTT311_IOT_CORE_NO_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static CUSTOM_AUTH_UNSIGNED_PASSWORD = process.env.AWS_TEST_MQTT311_IOT_CORE_NO_SIGNING_AUTHORIZER_PASSWORD ?? "";

    public static CUSTOM_AUTH_SIGNED_NAME = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_NAME ?? "";
    public static CUSTOM_AUTH_SIGNED_USERNAME = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static CUSTOM_AUTH_SIGNED_PASSWORD = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_PASSWORD ?? "";
    public static CUSTOM_AUTH_SIGNED_TOKEN = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_TOKEN ?? "";
    public static CUSTOM_AUTH_SIGNED_KEY_NAME = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_KEY_NAME ?? "";
    public static CUSTOM_AUTH_SIGNED_SIGNATURE = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_SIGNATURE ?? "";

    public static PKCS11_LIB_PATH = process.env.AWS_TEST_PKCS11_LIB ?? "";
    public static PKCS11_TOKEN_LABEL = process.env.AWS_TEST_PKCS11_TOKEN_LABEL ?? "";
    public static PKCS11_PIN = process.env.AWS_TEST_PKCS11_PIN ?? "";
    public static PKCS11_PRIVATE_KEY_LABEL = process.env.AWS_TEST_PKCS11_PKEY_LABEL ?? "";
    public static PKCS11_CERT = process.env.AWS_TEST_PKCS11_CERT_FILE ?? "";

    public static PKCS12_FILE = process.env.AWS_TEST_MQTT311_IOT_CORE_PKCS12_KEY ?? "";
    public static PKCS12_PASSWORD = process.env.AWS_TEST_MQTT311_IOT_CORE_PKCS12_KEY_PASSWORD ?? "";

    public static WINDOWS_CERT = process.env.AWS_TEST_MQTT311_IOT_CORE_WINDOWS_CERT_STORE ?? "";

    public static CRED_ACCESS_KEY = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_ACCESS_KEY ?? "";
    public static CRED_SECRET_ACCESS_KEY = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_SECRET_ACCESS_KEY ?? "";
    public static CRED_SESSION_TOKEN = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_SESSION_TOKEN ?? "";

    public static AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID ?? "";
    public static AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? "";

    public static COGNITO_IDENTITY = process.env.AWS_TEST_MQTT311_COGNITO_IDENTITY ?? "";
    public static COGNITO_ENDPOINT = process.env.AWS_TEST_MQTT311_COGNITO_ENDPOINT ?? "";

    public static X509_ENDPOINT = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_ENDPOINT ?? "";
    public static X509_CA = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_CA ?? "";
    public static X509_CERT = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_CERT ?? "";
    public static X509_KEY = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_KEY ?? "";
    public static X509_ROLE_ALIAS = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_ROLE_ALIAS ?? "";
    public static X509_THING_NAME = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_THING_NAME ?? "";

    public static is_valid_custom_auth_unsigned() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_PASSWORD !== "";
    }

    public static is_valid_custom_auth_signed() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE !== "";
    }

    public static is_valid_pkcs11() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.PKCS11_LIB_PATH !== "" &&
            AWS_IOT_ENV.PKCS11_TOKEN_LABEL !== "" &&
            AWS_IOT_ENV.PKCS11_PIN !== "" &&
            AWS_IOT_ENV.PKCS11_PRIVATE_KEY_LABEL !== "" &&
            AWS_IOT_ENV.PKCS11_CERT !== "";
    }

    public static is_valid_pkcs12() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.PKCS12_FILE !== "" &&
            AWS_IOT_ENV.PKCS12_PASSWORD !== "";
    }

    public static is_valid_windows_cert() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.WINDOWS_CERT !== "";
    }

    public static is_valid_websocket() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.REGION !== "" &&
            AWS_IOT_ENV.AWS_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.AWS_SECRET_ACCESS_KEY !== ""
    }

    public static is_valid_cred() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.REGION !== "" &&
            AWS_IOT_ENV.CRED_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.CRED_SECRET_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.CRED_SESSION_TOKEN !== "";
    }

    public static is_valid_cognito() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.COGNITO_ENDPOINT !== "" &&
            AWS_IOT_ENV.COGNITO_IDENTITY !== "";
    }

    public static is_valid_x509() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.X509_ENDPOINT !== "" &&
            AWS_IOT_ENV.X509_CA !== "" &&
            AWS_IOT_ENV.X509_CERT !== "" &&
            AWS_IOT_ENV.X509_KEY !== "" &&
            AWS_IOT_ENV.X509_ROLE_ALIAS !== "" &&
            AWS_IOT_ENV.X509_THING_NAME !== "";
    }
}

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_unsigned())('Aws Iot Core Mqtt over websockets with Non-Signing Custom Auth - Connection Success', async () => {

    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket();
    builder.with_custom_authorizer(
        AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME,
        AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME,
        "",
        AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_PASSWORD,
        undefined,
        undefined,
    )
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_signed())('Aws Iot Core Mqtt over websockets with Signing Custom Auth - Connection Success', async () => {
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket();
    builder.with_custom_authorizer(
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE,
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD,
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN,
    )
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

conditional_test(AWS_IOT_ENV.is_valid_pkcs11())('Aws Iot Core PKCS11 connection', async () => {
    const pkcs11_lib = new io.Pkcs11Lib(AWS_IOT_ENV.PKCS11_LIB_PATH);
    const builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_mtls_pkcs11_builder({
        pkcs11_lib: pkcs11_lib,
        user_pin: AWS_IOT_ENV.PKCS11_PIN,
        token_label: AWS_IOT_ENV.PKCS11_TOKEN_LABEL,
        private_key_object_label: AWS_IOT_ENV.PKCS11_PRIVATE_KEY_LABEL,
        cert_file_path: AWS_IOT_ENV.PKCS11_CERT,
    });
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

conditional_test(AWS_IOT_ENV.is_valid_pkcs12())('Aws Iot Core PKCS12 connection', async () => {
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_mtls_pkcs12_builder({
        pkcs12_file : AWS_IOT_ENV.PKCS12_FILE,
        pkcs12_password : AWS_IOT_ENV.PKCS12_PASSWORD});
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

conditional_test(AWS_IOT_ENV.is_valid_windows_cert())('Aws Iot Core Windows Cert connection', async () => {
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_mtls_windows_cert_store_path_builder(
        AWS_IOT_ENV.WINDOWS_CERT);
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_unsigned())('Aws Iot Core - Direct MQTT Custom Auth unsigned', async () => {
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_default_builder();
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    builder.with_custom_authorizer(
        AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME,
        AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME,
        "",
        AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_PASSWORD,
        undefined,
        undefined)
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_signed())('Aws Iot Core - Direct MQTT Custom Auth signed', async () => {
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_default_builder();
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    builder.with_custom_authorizer(
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE,
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD,
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN)
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

conditional_test(AWS_IOT_ENV.is_valid_cred())('MQTT Native Websocket Connect/Disconnect', async () => {
    let websocket_config = {
        region: AWS_IOT_ENV.REGION,
        credentials_provider: auth.AwsCredentialsProvider.newStatic(
            AWS_IOT_ENV.CRED_ACCESS_KEY,
            AWS_IOT_ENV.CRED_SECRET_ACCESS_KEY,
            AWS_IOT_ENV.CRED_SESSION_TOKEN
        ),
    }
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_with_websockets(websocket_config);
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    let config = builder.build();
    let client = new mqtt311.MqttClient(new io.ClientBootstrap());
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

conditional_test(AWS_IOT_ENV.is_valid_cred())('MQTT Native Websocket Connect/Disconnect No Bootstrap', async () => {
    let websocket_config = {
        region: AWS_IOT_ENV.REGION,
        credentials_provider: auth.AwsCredentialsProvider.newStatic(
            AWS_IOT_ENV.CRED_ACCESS_KEY,
            AWS_IOT_ENV.CRED_SECRET_ACCESS_KEY,
            AWS_IOT_ENV.CRED_SESSION_TOKEN
        ),
    }
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_with_websockets(websocket_config);
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

// requires correct credentials to be sourced from the default credentials provider chain
conditional_test(AWS_IOT_ENV.is_valid_websocket())('MQTT Native Websocket Default AWS Credentials', async () => {
    let websocket_config = {
        region: AWS_IOT_ENV.REGION,
        credentials_provider: auth.AwsCredentialsProvider.newDefault()
    }
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_with_websockets(websocket_config);
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

conditional_test(AWS_IOT_ENV.is_valid_cognito())('MQTT Native Websocket Cognito Credentials', async () => {
    let websocket_config = {
        region: AWS_IOT_ENV.REGION,
        credentials_provider: auth.AwsCredentialsProvider.newCognito({
            identity: AWS_IOT_ENV.COGNITO_IDENTITY,
            endpoint: AWS_IOT_ENV.COGNITO_ENDPOINT
        })
    }
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_with_websockets(websocket_config);
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

conditional_test(AWS_IOT_ENV.is_valid_x509())('MQTT Native Websocket X509 Credentials', async () => {
    let tls_ctx_options: io.TlsContextOptions = io.TlsContextOptions.create_client_with_mtls_from_path(
        AWS_IOT_ENV.X509_CERT,
        AWS_IOT_ENV.X509_KEY
    );
    let tls_ctx = new io.ClientTlsContext(tls_ctx_options);
    let websocket_config = {
        region: AWS_IOT_ENV.REGION,
        credentials_provider: auth.AwsCredentialsProvider.newX509({
            endpoint: AWS_IOT_ENV.X509_ENDPOINT,
            thingName: AWS_IOT_ENV.X509_THING_NAME,
            roleAlias: AWS_IOT_ENV.X509_ROLE_ALIAS,
            tlsContext: tls_ctx
        })
    }
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_with_websockets(websocket_config);
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});
