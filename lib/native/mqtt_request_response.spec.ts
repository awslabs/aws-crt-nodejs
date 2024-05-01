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
import {toUtf8} from "@aws-sdk/util-utf8-browser";

jest.setTimeout(10000);

enum ProtocolVersion {
    Mqtt311,
    Mqtt5
}

interface TestingOptions {
    version: ProtocolVersion,
    timeoutSeconds?: number,
    startOffline?: boolean,
}

function build_protocol_client_mqtt5() : mqtt5.Mqtt5Client {
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(
        test_env.AWS_IOT_ENV.MQTT5_HOST,
        test_env.AWS_IOT_ENV.MQTT5_RSA_CERT,
        test_env.AWS_IOT_ENV.MQTT5_RSA_KEY
    );

    builder.withConnectProperties({
        clientId : uuid(),
        keepAliveIntervalSeconds: 1200,
    });

    return new mqtt5.Mqtt5Client(builder.build());
}

function build_protocol_client_mqtt311() : mqtt311.MqttClientConnection {
    let builder = iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(test_env.AWS_IOT_ENV.MQTT5_RSA_CERT, test_env.AWS_IOT_ENV.MQTT5_RSA_KEY);
    builder.with_endpoint(test_env.AWS_IOT_ENV.MQTT5_HOST); // yes, 5 not 3
    builder.with_client_id(uuid());

    let client = new mqtt311.MqttClient();
    return client.new_connection(builder.build());
}

class TestingContext {

    mqtt311Client?: mqtt311.MqttClientConnection;
    mqtt5Client?: mqtt5.Mqtt5Client;

    client: mqtt_request_response.RequestResponseClient;

    private protocolStarted : boolean = false;

    async startProtocolClient() {
        if (!this.protocolStarted) {
            this.protocolStarted = true;
            if (this.mqtt5Client) {
                let connected = once(this.mqtt5Client, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
                this.mqtt5Client.start();

                await connected;
            }

            if (this.mqtt311Client) {
                await this.mqtt311Client.connect();
            }
        }
    }

    async stopProtocolClient() {
        if (this.protocolStarted) {
            this.protocolStarted = false;
            if (this.mqtt5Client) {
                let stopped = once(this.mqtt5Client, mqtt5.Mqtt5Client.STOPPED);
                this.mqtt5Client.stop();
                await stopped;

                this.mqtt5Client.close();
            }

            if (this.mqtt311Client) {
                await this.mqtt311Client.disconnect();
            }
        }
    }

    constructor(options: TestingOptions) {
        if (options.version == ProtocolVersion.Mqtt5) {
            this.mqtt5Client = build_protocol_client_mqtt5();

            let rrOptions : mqtt_request_response.RequestResponseClientOptions = {
                maxRequestResponseSubscriptions : 6,
                maxStreamingSubscriptions : 2,
                operationTimeoutInSeconds : options.timeoutSeconds ?? 60,
            }

            this.client = mqtt_request_response.RequestResponseClient.newFromMqtt5(this.mqtt5Client, rrOptions);
        } else {
            this.mqtt311Client = build_protocol_client_mqtt311();

            let rrOptions : mqtt_request_response.RequestResponseClientOptions = {
                maxRequestResponseSubscriptions : 6,
                maxStreamingSubscriptions : 2,
                operationTimeoutInSeconds : options.timeoutSeconds ?? 60,
            }

            this.client = mqtt_request_response.RequestResponseClient.newFromMqtt311(this.mqtt311Client, rrOptions);
        }
    }

    async open() {
        await this.startProtocolClient();
    }

    async close() {
        this.client.close();
        await this.stopProtocolClient();
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

    let response_string = toUtf8(new Uint8Array(response.payload));
    expect(response_string).toContain("No shadow exists with name");

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

    try {
        await context.client.submitRequest(requestOptions);
        expect(false);
    } catch (e: any) {
        expect(e).toContain("timeout");
    }

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

async function do_get_named_shadow_failure_on_close_test(version: ProtocolVersion) : Promise<void> {
    let context = new TestingContext({
        version: version,
    });

    await context.open();

    let requestOptions = createRejectedGetNamedShadowRequest(true);

    try {
        let resultPromise = context.client.submitRequest(requestOptions);
        context.client.close();
        await resultPromise;
        expect(false);
    } catch (e: any) {
        expect(e).toContain("timeout");
    }

    await context.close();
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('GetNamedShadow Failure On Close Mqtt5', async () => {
    await do_get_named_shadow_failure_on_close_test(ProtocolVersion.Mqtt5);
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('GetNamedShadow Failure On Close Mqtt311', async () => {
    await do_get_named_shadow_failure_on_close_test(ProtocolVersion.Mqtt311);
});

function do_client_creation_failure_test(version: ProtocolVersion, configMutator: (config: mqtt_request_response.RequestResponseClientOptions) => mqtt_request_response.RequestResponseClientOptions | undefined, expected_error_text: string) {
    if (version == ProtocolVersion.Mqtt311) {
        let protocolClient = build_protocol_client_mqtt311();
        let goodConfig : mqtt_request_response.RequestResponseClientOptions = {
            maxRequestResponseSubscriptions: 2,
            maxStreamingSubscriptions : 2,
            operationTimeoutInSeconds : 5,
        };
        let badConfig = configMutator(goodConfig);

        // @ts-ignore
        expect(() => {mqtt_request_response.RequestResponseClient.newFromMqtt311(protocolClient, badConfig)}).toThrow(expected_error_text);
    } else {
        let protocolClient = build_protocol_client_mqtt5();
        let goodConfig : mqtt_request_response.RequestResponseClientOptions = {
            maxRequestResponseSubscriptions: 2,
            maxStreamingSubscriptions : 2,
            operationTimeoutInSeconds : 5,
        };
        let badConfig = configMutator(goodConfig);

        // @ts-ignore
        expect(() => {mqtt_request_response.RequestResponseClient.newFromMqtt5(protocolClient, badConfig)}).toThrow(expected_error_text);
    }
}

function create_bad_config_no_max_request_response_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        maxRequestResponseSubscriptions: 0,
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure zero max request response subscriptions mqtt5', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt5, create_bad_config_no_max_request_response_subscriptions, "An invalid argument was passed to a function");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure zero max request response subscriptions mqtt311', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt311, create_bad_config_no_max_request_response_subscriptions, "An invalid argument was passed to a function");
});

function create_bad_config_invalid_max_request_response_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        // @ts-ignore
        maxRequestResponseSubscriptions: "help",
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure invalid max request response subscriptions mqtt5', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt5, create_bad_config_invalid_max_request_response_subscriptions, "invalid configuration options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure invalid max request response subscriptions mqtt311', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt311, create_bad_config_invalid_max_request_response_subscriptions, "invalid configuration options");
});

function create_bad_config_undefined_config(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return undefined
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure undefined config mqtt5', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt5, create_bad_config_undefined_config, "required configuration parameter is null");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure undefined config mqtt311', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt311, create_bad_config_undefined_config, "required configuration parameter is null");
});

function create_bad_config_undefined_max_request_response_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        // @ts-ignore
        maxRequestResponseSubscriptions: undefined,
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure undefined max request response subscriptions mqtt5', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt5, create_bad_config_undefined_max_request_response_subscriptions, "invalid configuration options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure undefined max request response subscriptions mqtt311', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt311, create_bad_config_undefined_max_request_response_subscriptions, "invalid configuration options");
});

function create_bad_config_null_max_request_response_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        // @ts-ignore
        maxRequestResponseSubscriptions: null,
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure null max request response subscriptions mqtt5', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt5, create_bad_config_null_max_request_response_subscriptions, "invalid configuration options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure null max request response subscriptions mqtt311', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt311, create_bad_config_null_max_request_response_subscriptions, "invalid configuration options");
});

function create_bad_config_missing_max_request_response_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    // @ts-ignore
    return {
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure missing max request response subscriptions mqtt5', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt5, create_bad_config_missing_max_request_response_subscriptions, "invalid configuration options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure missing max request response subscriptions mqtt311', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt311, create_bad_config_missing_max_request_response_subscriptions, "invalid configuration options");
});

function create_bad_config_undefined_max_streaming_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        maxRequestResponseSubscriptions: config.maxRequestResponseSubscriptions,
        // @ts-ignore
        maxStreamingSubscriptions : undefined,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure undefined max streaming subscriptions mqtt5', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt5, create_bad_config_undefined_max_streaming_subscriptions, "invalid configuration options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure undefined max streaming subscriptions mqtt311', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt311, create_bad_config_undefined_max_streaming_subscriptions, "invalid configuration options");
});

function create_bad_config_null_max_streaming_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        maxRequestResponseSubscriptions: config.maxRequestResponseSubscriptions,
        // @ts-ignore
        maxStreamingSubscriptions : null,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure null max streaming subscriptions mqtt5', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt5, create_bad_config_null_max_streaming_subscriptions, "invalid configuration options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure null max streaming subscriptions mqtt311', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt311, create_bad_config_null_max_streaming_subscriptions, "invalid configuration options");
});

function create_bad_config_missing_max_streaming_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    // @ts-ignore
    return {
        maxRequestResponseSubscriptions : config.maxRequestResponseSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure missing max streaming subscriptions mqtt5', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt5, create_bad_config_missing_max_streaming_subscriptions, "invalid configuration options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure missing max streaming subscriptions mqtt311', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt311, create_bad_config_missing_max_streaming_subscriptions, "invalid configuration options");
});

function create_bad_config_invalid_operation_timeout(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        maxRequestResponseSubscriptions : config.maxRequestResponseSubscriptions,
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        // @ts-ignore
        operationTimeoutInSeconds : "no"
    }
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure missing max streaming subscriptions mqtt5', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt5, create_bad_config_invalid_operation_timeout, "invalid configuration options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_mtls_rsa())('Client creation failure missing max streaming subscriptions mqtt311', async() => {
    do_client_creation_failure_test(ProtocolVersion.Mqtt311, create_bad_config_invalid_operation_timeout, "invalid configuration options");
});

test('Client creation failure null protocol client mqtt311', async() => {
    let config : mqtt_request_response.RequestResponseClientOptions = {
        maxRequestResponseSubscriptions: 2,
        maxStreamingSubscriptions : 2,
        operationTimeoutInSeconds : 5,
    };

    // @ts-ignore
    expect(() => {mqtt_request_response.RequestResponseClient.newFromMqtt311(null, config)}).toThrow("protocol client is null");
});

test('Client creation failure null protocol client mqtt5', async() => {
    let config : mqtt_request_response.RequestResponseClientOptions = {
        maxRequestResponseSubscriptions: 2,
        maxStreamingSubscriptions : 2,
        operationTimeoutInSeconds : 5,
    };

    // @ts-ignore
    expect(() => {mqtt_request_response.RequestResponseClient.newFromMqtt5(null, config)}).toThrow("protocol client is null");
});
