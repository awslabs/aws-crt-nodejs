/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */


import * as test_env from "@test/test_env"
import * as mqtt5 from "./mqtt5";
import * as io from "./io";
import * as mqtt_request_response from "./mqtt_request_response";
import {v4 as uuid} from "uuid";
import {once} from "events";
import * as iot from "./iot";

jest.setTimeout(1000000);

interface TestingOptions {
    startConnected : boolean,
}

interface Mqtt5TestingContext {
    protocolClient : mqtt5.Mqtt5Client,

    client : mqtt_request_response.RequestResponseClient,
}

async function createMqtt5TestingContext(testOptions: TestingOptions) : Promise<Mqtt5TestingContext> {

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(
        test_env.AWS_IOT_ENV.MQTT5_HOST,
        test_env.AWS_IOT_ENV.MQTT5_RSA_CERT,
        test_env.AWS_IOT_ENV.MQTT5_RSA_KEY
    );

    builder.withConnectProperties({
        clientId : uuid(),
        keepAliveIntervalSeconds: 1200,
    });

    let protocolClient = new mqtt5.Mqtt5Client(builder.build());

    if (testOptions.startConnected) {
        let connectionSuccess = once(protocolClient, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);

        protocolClient.start();

        await connectionSuccess;
    }

    let rrOptions : mqtt_request_response.RequestResponseClientOptions = {
        maxRequestResponseSubscriptions : 6,
        maxStreamingSubscriptions : 2,
        operationTimeoutInSeconds : 60,
    }

    let rrClient = mqtt_request_response.RequestResponseClient.newFromMqtt5(protocolClient, rrOptions);

    return {
        protocolClient : protocolClient,
        client : rrClient,
    };
}

test('RequestResponseCreateDestroy', async () => {
//test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('RequestResponseCreateDestroy', async () => {
    let context = await createMqtt5TestingContext({
        startConnected : true
    });

    context.client.close();

    let stopped = once(context.protocolClient, mqtt5.Mqtt5Client.STOPPED);

    context.protocolClient.stop();
    await stopped;

    context.protocolClient.close();
});

test('RequestResponseSuccess', async () => {
//test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('RequestResponseCreateDestroy', async () => {
    io.enable_logging(io.LogLevel.TRACE);

    let context = await createMqtt5TestingContext({
        startConnected : true
    });

    let correlationToken = uuid();

    let requestOptions : mqtt_request_response.RequestResponseOperationOptions= {
        subscriptionTopicFilters: [ "$aws/things/NoSuchThing/shadow/name/Derp/get/+" ],
        responsePaths: [{
            topic: "$aws/things/NoSuchThing/shadow/name/Derp/get/accepted",
            correlationTokenJsonPath: "clientToken",
        }, {
            topic: "$aws/things/NoSuchThing/shadow/name/Derp/get/rejected",
            correlationTokenJsonPath: "clientToken",
        }],
        publishTopic: "$aws/things/NoSuchThing/shadow/name/Derp/get",
        payload: `{\"clientToken\":\"${correlationToken}\"}`,
        correlationToken: correlationToken,
    }

    let response = await context.client.submitRequest(requestOptions);
    expect(response.topic).toEqual("$aws/things/NoSuchThing/shadow/name/Derp/get/rejected");
    expect(response.payload.byteLength).toBeGreaterThan(0);

    context.client.close();

    let stopped = once(context.protocolClient, mqtt5.Mqtt5Client.STOPPED);

    context.protocolClient.stop();
    await stopped;

    context.protocolClient.close();
});
