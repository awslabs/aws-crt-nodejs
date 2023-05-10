/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt311 from "./mqtt";
import * as aws_iot_mqtt311 from "./aws_iot";

const conditional_test = (condition: boolean) => condition ? it : it.skip;

class AWS_IOT_ENV {
    public static HOST = process.env.AWS_TEST_MQTT311_IOT_CORE_HOST ?? "";

    public static CUSTOM_AUTH_UNSIGNED_NAME = process.env.AWS_TEST_MQTT311_IOT_CORE_NO_SIGNING_AUTHORIZER_NAME ?? "";
    public static CUSTOM_AUTH_UNSIGNED_USERNAME = process.env.AWS_TEST_MQTT311_IOT_CORE_NO_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static CUSTOM_AUTH_UNSIGNED_PASSWORD = process.env.AWS_TEST_MQTT311_IOT_CORE_NO_SIGNING_AUTHORIZER_PASSWORD ?? "";

    public static CUSTOM_AUTH_SIGNED_NAME = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_NAME ?? "";
    public static CUSTOM_AUTH_SIGNED_USERNAME = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static CUSTOM_AUTH_SIGNED_PASSWORD = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_PASSWORD ?? "";
    public static CUSTOM_AUTH_SIGNED_TOKEN = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_TOKEN ?? "";
    public static CUSTOM_AUTH_SIGNED_KEY_NAME = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_KEY_NAME ?? "";
    public static CUSTOM_AUTH_SIGNED_SIGNATURE = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_SIGNATURE ?? "";

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
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});
