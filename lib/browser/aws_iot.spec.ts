/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * NOTE: Will later add more testing and split MQTT5 testing setup from MQTT311 testing setup.
 * In the short term, the MQTT311 tests will reuse the majority of MQTT5 material.
 */

import * as test_utils from "@test/mqtt5";
import * as mqtt311 from "./mqtt";
import * as aws_iot_mqtt311 from "./aws_iot";

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Mqtt over websockets with Non-Signing Custom Auth - Connection Success', async () => {

    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_default_builder();
    builder.with_custom_authorizer(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_USERNAME,
        test_utils.ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_NAME,
        "",
        test_utils.ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_PASSWORD,
        undefined,
        undefined,
    )
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Mqtt over websockets with Signing Custom Auth - Connection Success', async () => {
    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_default_builder();
    builder.with_custom_authorizer(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_USERNAME,
        test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_NAME,
        test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_SIGNATURE,
        test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_PASSWORD,
        test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_KEY_NAME,
        test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN,
    )
    let config = builder.build();
    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(config);
    await connection.connect();
    await connection.disconnect();
});
