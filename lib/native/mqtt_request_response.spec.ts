/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */


import * as test_env from "@test/test_env"
import * as mqtt311 from "./mqtt";
import * as mqtt5 from "./mqtt5";
import * as mqtt_request_response from "./mqtt_request_response";
import {v4 as uuid} from "uuid";
import {once} from "events";
import * as iot from "./iot";

jest.setTimeout(10000);

enum ProtocolVersion {
    Mqtt311,
    Mqtt5
}

interface TestingOptions {
    version: ProtocolVersion,
    timeoutSeconds?: number,
}

class TestingContext {

    client: mqtt_request_response.RequestResponseClient;

    private readonly init: () => Promise<void>;
    private readonly shutdown: () => Promise<void>;

    constructor(options: TestingOptions) {
        if (options.version == ProtocolVersion.Mqtt5) {
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

            let rrOptions : mqtt_request_response.RequestResponseClientOptions = {
                maxRequestResponseSubscriptions : 6,
                maxStreamingSubscriptions : 2,
                operationTimeoutInSeconds : options.timeoutSeconds ?? 60,
            }

            this.client = mqtt_request_response.RequestResponseClient.newFromMqtt5(protocolClient, rrOptions);

            let connected = once(protocolClient, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
            this.init = async () => {
                protocolClient.start();

                await connected;
            };

            let stopped = once(protocolClient, mqtt5.Mqtt5Client.STOPPED);
            this.shutdown = async () => {
                this.client.close();
                protocolClient.stop();
                await stopped;

                protocolClient.close();
            }
        } else {
            let builder = iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(test_env.AWS_IOT_ENV.MQTT5_RSA_CERT, test_env.AWS_IOT_ENV.MQTT5_RSA_KEY);
            builder.with_endpoint(test_env.AWS_IOT_ENV.MQTT5_HOST); // yes, 5 not 3
            builder.with_client_id(uuid());

            let client = new mqtt311.MqttClient();
            let connection = client.new_connection(builder.build());

            let rrOptions : mqtt_request_response.RequestResponseClientOptions = {
                maxRequestResponseSubscriptions : 6,
                maxStreamingSubscriptions : 2,
                operationTimeoutInSeconds : 60,
            }

            this.client = mqtt_request_response.RequestResponseClient.newFromMqtt311(connection, rrOptions);

            this.init = async () => {
                await connection.connect();
            };

            this.shutdown = async () => {
                this.client.close();
                await connection.disconnect();
            }
        }
    }

    async open() {
        await this.init();
    }

    async close() {
        await this.shutdown();
    }
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Create Destroy Mqtt5', async () => {
    let context = new TestingContext({
        version: ProtocolVersion.Mqtt5
    });
    await context.open();

    await context.close();
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Create Destroy Mqtt311', async () => {
    let context = new TestingContext({
        version: ProtocolVersion.Mqtt311
    });
    await context.open();

    await context.close();
});

function createRejectedGetNamedShadowRequest(addCorelationToken: boolean) : mqtt_request_response.RequestResponseOperationOptions {
    let requestOptions : mqtt_request_response.RequestResponseOperationOptions = {
        subscriptionTopicFilters: [ "$aws/things/NoSuchThing/shadow/name/Derp/get/+" ],
        responsePaths: [{
            topic: "$aws/things/NoSuchThing/shadow/name/Derp/get/accepted",
        }, {
            topic: "$aws/things/NoSuchThing/shadow/name/Derp/get/rejected",
        }],
        publishTopic: "$aws/things/NoSuchThing/shadow/name/Derp/get",
        payload: `{}`,
    }

    if (addCorelationToken) {
        let correlationToken = uuid();

        requestOptions.responsePaths = [{
            topic: "$aws/things/NoSuchThing/shadow/name/Derp/get/accepted",
            correlationTokenJsonPath: "clientToken",
        }, {
            topic: "$aws/things/NoSuchThing/shadow/name/Derp/get/rejected",
            correlationTokenJsonPath: "clientToken",
        }];
        requestOptions.payload = `{\"clientToken\":\"${correlationToken}\"}`;
        requestOptions.correlationToken = correlationToken;
    }

    return requestOptions;
}

async function do_get_named_shadow_success_rejected_test(version: ProtocolVersion, useCorrelationToken: boolean) : Promise<void> {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let requestOptions = createRejectedGetNamedShadowRequest(useCorrelationToken);

    let response = await context.client.submitRequest(requestOptions);
    expect(response.topic).toEqual(requestOptions.responsePaths[1].topic);
    expect(response.payload.byteLength).toBeGreaterThan(0);

    await context.close();
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('GetNamedShadow Success Rejected Mqtt5', async () => {
    await do_get_named_shadow_success_rejected_test(ProtocolVersion.Mqtt5, true);
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('GetNamedShadow Success Rejected Mqtt311', async () => {
    await do_get_named_shadow_success_rejected_test(ProtocolVersion.Mqtt311, true);
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('GetNamedShadow Success Rejected No CorrelationToken Mqtt5', async () => {
    await do_get_named_shadow_success_rejected_test(ProtocolVersion.Mqtt5, false);
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('GetNamedShadow Success Rejected No CorrelationToken Mqtt311', async () => {
    await do_get_named_shadow_success_rejected_test(ProtocolVersion.Mqtt311, false);
});

function createAcceptedUpdateNamedShadowRequest(addCorelationToken: boolean) : mqtt_request_response.RequestResponseOperationOptions {
    let requestOptions : mqtt_request_response.RequestResponseOperationOptions = {
        subscriptionTopicFilters: [
            "$aws/things/NoSuchThing/shadow/name/UpdateShadowCITest/update/accepted",
            "$aws/things/NoSuchThing/shadow/name/UpdateShadowCITest/update/rejected"
        ],
        responsePaths: [{
            topic: "$aws/things/NoSuchThing/shadow/name/UpdateShadowCITest/update/accepted",
        }, {
            topic: "$aws/things/NoSuchThing/shadow/name/UpdateShadowCITest/update/rejected",
        }],
        publishTopic: "$aws/things/NoSuchThing/shadow/name/UpdateShadowCITest/update",
        payload: ``,
    }

    let desired_state = `{\"magic\":\"${uuid()}\"}`;

    if (addCorelationToken) {
        let correlationToken = uuid();

        requestOptions.responsePaths[0].correlationTokenJsonPath = "clientToken";
        requestOptions.responsePaths[1].correlationTokenJsonPath = "clientToken";
        requestOptions.correlationToken = correlationToken;
        requestOptions.payload = `{\"clientToken\":\"${correlationToken}\",\"state\":{\"desired\":${desired_state}}}`;
    } else {
        requestOptions.payload = `{\"state\":{\"desired\":${desired_state}}}`;
    }

    return requestOptions;
}

async function do_update_named_shadow_success_accepted_test(version: ProtocolVersion, useCorrelationToken: boolean) : Promise<void> {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let requestOptions = createAcceptedUpdateNamedShadowRequest(useCorrelationToken);

    let response = await context.client.submitRequest(requestOptions);
    expect(response.topic).toEqual(requestOptions.responsePaths[0].topic);
    expect(response.payload.byteLength).toBeGreaterThan(0);

    await context.close();
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('UpdateNamedShadow Success Accepted Mqtt5', async () => {
    await do_update_named_shadow_success_accepted_test(ProtocolVersion.Mqtt5, true);
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('UpdateNamedShadow Success Accepted Mqtt311', async () => {
    await do_update_named_shadow_success_accepted_test(ProtocolVersion.Mqtt311, true);
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('UpdateNamedShadow Success Accepted No CorrelationToken Mqtt5', async () => {
    await do_update_named_shadow_success_accepted_test(ProtocolVersion.Mqtt5, false);
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('UpdateNamedShadow Success Accepted No CorrelationToken Mqtt311', async () => {
    await do_update_named_shadow_success_accepted_test(ProtocolVersion.Mqtt311, false);
});

async function do_get_named_shadow_failure_timeout_test(version: ProtocolVersion, useCorrelationToken: boolean) : Promise<void> {
    let context = new TestingContext({
        version: version,
        timeoutSeconds: 4,
    });

    await context.open();

    let requestOptions = createRejectedGetNamedShadowRequest(useCorrelationToken);
    requestOptions.publishTopic = "not/the/right/topic";

    await expect(context.client.submitRequest(requestOptions)).rejects.toBeDefined();

    await context.close();
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('GetNamedShadow Failure Timeout Mqtt5', async () => {
    await do_get_named_shadow_failure_timeout_test(ProtocolVersion.Mqtt5, true);
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('GetNamedShadow Failure Timeout Mqtt311', async () => {
    await do_update_named_shadow_success_accepted_test(ProtocolVersion.Mqtt311, true);
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('GetNamedShadow Failure Timeout No CorrelationToken Mqtt5', async () => {
    await do_update_named_shadow_success_accepted_test(ProtocolVersion.Mqtt5, false);
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('GetNamedShadow Failure Timeout No CorrelationToken Mqtt311', async () => {
    await do_update_named_shadow_success_accepted_test(ProtocolVersion.Mqtt311, false);
});
