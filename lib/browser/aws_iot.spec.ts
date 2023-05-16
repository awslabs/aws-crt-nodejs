/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt311 from "./mqtt";
import * as aws_iot_mqtt311 from "./aws_iot";
import * as io from "./io"
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

    public static CRED_ACCESS_KEY = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_ACCESS_KEY ?? "";
    public static CRED_SECRET_ACCESS_KEY = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_SECRET_ACCESS_KEY ?? "";
    public static CRED_SESSION_TOKEN = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_SESSION_TOKEN ?? "";

    public static is_valid_custom_auth_unsigned() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_PASSWORD !== ""
    }

    public static is_valid_custom_auth_signed() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE !== ""
    }

    public static is_valid_cred() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.REGION !== "" &&
            AWS_IOT_ENV.CRED_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.CRED_SECRET_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.CRED_SESSION_TOKEN !== "";
    }
}

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_unsigned())('Aws Iot Core Mqtt over websockets with Non-Signing Custom Auth - Connection Success', async () => {

    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_default_builder();
    builder.with_custom_authorizer(
        AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME,
        AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME,
        "",
        AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_PASSWORD
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
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_default_builder();
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

conditional_test(AWS_IOT_ENV.is_valid_cred())('MQTT Native Websocket Connect/Disconnect', async () => {
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_with_websockets();
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    builder.with_credentials(
        AWS_IOT_ENV.REGION,
        AWS_IOT_ENV.CRED_ACCESS_KEY,
        AWS_IOT_ENV.CRED_SECRET_ACCESS_KEY,
        AWS_IOT_ENV.CRED_SESSION_TOKEN
    );
    let config = builder.build();
    let client = new mqtt311.MqttClient(new io.ClientBootstrap());
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

conditional_test(AWS_IOT_ENV.is_valid_cred())('MQTT Native Websocket Connect/Disconnect No Bootstrap', async () => {
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_with_websockets();
    builder.with_endpoint(AWS_IOT_ENV.HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    builder.with_credentials(
        AWS_IOT_ENV.REGION,
        AWS_IOT_ENV.CRED_ACCESS_KEY,
        AWS_IOT_ENV.CRED_SECRET_ACCESS_KEY,
        AWS_IOT_ENV.CRED_SESSION_TOKEN
    );
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});
