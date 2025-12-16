/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as iot from "@awscrt/iot";
import * as mqtt5 from "@awscrt/mqtt5";
import * as test_env from "./test_env";
import {v4 as uuid} from "uuid";
import * as mqtt311 from "@awscrt/mqtt";
import * as mqtt_request_response from "@awscrt/mqtt_request_response";
import {once} from "events";
import {toUtf8} from "@aws-sdk/util-utf8-browser";
import {StreamingOperationOptions, SubscriptionStatusEvent} from "@awscrt/mqtt_request_response";
import {newLiftedPromise} from "../lib/common/promise";

export type ClientBuilderFactory5 = () => iot.AwsIotMqtt5ClientConfigBuilder;
export type ClientBuilderFactory311 = () => iot.AwsIotMqttConnectionConfigBuilder;

var testBuilderFactory5 : ClientBuilderFactory5 | undefined = undefined;
var testBuilderFactory311 : ClientBuilderFactory311 | undefined = undefined;

export function setClientBuilderFactories(factory5: ClientBuilderFactory5, factory311: ClientBuilderFactory311) {
    testBuilderFactory5 = factory5;
    testBuilderFactory311 = factory311;
}

export enum ProtocolVersion {
    Mqtt311,
    Mqtt5
}

export interface TestingOptions {
    version: ProtocolVersion,
    timeoutSeconds?: number,
    startOffline?: boolean,
    builder_mutator5?: (builder: iot.AwsIotMqtt5ClientConfigBuilder) => iot.AwsIotMqtt5ClientConfigBuilder,
    builder_mutator311?: (builder: iot.AwsIotMqttConnectionConfigBuilder) => iot.AwsIotMqttConnectionConfigBuilder,
}

export function build_protocol_client_mqtt5(builder: iot.AwsIotMqtt5ClientConfigBuilder, builder_mutator?: (builder: iot.AwsIotMqtt5ClientConfigBuilder) => iot.AwsIotMqtt5ClientConfigBuilder) : mqtt5.Mqtt5Client {
    builder.withConnectProperties({
        clientId : uuid(),
        keepAliveIntervalSeconds: 1200,
    });

    if (builder_mutator) {
        builder = builder_mutator(builder);
    }

    return new mqtt5.Mqtt5Client(builder.build());
}

export function build_protocol_client_mqtt311(builder: iot.AwsIotMqttConnectionConfigBuilder, builder_mutator?: (builder: iot.AwsIotMqttConnectionConfigBuilder) => iot.AwsIotMqttConnectionConfigBuilder) : mqtt311.MqttClientConnection {
    builder.with_endpoint(test_env.AWS_IOT_ENV.MQTT5_HOST); // yes, 5 not 3
    builder.with_client_id(uuid());

    if (builder_mutator) {
        builder = builder_mutator(builder);
    }

    let client = new mqtt311.MqttClient();
    return client.new_connection(builder.build());
}

export class TestingContext {

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

    async publishProtocolClient(topic: string, payload: ArrayBuffer) {
        if (this.mqtt5Client) {
            await this.mqtt5Client.publish({
                topicName: topic,
                qos: mqtt5.QoS.AtLeastOnce,
                payload: payload,
            });
        }

        if (this.mqtt311Client) {
            await this.mqtt311Client.publish(topic, payload, mqtt311.QoS.AtLeastOnce);
        }
    }

    constructor(options: TestingOptions) {
        if (options.version == ProtocolVersion.Mqtt5) {
            // @ts-ignore
            this.mqtt5Client = build_protocol_client_mqtt5(testBuilderFactory5(), options.builder_mutator5);

            let rrOptions : mqtt_request_response.RequestResponseClientOptions = {
                maxRequestResponseSubscriptions : 6,
                maxStreamingSubscriptions : 2,
                operationTimeoutInSeconds : options.timeoutSeconds ?? 60,
            }

            this.client = mqtt_request_response.RequestResponseClient.newFromMqtt5(this.mqtt5Client, rrOptions);
        } else {
            // @ts-ignore
            this.mqtt311Client = build_protocol_client_mqtt311(testBuilderFactory311(), options.builder_mutator311);

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

export function createRejectedGetNamedShadowRequest(addCorelationToken: boolean) : mqtt_request_response.RequestResponseOperationOptions {
    let requestOptions : mqtt_request_response.RequestResponseOperationOptions = {
        subscriptionTopicFilters: [ "$aws/things/NoSuchThing/shadow/name/Derp/get/+" ],
        responsePaths: [{
            topic: "$aws/things/NoSuchThing/shadow/name/Derp/get/accepted",
        }, {
            topic: "$aws/things/NoSuchThing/shadow/name/Derp/get/rejected",
        }],
        publishTopic: "$aws/things/NoSuchThing/shadow/name/Derp/get",
        payload: Buffer.from("{}", "utf-8"),
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
        requestOptions.payload = Buffer.from(`{\"clientToken\":\"${correlationToken}\"}`);
        requestOptions.correlationToken = correlationToken;
    }

    return requestOptions;
}

export async function do_get_named_shadow_success_rejected_test(version: ProtocolVersion, useCorrelationToken: boolean) : Promise<void> {
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

export function createAcceptedUpdateNamedShadowRequest(shadowPrefix: string, addCorelationToken: boolean) : mqtt_request_response.RequestResponseOperationOptions {
    let requestOptions : mqtt_request_response.RequestResponseOperationOptions = {
        subscriptionTopicFilters: [
            `$aws/things/NoSuchThing/shadow/name/UpdateShadowCI${shadowPrefix}/update/accepted`,
            `$aws/things/NoSuchThing/shadow/name/UpdateShadowCI${shadowPrefix}/update/rejected`
        ],
        responsePaths: [{
            topic: `$aws/things/NoSuchThing/shadow/name/UpdateShadowCI${shadowPrefix}/update/accepted`,
        }, {
            topic: `$aws/things/NoSuchThing/shadow/name/UpdateShadowCI${shadowPrefix}/update/rejected`,
        }],
        publishTopic: `$aws/things/NoSuchThing/shadow/name/UpdateShadowCI${shadowPrefix}/update`,
        payload: Buffer.from("", "utf-8"),
    }

    let desired_state = `{\"magic\":\"${uuid()}\"}`;

    if (addCorelationToken) {
        let correlationToken = uuid();

        requestOptions.responsePaths[0].correlationTokenJsonPath = "clientToken";
        requestOptions.responsePaths[1].correlationTokenJsonPath = "clientToken";
        requestOptions.correlationToken = correlationToken;
        requestOptions.payload = Buffer.from(`{\"clientToken\":\"${correlationToken}\",\"state\":{\"desired\":${desired_state}}}`);
    } else {
        requestOptions.payload = Buffer.from(`{\"state\":{\"desired\":${desired_state}}}`);
    }

    return requestOptions;
}

async function delete_update_shadow(context: TestingContext, shadowPrefix: string) {
    let desired_state = `{\"magic\":\"${uuid()}\"}`;
    let requestOptions : mqtt_request_response.RequestResponseOperationOptions = {
        subscriptionTopicFilters: [
            `$aws/things/NoSuchThing/shadow/name/UpdateShadowCI${shadowPrefix}/delete/+`
        ],
        responsePaths: [{
            topic: `$aws/things/NoSuchThing/shadow/name/UpdateShadowCI${shadowPrefix}/delete/accepted`,
        }, {
            topic: `$aws/things/NoSuchThing/shadow/name/UpdateShadowCI${shadowPrefix}/delete/rejected`,
        }],
        publishTopic: `$aws/things/NoSuchThing/shadow/name/UpdateShadowCI${shadowPrefix}/delete`,
        payload: Buffer.from(`{\"state\":{\"desired\":${desired_state}}}`),
    }

    await context.client.submitRequest(requestOptions);
}

export async function do_update_named_shadow_success_accepted_test(version: ProtocolVersion, useCorrelationToken: boolean) : Promise<void> {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let shadowPrefix = uuid();
    let requestOptions = createAcceptedUpdateNamedShadowRequest(shadowPrefix, useCorrelationToken);

    try {
        let response = await context.client.submitRequest(requestOptions);
        expect(response.topic).toEqual(requestOptions.responsePaths[0].topic);
        expect(response.payload.byteLength).toBeGreaterThan(0);
    } finally {
        await delete_update_shadow(context, shadowPrefix);
        await context.close();
    }
}

export async function do_get_named_shadow_failure_timeout_test(version: ProtocolVersion, useCorrelationToken: boolean) : Promise<void> {
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
    } catch (e) {
        let err = e as Error;
        expect(err.message).toContain("timeout");
    }

    await context.close();
}

export async function do_get_named_shadow_failure_on_close_test(version: ProtocolVersion, expectedFailureSubstring: string) : Promise<void> {
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
    } catch (e) {
        let err = e as Error;
        expect(err.message).toContain(expectedFailureSubstring);
    }

    await context.close();
}

export function do_client_creation_failure_test(version: ProtocolVersion, configMutator: (config: mqtt_request_response.RequestResponseClientOptions) => mqtt_request_response.RequestResponseClientOptions | undefined, expected_error_text: string) {
    if (version == ProtocolVersion.Mqtt311) {
        // @ts-ignore
        let protocolClient = build_protocol_client_mqtt311(testBuilderFactory311());
        let goodConfig : mqtt_request_response.RequestResponseClientOptions = {
            maxRequestResponseSubscriptions: 2,
            maxStreamingSubscriptions : 2,
            operationTimeoutInSeconds : 5,
        };
        let badConfig = configMutator(goodConfig);

        // @ts-ignore
        expect(() => {mqtt_request_response.RequestResponseClient.newFromMqtt311(protocolClient, badConfig)}).toThrow(expected_error_text);
    } else {
        // @ts-ignore
        let protocolClient = build_protocol_client_mqtt5(testBuilderFactory5());
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

export function create_bad_config_no_max_request_response_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        maxRequestResponseSubscriptions: 0,
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

export function create_bad_config_invalid_max_request_response_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        // @ts-ignore
        maxRequestResponseSubscriptions: "help",
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

export function create_bad_config_undefined_config(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return undefined
}

export function create_bad_config_undefined_max_request_response_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        // @ts-ignore
        maxRequestResponseSubscriptions: undefined,
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

export function create_bad_config_null_max_request_response_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        // @ts-ignore
        maxRequestResponseSubscriptions: null,
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

export function create_bad_config_missing_max_request_response_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    // @ts-ignore
    return {
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

export function create_bad_config_undefined_max_streaming_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        maxRequestResponseSubscriptions: config.maxRequestResponseSubscriptions,
        // @ts-ignore
        maxStreamingSubscriptions : undefined,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

export function create_bad_config_null_max_streaming_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        maxRequestResponseSubscriptions: config.maxRequestResponseSubscriptions,
        // @ts-ignore
        maxStreamingSubscriptions : null,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

export function create_bad_config_missing_max_streaming_subscriptions(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    // @ts-ignore
    return {
        maxRequestResponseSubscriptions : config.maxRequestResponseSubscriptions,
        operationTimeoutInSeconds : config.operationTimeoutInSeconds
    }
}

export function create_bad_config_invalid_operation_timeout(config: mqtt_request_response.RequestResponseClientOptions) : mqtt_request_response.RequestResponseClientOptions | undefined {
    return {
        maxRequestResponseSubscriptions : config.maxRequestResponseSubscriptions,
        maxStreamingSubscriptions : config.maxStreamingSubscriptions,
        // @ts-ignore
        operationTimeoutInSeconds : "no"
    }
}

export async function do_get_named_shadow_failure_invalid_test(useCorrelationToken: boolean, expected_error_substring: string, options_mutator: (options: mqtt_request_response.RequestResponseOperationOptions) => mqtt_request_response.RequestResponseOperationOptions) : Promise<void> {
    let context = new TestingContext({
        version: ProtocolVersion.Mqtt5
    });

    await context.open();

    let requestOptions = createRejectedGetNamedShadowRequest(useCorrelationToken);

    let responsePromise = context.client.submitRequest(options_mutator(requestOptions));
    try {
        await responsePromise;
        expect(false);
    } catch (err: any) {
        expect(err.message).toContain(expected_error_substring);
    }

    await context.close();
}

export async function do_streaming_operation_new_open_close_test(version: ProtocolVersion) {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let streaming_options : StreamingOperationOptions = {
        subscriptionTopicFilter : "$aws/things/NoSuchThing/shadow/name/UpdateShadowCITest/update/delta"
    }

    let stream = context.client.createStream(streaming_options);
    stream.open();
    stream.close();

    await context.close();
}

export async function do_streaming_operation_incoming_publish_test(version: ProtocolVersion) {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let topic_filter = `not/a/real/shadow/${uuid()}`;
    let streaming_options : StreamingOperationOptions = {
        subscriptionTopicFilter : topic_filter,
    }

    let stream = context.client.createStream(streaming_options);
    let publish_received_promise = once(stream, mqtt_request_response.StreamingOperationBase.INCOMING_PUBLISH);
    let initialSubscriptionComplete = once(stream, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    stream.open();

    await initialSubscriptionComplete;

    let payload : Buffer = Buffer.from("IncomingPublish", "utf-8");
    await context.publishProtocolClient(topic_filter, payload);

    let incoming_publish : mqtt_request_response.IncomingPublishEvent = (await publish_received_promise)[0];

    expect(incoming_publish.topic).toEqual(topic_filter);
    expect(Buffer.from(incoming_publish.payload as ArrayBuffer)).toEqual(payload);

    stream.close();

    await context.close();
}

export async function do_streaming_operation_subscription_events_test(options: TestingOptions) {
    let context = new TestingContext(options);

    await context.open();

    let topic_filter = `not/a/real/shadow/${uuid()}`;
    let streaming_options : StreamingOperationOptions = {
        subscriptionTopicFilter : topic_filter,
    }

    let events : Array<SubscriptionStatusEvent> = [];
    let allEventsPromise = newLiftedPromise<void>();
    let stream = context.client.createStream(streaming_options);
    stream.addListener("subscriptionStatus", (eventData) => {
        events.push(eventData);

        if (events.length === 3) {
            allEventsPromise.resolve();
        }
    });

    let initialSubscriptionComplete = once(stream, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    stream.open();

    await initialSubscriptionComplete;

    let protocolClient = context.mqtt5Client;
    if (protocolClient) {
        let stopped = once(protocolClient, mqtt5.Mqtt5Client.STOPPED);
        protocolClient.stop();
        await stopped;

        let started = once(protocolClient, mqtt5.Mqtt5Client.CONNECTION_SUCCESS);
        protocolClient.start();
        await started;
    }

    await allEventsPromise.promise;

    expect(events[0].type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionEstablished);
    expect(events[0].error).toBeUndefined();
    expect(events[1].type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionLost);
    expect(events[1].error).toBeUndefined();
    expect(events[2].type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionEstablished);
    expect(events[2].error).toBeUndefined();

    stream.close();

    await context.close();
}

export async function do_invalid_streaming_operation_config_test(config: StreamingOperationOptions, expected_error: string) {
    let context = new TestingContext({
        version: ProtocolVersion.Mqtt5
    });

    await context.open();

    expect(() => {
        // @ts-ignore
        context.client.createStream(config)
    }).toThrow(expected_error);

    await context.close();
}
