/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as test_utils from "@test/mqtt5";
import * as mqtt5 from "./mqtt5";
import * as aws_iot_mqtt5 from "./aws_iot_mqtt5";
import {v4 as uuid} from "uuid";
import * as fs from 'fs';
import * as io from './io';

jest.setTimeout(10000);

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Direct Mqtt By File - Connection Success', async () => {
    let builder = aws_iot_mqtt5.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        test_utils.ClientEnvironmentalConfig.AWS_IOT_CERTIFICATE_PATH,
        test_utils.ClientEnvironmentalConfig.AWS_IOT_KEY_PATH
    );

    builder.withConnectProperties({
        keepAliveIntervalSeconds: 1200,
        clientId: `client-${uuid()}`,
    });

    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Direct Mqtt By In-Memory - Connection Success', async () => {

    let cert = fs.readFileSync(test_utils.ClientEnvironmentalConfig.AWS_IOT_CERTIFICATE_PATH,'utf8');
    let key = fs.readFileSync(test_utils.ClientEnvironmentalConfig.AWS_IOT_KEY_PATH,'utf8');

    let builder = aws_iot_mqtt5.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromMemory(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        cert,
        key
    );

    builder.withConnectProperties({
        keepAliveIntervalSeconds: 1200,
        clientId: `client-${uuid()}`,
    });

    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

// requires correct credentials to be sourced from the default credentials provider chain
test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Websocket by default credentials provider - Connection Success', async () => {

    let builder = aws_iot_mqtt5.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        // the region extraction logic does not work for gamma endpoint formats so pass in region manually
        { region: "us-east-1" }
    );

    builder.withConnectProperties({
        keepAliveIntervalSeconds: 1200,
        clientId: `client-${uuid()}`,
    });

    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});
