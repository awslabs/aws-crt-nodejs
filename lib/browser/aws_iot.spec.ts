/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/* NOTE: This is using the MQTT5 utils for setting up the test and nothing more. */
import * as test_utils from "@test/mqtt5";
import * as aws_iot_mqtt311 from "./aws_iot";
import * as mqtt311 from "./mqtt";
import {once} from "events";
import {v4 as uuid} from "uuid";
import * as auth from "./auth";

jest.setTimeout(10000);

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Mqtt 311 over websockets with environmental credentials - Connection Success', async () => {
    let provider: auth.StaticCredentialProvider = new auth.StaticCredentialProvider({
        aws_access_id: test_utils.ClientEnvironmentalConfig.AWS_IOT_ACCESS_KEY_ID,
        aws_secret_key: test_utils.ClientEnvironmentalConfig.AWS_IOT_SECRET_ACCESS_KEY,
        aws_region: "us-east-1"
    });

    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket();
    builder.with_endpoint(test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST);
    builder.with_credential_provider(provider);
    builder.with_keep_alive_seconds(1200);
    builder.with_client_id(`client-${uuid()}`);

    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(builder.build());

    const connectionSuccess = once(connection, "connection_success")

    connection.connect();
    let connectionSuccessEvent: mqtt311.OnConnectionSuccessResult = (await connectionSuccess)[0];
    expect(connectionSuccessEvent.session_present).toBeFalsy();
    expect(connectionSuccessEvent.reason_code).toBeUndefined();

    const disconnection = once(connection, "disconnect");
    const closed = once(connection, "closed");
    connection.disconnect();
    await disconnection;
    await closed;
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIotCoreEnvironment())('Aws Iot Core Mqtt 311 over websockets with environmental credentials - Connection Failure', async () => {
    let provider: auth.StaticCredentialProvider = new auth.StaticCredentialProvider({
        aws_access_id: test_utils.ClientEnvironmentalConfig.AWS_IOT_ACCESS_KEY_ID,
        aws_secret_key: test_utils.ClientEnvironmentalConfig.AWS_IOT_SECRET_ACCESS_KEY,
        aws_region: "us-east-1"
    });

    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket();
    builder.with_endpoint(test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST);
    builder.with_keep_alive_seconds(1);
    builder.with_client_id(`client-${uuid()}`);
    builder.with_credential_provider(provider);
    /* Use the wrong port ensure a fail */
    builder.with_port(321);

    let client = new mqtt311.MqttClient();
    let connection = client.new_connection(builder.build());

    const connectionFailure = once(connection, "connection_failure")

    let connectResult = connection.connect();
    await expect(connectResult).rejects.toBeDefined();

    let connectionFailedEvent: mqtt311.OnConnectionFailedResult = (await connectionFailure)[0];
    expect(connectionFailedEvent).toBeDefined();
    expect(connectionFailedEvent.error).toBeDefined();

    // Disconnect to stop trying to reconnect
    connection.disconnect();
});
