/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as test_utils from "@test/mqtt5";
import * as mqtt5 from "./mqtt5";
import * as iot from "./iot";
import * as fs from 'fs';
import * as auth from "./auth";

jest.setTimeout(10000);

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Direct Mqtt By File - Connection Success', async () => {
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        test_utils.ClientEnvironmentalConfig.AWS_IOT_CERTIFICATE_PATH,
        test_utils.ClientEnvironmentalConfig.AWS_IOT_KEY_PATH
    );

    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});


test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Direct Mqtt By In-Memory - Connection Success', async () => {

    let cert = fs.readFileSync(test_utils.ClientEnvironmentalConfig.AWS_IOT_CERTIFICATE_PATH,'utf8');
    let key = fs.readFileSync(test_utils.ClientEnvironmentalConfig.AWS_IOT_KEY_PATH,'utf8');

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromMemory(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        cert,
        key
    );

    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Direct Mqtt Non-Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_utils.ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_NAME,
        username: test_utils.ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_USERNAME,
        password: Buffer.from(test_utils.ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_PASSWORD, "utf-8")
    };

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        customAuthConfig
    );

    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_NAME,
        username: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_USERNAME,
        password: Buffer.from(test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_PASSWORD, "utf-8"),
        tokenKeyName: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_KEY_NAME,
        tokenValue: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN,
        tokenSignature: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_SIGNATURE
    };

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        customAuthConfig
    );

    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

// requires correct credentials to be sourced from the default credentials provider chain
test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Websocket by Sigv4 - Connection Success', async () => {

    let provider: auth.AwsCredentialsProvider = auth.AwsCredentialsProvider.newStatic(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_ACCESS_KEY_ID,
        test_utils.ClientEnvironmentalConfig.AWS_IOT_SECRET_ACCESS_KEY
    );

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        {
            credentialsProvider: provider
        }
    );

    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Direct Mqtt Non-Signing Custom Auth - Connection Failure Bad Password', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_utils.ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_NAME,
        username: test_utils.ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_USERNAME,
        password: Buffer.from("Thisisnotthepassword", "utf-8")
    };

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        customAuthConfig
    );

    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Failure Bad Password', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_NAME,
        username: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_USERNAME,
        password: Buffer.from("Thisisnotthepassword", "utf-8"),
        tokenKeyName: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_KEY_NAME,
        tokenValue: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN,
        tokenSignature: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_SIGNATURE
    };

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        customAuthConfig
    );

    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Failure Bad Token Value', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_NAME,
        username: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_USERNAME,
        password: Buffer.from(test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_PASSWORD, "utf-8"),
        tokenKeyName: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_KEY_NAME,
        tokenValue: "ThisIsNotTheTokenValue",
        tokenSignature: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_SIGNATURE
    };

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        customAuthConfig
    );

    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Failure Bad Token Signature', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_NAME,
        username: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_USERNAME,
        password: Buffer.from(test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_PASSWORD, "utf-8"),
        tokenKeyName: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_KEY_NAME,
        tokenValue: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN,
        tokenSignature: "ThisIsNotTheTokenSignature"
    };

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        customAuthConfig
    );

    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Websocket Mqtt Non-Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_utils.ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_NAME,
        username: test_utils.ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_USERNAME,
        password: Buffer.from(test_utils.ClientEnvironmentalConfig.AWS_IOT_NO_SIGNING_AUTHORIZER_PASSWORD, "utf-8")
    };

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithCustomAuth(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        customAuthConfig
    );

    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Websocket Mqtt Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_NAME,
        username: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_USERNAME,
        password: Buffer.from(test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_PASSWORD, "utf-8"),
        tokenKeyName: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_KEY_NAME,
        tokenValue: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN,
        tokenSignature: test_utils.ClientEnvironmentalConfig.AWS_IOT_SIGNING_AUTHORIZER_TOKEN_SIGNATURE
    };

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithCustomAuth(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        customAuthConfig
    );

    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});
