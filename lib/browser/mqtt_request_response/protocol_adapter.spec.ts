/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */


import * as mqtt311 from "../mqtt";
import * as mqtt5 from "../mqtt5";
import * as protocol_adapter from "./protocol_adapter";
import * as aws_iot_mqtt311 from "../aws_iot";
import * as aws_iot_mqtt5 from "../aws_iot_mqtt5";
import {v4 as uuid} from "uuid";
import * as test_utils from "../../../test/mqtt5";
import * as auth from "../auth";
import {once} from "events";

jest.setTimeout(10000);

enum ProtocolVersion {
    Mqtt311,
    Mqtt5
}

interface TestingOptions {
    version: ProtocolVersion,
    builder_mutator5?: (builder: aws_iot_mqtt5.AwsIotMqtt5ClientConfigBuilder) => aws_iot_mqtt5.AwsIotMqtt5ClientConfigBuilder,
    builder_mutator311?: (builder: aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder) => aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder,
}

function build_protocol_client_mqtt5(builder_mutator?: (builder: aws_iot_mqtt5.AwsIotMqtt5ClientConfigBuilder) => aws_iot_mqtt5.AwsIotMqtt5ClientConfigBuilder) : mqtt5.Mqtt5Client {
    let provider: auth.StaticCredentialProvider = new auth.StaticCredentialProvider({
        aws_access_id: test_utils.ClientEnvironmentalConfig.AWS_IOT_ACCESS_KEY_ID,
        aws_secret_key: test_utils.ClientEnvironmentalConfig.AWS_IOT_SECRET_ACCESS_KEY,
        aws_region: "us-east-1"
    });

    let builder = aws_iot_mqtt5.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST,
        {
            credentialsProvider: provider,
            // the region extraction logic does not work for gamma endpoint formats so pass in region manually
            region: "us-east-1"
        }
    );

    builder.withConnectProperties({
        keepAliveIntervalSeconds: 1200,
        clientId: `client-${uuid()}`
    });

    if (builder_mutator) {
        builder = builder_mutator(builder);
    }

    return new mqtt5.Mqtt5Client(builder.build());
}

function build_protocol_client_mqtt311(builder_mutator?: (builder: aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder) => aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder) : mqtt311.MqttClientConnection {
    let provider: auth.StaticCredentialProvider = new auth.StaticCredentialProvider({
        aws_access_id: test_utils.ClientEnvironmentalConfig.AWS_IOT_ACCESS_KEY_ID,
        aws_secret_key: test_utils.ClientEnvironmentalConfig.AWS_IOT_SECRET_ACCESS_KEY,
        aws_region: "us-east-1"
    });

    let builder = aws_iot_mqtt311.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket();
    builder.with_credential_provider(provider);
    builder.with_endpoint(test_utils.ClientEnvironmentalConfig.AWS_IOT_HOST);
    builder.with_client_id(uuid());

    if (builder_mutator) {
        builder = builder_mutator(builder);
    }

    let client = new mqtt311.MqttClient();

    if (builder_mutator) {
        builder = builder_mutator(builder);
    }

    let connection = client.new_connection(builder.build());
    connection.on('error', (_) => {});

    return connection;
}

class TestingContext {

    mqtt311Client?: mqtt311.MqttClientConnection;
    mqtt5Client?: mqtt5.Mqtt5Client;

    adapter: protocol_adapter.ProtocolClientAdapter;

    private protocolStarted : boolean = false;

    constructor(options: TestingOptions) {
        if (options.version == ProtocolVersion.Mqtt5) {
            this.mqtt5Client = build_protocol_client_mqtt5(options.builder_mutator5);
            this.adapter = protocol_adapter.ProtocolClientAdapter.newFrom5(this.mqtt5Client);
        } else {
            this.mqtt311Client = build_protocol_client_mqtt311(options.builder_mutator311);
            this.adapter = protocol_adapter.ProtocolClientAdapter.newFrom311(this.mqtt311Client);
        }
    }

    async open() {
        await this.startProtocolClient();
    }

    async close() {
        this.adapter.close();
        await this.stopProtocolClient();
    }

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
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Create/Destroy - Mqtt5', async () => {
    let context = new TestingContext({
        version: ProtocolVersion.Mqtt5
    });
    await context.open();

    await context.close();
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Create/Destroy - Mqtt311', async () => {
    let context = new TestingContext({
        version: ProtocolVersion.Mqtt311
    });
    await context.open();

    await context.close();
});

async function do_subscribe_success_test(version: ProtocolVersion) : Promise<void> {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let subscribe_event_promise = once(context.adapter, protocol_adapter.ProtocolClientAdapter.SUBSCRIBE_COMPLETION);

    context.adapter.subscribe({
        topicFilter: "a/b/c",
        timeoutInSeconds: 30
    });

    let subscribe_event = (await subscribe_event_promise)[0];
    expect(subscribe_event.err).toBeUndefined();
    expect(subscribe_event.topicFilter).toEqual("a/b/c");

    await context.close();
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Subscribe Success - Mqtt5', async () => {
    await do_subscribe_success_test(ProtocolVersion.Mqtt5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Subscribe Success - Mqtt311', async () => {
    await do_subscribe_success_test(ProtocolVersion.Mqtt311);
});

async function do_subscribe_timeout_test(version: ProtocolVersion) : Promise<void> {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let subscribe_event_promise = once(context.adapter, protocol_adapter.ProtocolClientAdapter.SUBSCRIBE_COMPLETION);

    context.adapter.subscribe({
        topicFilter: "a/b/c",
        timeoutInSeconds: .001 // sketchy but no other reliable timeout possibilities are available
    });

    let subscribe_event : protocol_adapter.SubscribeCompletionEvent = (await subscribe_event_promise)[0];
    expect(subscribe_event.topicFilter).toEqual("a/b/c");
    expect(subscribe_event.err).toBeDefined();

    // @ts-ignore
    let errorAsString = subscribe_event.err.toString();
    expect(errorAsString).toContain("Timeout");

    await context.close();
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Subscribe Timeout - Mqtt5', async () => {
    await do_subscribe_timeout_test(ProtocolVersion.Mqtt5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Subscribe Timeout - Mqtt311', async () => {
    await do_subscribe_timeout_test(ProtocolVersion.Mqtt311);
});

async function do_subscribe_failure_test(version: ProtocolVersion) : Promise<void> {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let subscribe_event_promise = once(context.adapter, protocol_adapter.ProtocolClientAdapter.SUBSCRIBE_COMPLETION);
    let bad_topic_filter = "b".repeat(512);
    context.adapter.subscribe({
        topicFilter: bad_topic_filter,
        timeoutInSeconds: 30
    });

    let subscribe_event : protocol_adapter.SubscribeCompletionEvent = (await subscribe_event_promise)[0];
    expect(subscribe_event.topicFilter).toEqual(bad_topic_filter);

    // On 5 this fails with a suback reason code, on 311 the connection gets closed by IoT Core
    expect(subscribe_event.err).toBeDefined();

    await context.close();
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Subscribe Failure - Mqtt5', async () => {
    await do_subscribe_failure_test(ProtocolVersion.Mqtt5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Subscribe Failure - Mqtt311', async () => {
    await do_subscribe_failure_test(ProtocolVersion.Mqtt311);
});

async function do_unsubscribe_success_test(version: ProtocolVersion) : Promise<void> {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let unsubscribe_event_promise = once(context.adapter, protocol_adapter.ProtocolClientAdapter.UNSUBSCRIBE_COMPLETION);

    context.adapter.unsubscribe({
        topicFilter: "a/b/c",
        timeoutInSeconds: 30
    });

    let unsubscribe_event = (await unsubscribe_event_promise)[0];
    expect(unsubscribe_event.err).toBeUndefined();
    expect(unsubscribe_event.topicFilter).toEqual("a/b/c");

    await context.close();
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Unsubscribe Success - Mqtt5', async () => {
    await do_unsubscribe_success_test(ProtocolVersion.Mqtt5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Unsubscribe Success - Mqtt311', async () => {
    await do_unsubscribe_success_test(ProtocolVersion.Mqtt311);
});

async function do_unsubscribe_timeout_test(version: ProtocolVersion) : Promise<void> {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let unsubscribe_event_promise = once(context.adapter, protocol_adapter.ProtocolClientAdapter.UNSUBSCRIBE_COMPLETION);

    context.adapter.unsubscribe({
        topicFilter: "a/b/c",
        timeoutInSeconds: .001 // sketchy but no other reliable timeout possibilities are available
    });

    let unsubscribe_event = (await unsubscribe_event_promise)[0];
    expect(unsubscribe_event.topicFilter).toEqual("a/b/c");
    expect(unsubscribe_event.err).toBeDefined();

    // @ts-ignore
    let errorAsString = unsubscribe_event.err.toString();
    expect(errorAsString).toContain("Timeout");

    await context.close();
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Unsubscribe Timeout - Mqtt5', async () => {
    await do_unsubscribe_timeout_test(ProtocolVersion.Mqtt5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Unsubscribe Timeout - Mqtt311', async () => {
    await do_unsubscribe_timeout_test(ProtocolVersion.Mqtt311);
});

async function do_unsubscribe_failure_test(version: ProtocolVersion) : Promise<void> {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let unsubscribe_event_promise = once(context.adapter, protocol_adapter.ProtocolClientAdapter.UNSUBSCRIBE_COMPLETION);
    context.adapter.unsubscribe({
        topicFilter: "#/b#/#",
        timeoutInSeconds: 30
    });

    let unsubscribe_event = (await unsubscribe_event_promise)[0];
    expect(unsubscribe_event.topicFilter).toEqual("#/b#/#");

    // On 5 this fails with an unsuback reason code, on 311 the connection gets closed by IoT Core
    expect(unsubscribe_event.err).toBeDefined();

    await context.open();
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Unsubscribe Failure - Mqtt5', async () => {
    await do_unsubscribe_failure_test(ProtocolVersion.Mqtt5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Unsubscribe Failure - Mqtt311', async () => {
    await do_unsubscribe_failure_test(ProtocolVersion.Mqtt311);
});

async function do_get_connection_state_test(version: ProtocolVersion) {
    let context = new TestingContext({
        version: version
    });

    expect(context.adapter.getConnectionState()).toEqual(protocol_adapter.ConnectionState.DISCONNECTED);

    await context.open();

    expect(context.adapter.getConnectionState()).toEqual(protocol_adapter.ConnectionState.CONNECTED);

    await context.close();
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter getConnectionState - Mqtt5', async () => {
    await do_get_connection_state_test(ProtocolVersion.Mqtt5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter getConnectionState - Mqtt311', async () => {
    await do_get_connection_state_test(ProtocolVersion.Mqtt311);
});

async function do_connection_event_test(version: ProtocolVersion) {
    let context = new TestingContext({
        version: version
    });

    let event1_promise = once(context.adapter, protocol_adapter.ProtocolClientAdapter.CONNECTION_STATUS);

    await context.open();

    let connection_event1 : protocol_adapter.ConnectionStatusEvent = (await event1_promise)[0];
    expect(connection_event1.status).toEqual(protocol_adapter.ConnectionState.CONNECTED);
    expect(connection_event1.joinedSession).toEqual(false);

    let event2_promise = once(context.adapter, protocol_adapter.ProtocolClientAdapter.CONNECTION_STATUS);

    await context.stopProtocolClient();

    let connection_event2 : protocol_adapter.ConnectionStatusEvent = (await event2_promise)[0];
    expect(connection_event2.status).toEqual(protocol_adapter.ConnectionState.DISCONNECTED);
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Connection Event Sequence - Mqtt5', async () => {
    await do_connection_event_test(ProtocolVersion.Mqtt5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Connection Event Sequence - Mqtt311', async () => {
    await do_connection_event_test(ProtocolVersion.Mqtt311);
});

async function do_publish_success_test(version: ProtocolVersion) : Promise<void> {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let publish_event_promise = once(context.adapter, protocol_adapter.ProtocolClientAdapter.PUBLISH_COMPLETION);

    var encoder = new TextEncoder();
    let payload: ArrayBuffer = encoder.encode("A payload");
    let completionData = 42;

    context.adapter.publish({
        topic: "a/b/c",
        payload: payload,
        timeoutInSeconds: 30,
        completionData: completionData,
    });

    let publish_event : protocol_adapter.PublishCompletionEvent = (await publish_event_promise)[0];
    expect(publish_event.err).toBeUndefined();
    expect(publish_event.completionData).toEqual(completionData);

    await context.close();
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Publish Success - Mqtt5', async () => {
    await do_publish_success_test(ProtocolVersion.Mqtt5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Publish Success - Mqtt311', async () => {
    await do_publish_success_test(ProtocolVersion.Mqtt311);
});

async function do_publish_timeout_test(version: ProtocolVersion) : Promise<void> {
    let context = new TestingContext({
        version: version
    });

    await context.open();

    let publish_event_promise = once(context.adapter, protocol_adapter.ProtocolClientAdapter.PUBLISH_COMPLETION);

    var encoder = new TextEncoder();
    let payload: ArrayBuffer = encoder.encode("A payload");
    let completionData = 42;

    context.adapter.publish({
        topic: "a/b/c",
        payload: payload,
        timeoutInSeconds: .001,
        completionData: completionData,
    });

    let publish_event : protocol_adapter.PublishCompletionEvent = (await publish_event_promise)[0];
    expect(publish_event.completionData).toEqual(completionData);
    expect(publish_event.err).toBeDefined();

    // @ts-ignore
    let errorAsString = publish_event.err.toString();
    expect(errorAsString).toContain("Timeout");

    await context.close();
}

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Publish Timeout - Mqtt5', async () => {
    await do_publish_timeout_test(ProtocolVersion.Mqtt5);
});

test_utils.conditional_test(test_utils.ClientEnvironmentalConfig.hasIoTCoreEnvironmentCred())('Protocol Adapter Publish Timeout - Mqtt311', async () => {
    await do_publish_timeout_test(ProtocolVersion.Mqtt311);
});

// There's no straightforward, reliable way to generate publish failures against IoT Core, so no failure tests
