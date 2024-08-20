/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as protocol_adapter_mock from "./mqtt_request_response/protocol_adapter_mock";
import * as mqtt_request_response from "./mqtt_request_response";
import * as protocol_adapter from "./mqtt_request_response/protocol_adapter";
import {MockProtocolAdapter} from "./mqtt_request_response/protocol_adapter_mock";

jest.setTimeout(1000000);

interface TestContextOptions {
    clientOptions?: mqtt_request_response.RequestResponseClientOptions,
    adapterOptions?: protocol_adapter_mock.MockProtocolAdapterOptions
}

interface TestContext {
    client : mqtt_request_response.RequestResponseClient,
    adapter: protocol_adapter_mock.MockProtocolAdapter
}

function createTestContext(options? : TestContextOptions) : TestContext {
    let adapter = new protocol_adapter_mock.MockProtocolAdapter(options?.adapterOptions);

    var clientOptions : mqtt_request_response.RequestResponseClientOptions = options?.clientOptions ?? {
        maxRequestResponseSubscriptions: 4,
        maxStreamingSubscriptions: 2,
        operationTimeoutInSeconds: 600,
    };

    // @ts-ignore
    let client = new mqtt_request_response.RequestResponseClient(adapter, clientOptions);

    return {
        client: client,
        adapter: adapter
    };
}

function cleanupTestContext(context: TestContext) {
    context.client.close();
}

test('create/destroy', async () => {
    let context = createTestContext();
    cleanupTestContext(context);
});

async function doRequestResponseValidationFailureTest(request: mqtt_request_response.RequestResponseOperationOptions, errorSubstring: string) {
    let context = createTestContext();

    context.adapter.connect();

    try {
        await context.client.submitRequest(request);
        expect(false);
    } catch (err: any) {
        expect(err.message).toContain(errorSubstring);
    }

    cleanupTestContext(context);
}

const DEFAULT_ACCEPTED_PATH = "a/b/accepted";
const DEFAULT_REJECTED_PATH = "a/b/rejected";
const DEFAULT_CORRELATION_TOKEN_PATH = "token";
const DEFAULT_CORRELATION_TOKEN = "abcd";

function makeGoodRequest() : mqtt_request_response.RequestResponseOperationOptions {
    var encoder = new TextEncoder();

    return {
        subscriptionTopicFilters : new Array<string>("a/b/+"),
        responsePaths: new Array<mqtt_request_response.ResponsePath>({
                topic: DEFAULT_ACCEPTED_PATH,
                correlationTokenJsonPath: DEFAULT_CORRELATION_TOKEN_PATH
            }, {
                topic: DEFAULT_REJECTED_PATH,
                correlationTokenJsonPath: DEFAULT_CORRELATION_TOKEN_PATH
            }),
        publishTopic: "a/b/derp",
        payload: encoder.encode(JSON.stringify({
            token: DEFAULT_CORRELATION_TOKEN
        })),
        correlationToken: DEFAULT_CORRELATION_TOKEN
    };
}

test('request-response validation failure - null options', async () => {
    // @ts-ignore
    let requestOptions : mqtt_request_response.RequestResponseOperationOptions = null;

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - null response paths', async () => {
    let requestOptions = makeGoodRequest();

    // @ts-ignore
    requestOptions.responsePaths = null;

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - no response paths', async () => {
    let requestOptions = makeGoodRequest();

    requestOptions.responsePaths = new Array<mqtt_request_response.ResponsePath>();

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - null response topic', async () => {
    let requestOptions = makeGoodRequest();

    // @ts-ignore
    requestOptions.responsePaths[0].topic = null;

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - response topic bad type', async () => {
    let requestOptions = makeGoodRequest();

    // @ts-ignore
    requestOptions.responsePaths[0].topic = 5;

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - empty response topic', async () => {
    let requestOptions = makeGoodRequest();

    requestOptions.responsePaths[0].topic = "";

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - invalid response topic', async () => {
    let requestOptions = makeGoodRequest();

    requestOptions.responsePaths[0].topic = "a/#/b";

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - correlation token path bad type', async () => {
    let requestOptions = makeGoodRequest();

    // @ts-ignore
    requestOptions.responsePaths[0].correlationTokenJsonPath = 5;

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - null publish topic', async () => {
    let requestOptions = makeGoodRequest();

    // @ts-ignore
    requestOptions.publishTopic = null;

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - publish topic bad type', async () => {
    let requestOptions = makeGoodRequest();

    // @ts-ignore
    requestOptions.publishTopic = 5;

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - empty publish topic', async () => {
    let requestOptions = makeGoodRequest();

    requestOptions.publishTopic = "";

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - invalid publish topic', async () => {
    let requestOptions = makeGoodRequest();

    requestOptions.publishTopic = "a/+";

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - null subscription topic filters', async () => {
    let requestOptions = makeGoodRequest();

    // @ts-ignore
    requestOptions.subscriptionTopicFilters = null;

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - no subscription topic filters', async () => {
    let requestOptions = makeGoodRequest();

    requestOptions.subscriptionTopicFilters = new Array<string>();

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - null subscription topic filter', async () => {
    let requestOptions = makeGoodRequest();

    // @ts-ignore
    requestOptions.subscriptionTopicFilters[0] = null;

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - subscription topic filter bad type', async () => {
    let requestOptions = makeGoodRequest();

    // @ts-ignore
    requestOptions.subscriptionTopicFilters[0] = 5;

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - empty subscription topic filter', async () => {
    let requestOptions = makeGoodRequest();

    requestOptions.subscriptionTopicFilters[0] = "";

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - invalid subscription topic filter', async () => {
    let requestOptions = makeGoodRequest();

    requestOptions.subscriptionTopicFilters[0] = "#/a/b";

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - null payload', async () => {
    let requestOptions = makeGoodRequest();

    // @ts-ignore
    requestOptions.payload = null;

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response validation failure - empty payload', async () => {
    let requestOptions = makeGoodRequest();

    let encoder = new TextEncoder();
    requestOptions.payload = encoder.encode("");

    await doRequestResponseValidationFailureTest(requestOptions, "Invalid request options");
});

test('request-response failure - interrupted by close', async () => {
    let context = createTestContext();

    context.adapter.connect();

    let responsePromise = context.client.submitRequest(makeGoodRequest());

    context.client.close();

    try {
        await responsePromise;
        expect(false);
    } catch (err: any) {
        expect(err.message).toContain("client closed");
    }

    cleanupTestContext(context);
});

test('request-response failure - client closed', async () => {
    let context = createTestContext();

    context.adapter.connect();
    context.client.close();

    try {
        await context.client.submitRequest(makeGoodRequest());
        expect(false);
    } catch (err: any) {
        expect(err.message).toContain("already been closed");
    }

    cleanupTestContext(context);
});

test('request-response failure - timeout', async () => {
    let clientOptions = {
        maxRequestResponseSubscriptions: 4,
        maxStreamingSubscriptions: 2,
        operationTimeoutInSeconds: 2
    };

    let context = createTestContext({
        clientOptions: clientOptions
    });

    context.adapter.connect();

    try {
        await context.client.submitRequest(makeGoodRequest());
        expect(false);
    } catch (err: any) {
        expect(err.message).toContain("timeout");
    }

    cleanupTestContext(context);
});

function mockSubscribeSuccessHandler(adapter: MockProtocolAdapter, subscribeOptions: protocol_adapter.SubscribeOptions) {
    setImmediate(() => { adapter.completeSubscribe(subscribeOptions.topicFilter); });
}

function mockUnsubscribeSuccessHandler(adapter: MockProtocolAdapter, unsubscribeOptions: protocol_adapter.UnsubscribeOptions) {
    setImmediate(() => { adapter.completeUnsubscribe(unsubscribeOptions.topicFilter); });
}

function mockPublishSuccessHandler(responseTopic: string, responsePayload: any, adapter: MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions) {
    setImmediate(() => {
        adapter.completePublish(publishOptions.completionData);

        let decoder = new TextDecoder();
        let payloadAsString = decoder.decode(publishOptions.payload);
        let payloadAsObject: any = JSON.parse(payloadAsString);

        responsePayload[DEFAULT_CORRELATION_TOKEN_PATH] = payloadAsObject[DEFAULT_CORRELATION_TOKEN_PATH];

        let encoder = new TextEncoder();
        let responsePayloadAsString = JSON.stringify(responsePayload);
        adapter.triggerIncomingPublish(responseTopic, encoder.encode(responsePayloadAsString));
    });
}

async function do_request_response_single_success_test(responsePath: string) {
    let adapterOptions : protocol_adapter_mock.MockProtocolAdapterOptions = {
        subscribeHandler: mockSubscribeSuccessHandler,
        unsubscribeHandler: mockUnsubscribeSuccessHandler,
        publishHandler: (adapter, publishOptions) => { mockPublishSuccessHandler(responsePath, {}, adapter, publishOptions); },
    };

    let context = createTestContext({
        adapterOptions: adapterOptions,
    });

    context.adapter.connect();

    let responsePromise = context.client.submitRequest(makeGoodRequest());
    let response = await responsePromise;

    expect(response.topic).toEqual(responsePath);

    let decoder = new TextDecoder();
    expect(decoder.decode(response.payload)).toEqual(JSON.stringify({token:DEFAULT_CORRELATION_TOKEN}));

    cleanupTestContext(context);
}

test('request-response success - accepted response path', async () => {
    await do_request_response_single_success_test(DEFAULT_ACCEPTED_PATH);
});

test('request-response success - rejected response path', async () => {
    await do_request_response_single_success_test(DEFAULT_REJECTED_PATH);
});

/*

add_test_case(rrc_request_response_multi_sub_success_response_path_accepted)
add_test_case(rrc_request_response_multi_sub_success_response_path_rejected)
add_test_case(rrc_request_response_success_empty_correlation_token)
add_test_case(rrc_request_response_success_empty_correlation_token_sequence)
add_test_case(rrc_request_response_subscribe_failure)
add_test_case(rrc_request_response_multi_subscribe_failure)
add_test_case(rrc_request_response_failure_puback_reason_code)
add_test_case(rrc_request_response_failure_invalid_payload)
add_test_case(rrc_request_response_failure_missing_correlation_token)
add_test_case(rrc_request_response_failure_invalid_correlation_token_type)
add_test_case(rrc_request_response_failure_non_matching_correlation_token)
add_test_case(rrc_request_response_multi_operation_sequence)

 */