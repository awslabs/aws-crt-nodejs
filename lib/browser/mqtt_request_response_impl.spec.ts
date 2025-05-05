/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as protocol_adapter_mock from "./mqtt_request_response/protocol_adapter_mock";
import * as mqtt_request_response from "./mqtt_request_response";
import * as protocol_adapter from "./mqtt_request_response/protocol_adapter";
import { CrtError } from "./error";
import { MockProtocolAdapter } from "./mqtt_request_response/protocol_adapter_mock";
import { once } from "events";
import { LiftedPromise, newLiftedPromise } from "../common/promise";
import { SubscriptionStatusEventType } from "./mqtt_request_response";
import { v4 as uuid } from "uuid";
import { TextEncoder, TextDecoder } from 'util';

jest.setTimeout(10000);

interface TestContextOptions {
    clientOptions?: mqtt_request_response.RequestResponseClientOptions,
    adapterOptions?: protocol_adapter_mock.MockProtocolAdapterOptions
}

interface TestContext {
    client: mqtt_request_response.RequestResponseClient,
    adapter: protocol_adapter_mock.MockProtocolAdapter
}

function createTestContext(options?: TestContextOptions): TestContext {
    let adapter = new protocol_adapter_mock.MockProtocolAdapter(options?.adapterOptions);

    var clientOptions: mqtt_request_response.RequestResponseClientOptions = options?.clientOptions ?? {
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

function makeGoodRequest(): mqtt_request_response.RequestResponseOperationOptions {
    var encoder = new TextEncoder();

    return {
        subscriptionTopicFilters: new Array<string>("a/b/+"),
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
    let requestOptions: mqtt_request_response.RequestResponseOperationOptions = null;

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

function mockSubscribeSuccessHandler(adapter: protocol_adapter_mock.MockProtocolAdapter, subscribeOptions: protocol_adapter.SubscribeOptions, context?: any) {
    setTimeout(() => { adapter.completeSubscribe(subscribeOptions.topicFilter); });
}

function mockUnsubscribeSuccessHandler(adapter: protocol_adapter_mock.MockProtocolAdapter, unsubscribeOptions: protocol_adapter.UnsubscribeOptions, context?: any) {
    setTimeout(() => { adapter.completeUnsubscribe(unsubscribeOptions.topicFilter); });
}

interface PublishHandlerContext {
    responseTopic: string,
    responsePayload: any
}

function mockPublishSuccessHandler(adapter: protocol_adapter_mock.MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions, context?: any) {
    let publishHandlerContext = context as PublishHandlerContext;
    setTimeout(() => {
        adapter.completePublish(publishOptions.completionData);

        let decoder = new TextDecoder();
        let payloadAsString = decoder.decode(publishOptions.payload);
        let payloadAsObject: any = JSON.parse(payloadAsString);

        publishHandlerContext.responsePayload[DEFAULT_CORRELATION_TOKEN_PATH] = payloadAsObject[DEFAULT_CORRELATION_TOKEN_PATH];

        let encoder = new TextEncoder();
        let responsePayloadAsString = JSON.stringify(publishHandlerContext.responsePayload);
        adapter.triggerIncomingPublish(publishHandlerContext.responseTopic, encoder.encode(responsePayloadAsString));
    });
}

async function do_request_response_single_success_test(responsePath: string, multiSubscribe: boolean) {
    let publishHandlerContext: PublishHandlerContext = {
        responseTopic: responsePath,
        responsePayload: {}
    }

    let adapterOptions: protocol_adapter_mock.MockProtocolAdapterOptions = {
        subscribeHandler: mockSubscribeSuccessHandler,
        unsubscribeHandler: mockUnsubscribeSuccessHandler,
        publishHandler: mockPublishSuccessHandler,
        publishHandlerContext: publishHandlerContext
    };

    let context = createTestContext({
        adapterOptions: adapterOptions,
    });

    context.adapter.connect();

    let request = makeGoodRequest();
    if (multiSubscribe) {
        request.subscriptionTopicFilters = new Array<string>(DEFAULT_ACCEPTED_PATH, DEFAULT_REJECTED_PATH);
    }

    let responsePromise = context.client.submitRequest(request);
    let response = await responsePromise;

    expect(response.topic).toEqual(responsePath);

    let decoder = new TextDecoder();
    expect(decoder.decode(response.payload)).toEqual(JSON.stringify({ token: DEFAULT_CORRELATION_TOKEN }));

    cleanupTestContext(context);
}

test('request-response success - accepted response path', async () => {
    await do_request_response_single_success_test(DEFAULT_ACCEPTED_PATH, false);
});

test('request-response success - multi-sub accepted response path', async () => {
    await do_request_response_single_success_test(DEFAULT_ACCEPTED_PATH, true);
});

test('request-response success - rejected response path', async () => {
    await do_request_response_single_success_test(DEFAULT_REJECTED_PATH, false);
});

test('request-response success - multi-sub rejected response path', async () => {
    await do_request_response_single_success_test(DEFAULT_REJECTED_PATH, true);
});

function mockPublishSuccessHandlerNoToken(responseTopic: string, responsePayload: any, adapter: protocol_adapter_mock.MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions, context?: any) {
    setTimeout(() => {
        adapter.completePublish(publishOptions.completionData);
        adapter.triggerIncomingPublish(responseTopic, publishOptions.payload);
    });
}

async function do_request_response_success_empty_correlation_token(responsePath: string, count: number) {
    let adapterOptions: protocol_adapter_mock.MockProtocolAdapterOptions = {
        subscribeHandler: mockSubscribeSuccessHandler,
        unsubscribeHandler: mockUnsubscribeSuccessHandler,
        publishHandler: (adapter, publishOptions, context) => { mockPublishSuccessHandlerNoToken(responsePath, {}, adapter, publishOptions, context); },
    };

    let context = createTestContext({
        adapterOptions: adapterOptions,
    });

    context.adapter.connect();

    let encoder = new TextEncoder();

    let promises = new Array<Promise<mqtt_request_response.Response>>();
    for (let i = 0; i < count; i++) {
        let request = makeGoodRequest();
        delete request.correlationToken;
        delete request.responsePaths[0].correlationTokenJsonPath;
        delete request.responsePaths[1].correlationTokenJsonPath;

        request.payload = encoder.encode(JSON.stringify({
            requestNumber: `${i}`
        }));

        promises.push(context.client.submitRequest(request));
    }

    for (const [i, promise] of promises.entries()) {
        let response = await promise;

        expect(response.topic).toEqual(responsePath);

        let decoder = new TextDecoder();
        expect(decoder.decode(response.payload)).toEqual(JSON.stringify({ requestNumber: `${i}` }));
    }

    cleanupTestContext(context);
}

test('request-response success - accepted response path no correlation token', async () => {
    await do_request_response_success_empty_correlation_token(DEFAULT_ACCEPTED_PATH, 1);
});

test('request-response success - accepted response path no correlation token sequence', async () => {
    await do_request_response_success_empty_correlation_token(DEFAULT_ACCEPTED_PATH, 5);
});

test('request-response success - rejected response path no correlation token', async () => {
    await do_request_response_success_empty_correlation_token(DEFAULT_REJECTED_PATH, 1);
});

test('request-response success - rejected response path no correlation token sequence', async () => {
    await do_request_response_success_empty_correlation_token(DEFAULT_REJECTED_PATH, 5);
});

interface FailingSubscribeContext {
    startFailingIndex: number,
    subscribesSeen: number
}

function mockSubscribeFailureHandler(adapter: protocol_adapter_mock.MockProtocolAdapter, subscribeOptions: protocol_adapter.SubscribeOptions, context?: any) {
    let subscribeContext = context as FailingSubscribeContext;

    if (subscribeContext.subscribesSeen >= subscribeContext.startFailingIndex) {
        setTimeout(() => {
            adapter.completeSubscribe(subscribeOptions.topicFilter, new CrtError("Nope"));
        });
    } else {
        setTimeout(() => {
            adapter.completeSubscribe(subscribeOptions.topicFilter);
        });
    }

    subscribeContext.subscribesSeen++;
}

async function do_request_response_failure_subscribe(failSecondSubscribe: boolean) {

    let subscribeContext: FailingSubscribeContext = {
        startFailingIndex: failSecondSubscribe ? 1 : 0,
        subscribesSeen: 0,
    };

    let adapterOptions: protocol_adapter_mock.MockProtocolAdapterOptions = {
        subscribeHandler: mockSubscribeFailureHandler,
        subscribeHandlerContext: subscribeContext,
        unsubscribeHandler: mockUnsubscribeSuccessHandler,
    };

    let context = createTestContext({
        adapterOptions: adapterOptions,
    });

    context.adapter.connect();

    let request = makeGoodRequest();
    if (failSecondSubscribe) {
        request.subscriptionTopicFilters = new Array<string>(DEFAULT_ACCEPTED_PATH, DEFAULT_REJECTED_PATH);
    }

    try {
        await context.client.submitRequest(request);
        expect(false);
    } catch (e) {
        let err = e as Error;
        expect(err.message).toContain("Subscribe failure");
    }

    cleanupTestContext(context);
}


test('request-response failure - subscribe failure', async () => {
    await do_request_response_failure_subscribe(false);
});

test('request-response failure - second subscribe failure', async () => {
    await do_request_response_failure_subscribe(true);
});

function mockPublishFailureHandlerAck(adapter: protocol_adapter_mock.MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions, context?: any) {
    setTimeout(() => {
        adapter.completePublish(publishOptions.completionData, new CrtError("Publish failure - No can do"));
    });
}

test('request-response failure - publish failure', async () => {
    let adapterOptions: protocol_adapter_mock.MockProtocolAdapterOptions = {
        subscribeHandler: mockSubscribeSuccessHandler,
        unsubscribeHandler: mockUnsubscribeSuccessHandler,
        publishHandler: mockPublishFailureHandlerAck,
    };

    let context = createTestContext({
        adapterOptions: adapterOptions,
    });

    context.adapter.connect();

    let request = makeGoodRequest();

    try {
        await context.client.submitRequest(request);
        expect(false);
    } catch (e) {
        let err = e as Error;
        expect(err.message).toContain("Publish failure");
    }

    cleanupTestContext(context);
});

async function doRequestResponseFailureByTimeoutDueToResponseTest(publishHandler: (adapter: MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions, context?: any) => void) {
    let publishHandlerContext: PublishHandlerContext = {
        responseTopic: DEFAULT_ACCEPTED_PATH,
        responsePayload: {}
    }

    let adapterOptions: protocol_adapter_mock.MockProtocolAdapterOptions = {
        subscribeHandler: mockSubscribeSuccessHandler,
        unsubscribeHandler: mockUnsubscribeSuccessHandler,
        publishHandler: publishHandler,
        publishHandlerContext: publishHandlerContext
    };

    let context = createTestContext({
        adapterOptions: adapterOptions,
        clientOptions: {
            maxRequestResponseSubscriptions: 4,
            maxStreamingSubscriptions: 2,
            operationTimeoutInSeconds: 2, // need a quick timeout
        }
    });

    context.adapter.connect();

    let request = makeGoodRequest();

    try {
        await context.client.submitRequest(request);
        expect(false);
    } catch (e) {
        let err = e as Error;
        expect(err.message).toContain("timeout");
    }

    cleanupTestContext(context);
}

function mockPublishFailureHandlerInvalidResponse(adapter: protocol_adapter_mock.MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions, context?: any) {
    let publishHandlerContext = context as PublishHandlerContext;
    setTimeout(() => {
        adapter.completePublish(publishOptions.completionData);

        let decoder = new TextDecoder();
        let payloadAsString = decoder.decode(publishOptions.payload);
        let payloadAsObject: any = JSON.parse(payloadAsString);

        publishHandlerContext.responsePayload[DEFAULT_CORRELATION_TOKEN_PATH] = payloadAsObject[DEFAULT_CORRELATION_TOKEN_PATH];

        let encoder = new TextEncoder();
        let responsePayloadAsString = JSON.stringify(publishHandlerContext.responsePayload);
        // drop the closing bracket to create a JSON deserialization error
        adapter.triggerIncomingPublish(publishHandlerContext.responseTopic, encoder.encode(responsePayloadAsString.slice(0, responsePayloadAsString.length - 1)));
    });
}

test('request-response failure - invalid response payload', async () => {
    await doRequestResponseFailureByTimeoutDueToResponseTest(mockPublishFailureHandlerInvalidResponse);
});

function mockPublishFailureHandlerMissingCorrelationToken(adapter: protocol_adapter_mock.MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions, context?: any) {
    let publishHandlerContext = context as PublishHandlerContext;
    setTimeout(() => {
        adapter.completePublish(publishOptions.completionData);

        let encoder = new TextEncoder();
        let responsePayloadAsString = JSON.stringify(publishHandlerContext.responsePayload);
        adapter.triggerIncomingPublish(publishHandlerContext.responseTopic, encoder.encode(responsePayloadAsString));
    });
}

test('request-response failure - missing correlation token', async () => {
    await doRequestResponseFailureByTimeoutDueToResponseTest(mockPublishFailureHandlerMissingCorrelationToken);
});

function mockPublishFailureHandlerInvalidCorrelationTokenType(adapter: protocol_adapter_mock.MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions, context?: any) {
    let publishHandlerContext = context as PublishHandlerContext;
    setTimeout(() => {
        adapter.completePublish(publishOptions.completionData);

        let decoder = new TextDecoder();
        let payloadAsString = decoder.decode(publishOptions.payload);
        let payloadAsObject: any = JSON.parse(payloadAsString);
        let tokenAsString = payloadAsObject[DEFAULT_CORRELATION_TOKEN_PATH] as string;
        publishHandlerContext.responsePayload[DEFAULT_CORRELATION_TOKEN_PATH] = parseInt(tokenAsString, 10);

        let encoder = new TextEncoder();
        let responsePayloadAsString = JSON.stringify(publishHandlerContext.responsePayload);
        adapter.triggerIncomingPublish(publishHandlerContext.responseTopic, encoder.encode(responsePayloadAsString));
    });
}

test('request-response failure - invalid correlation token type', async () => {
    await doRequestResponseFailureByTimeoutDueToResponseTest(mockPublishFailureHandlerInvalidCorrelationTokenType);
});

function mockPublishFailureHandlerNonMatchingCorrelationToken(adapter: protocol_adapter_mock.MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions, context?: any) {
    let publishHandlerContext = context as PublishHandlerContext;
    setTimeout(() => {
        adapter.completePublish(publishOptions.completionData);

        let decoder = new TextDecoder();
        let payloadAsString = decoder.decode(publishOptions.payload);
        let payloadAsObject: any = JSON.parse(payloadAsString);
        let token = payloadAsObject[DEFAULT_CORRELATION_TOKEN_PATH] as string;
        publishHandlerContext.responsePayload[DEFAULT_CORRELATION_TOKEN_PATH] = token.substring(1); // skip the first character

        let encoder = new TextEncoder();
        let responsePayloadAsString = JSON.stringify(publishHandlerContext.responsePayload);
        adapter.triggerIncomingPublish(publishHandlerContext.responseTopic, encoder.encode(responsePayloadAsString));
    });
}

test('request-response failure - non-matching correlation token', async () => {
    await doRequestResponseFailureByTimeoutDueToResponseTest(mockPublishFailureHandlerNonMatchingCorrelationToken);
});

interface TestOperationDefinition {
    topicPrefix: string,
    uniqueRequestPayload: string,
    correlationToken?: string,
}

interface RequestSequenceContext {
    responseMap: Map<string, TestOperationDefinition>
}

function makeTestRequest(definition: TestOperationDefinition): mqtt_request_response.RequestResponseOperationOptions {
    let encoder = new TextEncoder();

    let baseResponseAsObject: any = {};
    baseResponseAsObject["requestPayload"] = definition.uniqueRequestPayload;
    if (definition.correlationToken) {
        baseResponseAsObject[DEFAULT_CORRELATION_TOKEN_PATH] = definition.correlationToken;
    }

    let options: mqtt_request_response.RequestResponseOperationOptions = {
        subscriptionTopicFilters: new Array<string>(`${definition.topicPrefix}/+`),
        responsePaths: new Array<mqtt_request_response.ResponsePath>({
            topic: `${definition.topicPrefix}/accepted`
        }, {
            topic: `${definition.topicPrefix}/rejected`
        }),
        publishTopic: `${definition.topicPrefix}/operation`,
        payload: encoder.encode(JSON.stringify(baseResponseAsObject)),
    };

    if (definition.correlationToken) {
        options.responsePaths[0].correlationTokenJsonPath = DEFAULT_CORRELATION_TOKEN_PATH;
        options.responsePaths[1].correlationTokenJsonPath = DEFAULT_CORRELATION_TOKEN_PATH;
        options.correlationToken = definition.correlationToken;
    }

    return options;
}

function mockPublishSuccessHandlerSequence(adapter: protocol_adapter_mock.MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions, context?: any) {
    let publishHandlerContext = context as RequestSequenceContext;
    setTimeout(() => {
        adapter.completePublish(publishOptions.completionData);

        let decoder = new TextDecoder();
        let payloadAsString = decoder.decode(publishOptions.payload);

        let payloadAsObject: any = JSON.parse(payloadAsString);
        let token: string | undefined = payloadAsObject[DEFAULT_CORRELATION_TOKEN_PATH];

        let uniquenessValue = payloadAsObject["requestPayload"] as string;
        let definition = publishHandlerContext.responseMap.get(uniquenessValue);
        if (!definition) {
            return;
        }

        let responsePayload: any = {
            requestPayload: uniquenessValue
        };
        if (token) {
            responsePayload[DEFAULT_CORRELATION_TOKEN_PATH] = token; // skip the first character
        }

        let encoder = new TextEncoder();
        let responsePayloadAsString = JSON.stringify(responsePayload);
        adapter.triggerIncomingPublish(`${definition.topicPrefix}/accepted`, encoder.encode(responsePayloadAsString));
    });
}

test('request-response success - multi operation sequence', async () => {
    let operations: Array<TestOperationDefinition> = new Array<TestOperationDefinition>(
        {
            topicPrefix: "test",
            uniqueRequestPayload: "1",
            correlationToken: "token1",
        },
        {
            topicPrefix: "test",
            uniqueRequestPayload: "2",
            correlationToken: "token2",
        },
        {
            topicPrefix: "test2",
            uniqueRequestPayload: "3",
            correlationToken: "token3",
        },
        {
            topicPrefix: "interrupting/cow",
            uniqueRequestPayload: "4",
            correlationToken: "moo",
        },
        {
            topicPrefix: "test",
            uniqueRequestPayload: "5",
            correlationToken: "token4",
        },
        {
            topicPrefix: "test2",
            uniqueRequestPayload: "6",
            correlationToken: "token5",
        },
        {
            topicPrefix: "provision",
            uniqueRequestPayload: "7",
        },
        {
            topicPrefix: "provision",
            uniqueRequestPayload: "8",
        },
        {
            topicPrefix: "create-keys-and-cert",
            uniqueRequestPayload: "9",
        },
        {
            topicPrefix: "test",
            uniqueRequestPayload: "10",
            correlationToken: "token6",
        },
        {
            topicPrefix: "test2",
            uniqueRequestPayload: "11",
            correlationToken: "token7",
        },
        {
            topicPrefix: "provision",
            uniqueRequestPayload: "12",
        },
    );

    let responseMap = operations.reduce(function (map, def) {
        map.set(def.uniqueRequestPayload, def);
        return map;
    }, new Map<string, TestOperationDefinition>());

    let publishHandlerContext: RequestSequenceContext = {
        responseMap: responseMap
    }

    let adapterOptions: protocol_adapter_mock.MockProtocolAdapterOptions = {
        subscribeHandler: mockSubscribeSuccessHandler,
        unsubscribeHandler: mockUnsubscribeSuccessHandler,
        publishHandler: mockPublishSuccessHandlerSequence,
        publishHandlerContext: publishHandlerContext
    };

    let context = createTestContext({
        adapterOptions: adapterOptions
    });

    context.adapter.connect();

    let promises = new Array<Promise<mqtt_request_response.Response>>();
    for (let operation of operations) {
        let request = makeTestRequest(operation);
        promises.push(context.client.submitRequest(request));
    }

    for (const [i, promise] of promises.entries()) {
        let definition = operations[i];
        let response = await promise;

        expect(response.topic).toEqual(`${definition.topicPrefix}/accepted`);

        let decoder = new TextDecoder();
        let payloadAsString = decoder.decode(response.payload);
        let payloadAsObject = JSON.parse(payloadAsString);
        let originalRequestPayload = payloadAsObject["requestPayload"] as string;

        expect(definition.uniqueRequestPayload).toEqual(originalRequestPayload);
    }

    cleanupTestContext(context);
});

test('streaming operation validation failure - null options', async () => {
    let context = createTestContext();

    try {
        // @ts-ignore
        let operation = context.client.createStream(null);
        operation.close();
        expect(false);
    } catch (e) {
        let err = e as Error;
        expect(err.message).toContain("Invalid streaming options");
    }

    cleanupTestContext(context);
});

test('streaming operation validation failure - subscription topic filter null', async () => {
    let context = createTestContext();

    try {
        let operation = context.client.createStream({
            // @ts-ignore
            subscriptionTopicFilter: null
        });
        operation.close();
        expect(false);
    } catch (e) {
        let err = e as Error;
        expect(err.message).toContain("Invalid streaming options");
    }

    cleanupTestContext(context);
});

test('streaming operation validation failure - subscription topic filter wrong type', async () => {
    let context = createTestContext();

    try {
        let operation = context.client.createStream({
            // @ts-ignore
            subscriptionTopicFilter: 5
        });
        operation.close();
        expect(false);
    } catch (e) {
        let err = e as Error;
        expect(err.message).toContain("Invalid streaming options");
    }

    cleanupTestContext(context);
});

test('streaming operation validation failure - subscription topic filter invalid', async () => {
    let context = createTestContext();

    try {
        let operation = context.client.createStream({
            subscriptionTopicFilter: ""
        });
        operation.close();
        expect(false);
    } catch (e) {
        let err = e as Error;
        expect(err.message).toContain("Invalid streaming options");
    }

    cleanupTestContext(context);
});

test('streaming operation create failure - client closed', async () => {
    let context = createTestContext();

    context.client.close();

    try {
        let operation = context.client.createStream({
            subscriptionTopicFilter: ""
        });
        operation.close();
        expect(false);
    } catch (e) {
        let err = e as Error;
        expect(err.message).toContain("already been closed");
    }

    cleanupTestContext(context);
});


test('streaming operation - close client before open', async () => {
    let context = createTestContext();


    let operation = context.client.createStream({
        subscriptionTopicFilter: "a/b"
    });

    context.client.close();

    try {
        operation.open();
        expect(false);
    } catch (e) {
        let err = e as Error;
        expect(err.message).toContain("already closed");
    }

    cleanupTestContext(context);
});

test('streaming operation - close client after open', async () => {
    let context = createTestContext({
        adapterOptions: {
            subscribeHandler: mockSubscribeSuccessHandler,
            unsubscribeHandler: mockUnsubscribeSuccessHandler
        },
        clientOptions: {
            maxRequestResponseSubscriptions: 2,
            maxStreamingSubscriptions: 2,
        }
    });

    context.adapter.connect();

    let operation = context.client.createStream({
        subscriptionTopicFilter: "a/b"
    });

    let subscriptionStatusPromise1 = once(operation, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    operation.open();

    let subscriptionStatus1: mqtt_request_response.SubscriptionStatusEvent = (await subscriptionStatusPromise1)[0];
    expect(subscriptionStatus1.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionEstablished);
    expect(subscriptionStatus1.error).toBeFalsy();

    let subscriptionStatusPromise2 = once(operation, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    context.client.close();

    let subscriptionStatus2: mqtt_request_response.SubscriptionStatusEvent = (await subscriptionStatusPromise2)[0];
    expect(subscriptionStatus2.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionHalted);
    expect(subscriptionStatus2.error).toBeTruthy();

    let error: CrtError = subscriptionStatus2.error as CrtError;
    expect(error.message).toContain("client closed");

    cleanupTestContext(context);
});

test('streaming operation - success single', async () => {
    let context = createTestContext({
        adapterOptions: {
            subscribeHandler: mockSubscribeSuccessHandler,
            unsubscribeHandler: mockUnsubscribeSuccessHandler
        },
        clientOptions: {
            maxRequestResponseSubscriptions: 2,
            maxStreamingSubscriptions: 2,
        }
    });

    context.adapter.connect();

    let operation = context.client.createStream({
        subscriptionTopicFilter: "a/b"
    });

    let subscriptionStatusPromise1 = once(operation, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    operation.open();

    let subscriptionStatus1: mqtt_request_response.SubscriptionStatusEvent = (await subscriptionStatusPromise1)[0];
    expect(subscriptionStatus1.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionEstablished);
    expect(subscriptionStatus1.error).toBeFalsy();

    let allReceived: LiftedPromise<void> = newLiftedPromise();
    let incomingPublishes: mqtt_request_response.IncomingPublishEvent[] = new Array<mqtt_request_response.IncomingPublishEvent>();
    operation.addListener(mqtt_request_response.StreamingOperationBase.INCOMING_PUBLISH, (event) => {
        incomingPublishes.push(event);
        allReceived.resolve();
    });

    let payload: Buffer = Buffer.from("IncomingPublish", "utf-8");
    context.adapter.triggerIncomingPublish("a/b", payload);
    await allReceived.promise;

    expect(incomingPublishes.length).toEqual(1);

    let incomingPublish1 = incomingPublishes[0];
    expect(Buffer.from(incomingPublish1.payload as ArrayBuffer)).toEqual(payload);

    cleanupTestContext(context);
});

test('streaming operation - success overlapping', async () => {
    let context = createTestContext({
        adapterOptions: {
            subscribeHandler: mockSubscribeSuccessHandler,
            unsubscribeHandler: mockUnsubscribeSuccessHandler
        },
        clientOptions: {
            maxRequestResponseSubscriptions: 2,
            maxStreamingSubscriptions: 2,
        }
    });

    context.adapter.connect();

    let streamOptions: mqtt_request_response.StreamingOperationOptions = {
        subscriptionTopicFilter: "a/b"
    };

    let operation1 = context.client.createStream(streamOptions);
    let subscriptionStatusPromise1 = once(operation1, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    let operation2 = context.client.createStream(streamOptions);
    let subscriptionStatusPromise2 = once(operation2, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    operation1.open();
    operation2.open();

    let subscriptionStatus1: mqtt_request_response.SubscriptionStatusEvent = (await subscriptionStatusPromise1)[0];
    expect(subscriptionStatus1.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionEstablished);
    expect(subscriptionStatus1.error).toBeFalsy();

    let subscriptionStatus2: mqtt_request_response.SubscriptionStatusEvent = (await subscriptionStatusPromise2)[0];
    expect(subscriptionStatus2.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionEstablished);
    expect(subscriptionStatus2.error).toBeFalsy();

    // operation 1 should receive both publishes
    let allReceived1: LiftedPromise<void> = newLiftedPromise();
    let incomingPublishes1: mqtt_request_response.IncomingPublishEvent[] = new Array<mqtt_request_response.IncomingPublishEvent>();
    operation1.addListener(mqtt_request_response.StreamingOperationBase.INCOMING_PUBLISH, (event) => {
        incomingPublishes1.push(event);
        if (incomingPublishes1.length == 2) {
            allReceived1.resolve();
        }
    });

    // operation 2 should only receive one publish because we close it before triggering the second one
    let allReceived2: LiftedPromise<void> = newLiftedPromise();
    let incomingPublishes2: mqtt_request_response.IncomingPublishEvent[] = new Array<mqtt_request_response.IncomingPublishEvent>();
    operation2.addListener(mqtt_request_response.StreamingOperationBase.INCOMING_PUBLISH, (event) => {
        incomingPublishes2.push(event);
        allReceived2.resolve();
    });

    let payload1: Buffer = Buffer.from("IncomingPublish1", "utf-8");
    context.adapter.triggerIncomingPublish("a/b", payload1);

    await allReceived2.promise;

    expect(incomingPublishes2.length).toEqual(1);
    expect(Buffer.from(incomingPublishes2[0].payload as ArrayBuffer)).toEqual(payload1);

    let subscriptionStatus2HaltedPromise = once(operation2, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    operation2.close();

    let subscriptionStatus2Halted: mqtt_request_response.SubscriptionStatusEvent = (await subscriptionStatus2HaltedPromise)[0];
    expect(subscriptionStatus2Halted.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionHalted);
    expect(subscriptionStatus2Halted.error).toBeTruthy();

    let payload2: Buffer = Buffer.from("IncomingPublish2", "utf-8");
    context.adapter.triggerIncomingPublish("a/b", payload2);

    await allReceived1.promise;

    expect(incomingPublishes1.length).toEqual(2);
    expect(Buffer.from(incomingPublishes1[0].payload as ArrayBuffer)).toEqual(payload1);
    expect(Buffer.from(incomingPublishes1[1].payload as ArrayBuffer)).toEqual(payload2);

    cleanupTestContext(context);

    // nothing arrived in the meantime
    expect(incomingPublishes2.length).toEqual(1);
});

test('streaming operation - success single starting offline', async () => {
    let context = createTestContext({
        adapterOptions: {
            subscribeHandler: mockSubscribeSuccessHandler,
            unsubscribeHandler: mockUnsubscribeSuccessHandler
        },
        clientOptions: {
            maxRequestResponseSubscriptions: 2,
            maxStreamingSubscriptions: 2,
        }
    });

    let operation = context.client.createStream({
        subscriptionTopicFilter: "a/b"
    });

    let subscriptionEstablished: mqtt_request_response.SubscriptionStatusEvent | undefined = undefined;

    let subscriptionEstablishedPromise: LiftedPromise<void> = newLiftedPromise();
    operation.addListener(mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS, (event) => {
        if (event.type == SubscriptionStatusEventType.SubscriptionEstablished) {
            subscriptionEstablished = event;
            subscriptionEstablishedPromise.resolve();
        }
    });

    operation.open();

    // wait a second, nothing should happen
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(subscriptionEstablished).toBeFalsy();

    // connecting should kick off the subscribe and successful establishment
    context.adapter.connect();

    await subscriptionEstablishedPromise.promise;
    expect(subscriptionEstablished).toBeTruthy();
    // @ts-ignore
    expect(subscriptionEstablished.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionEstablished);
    // @ts-ignore
    expect(subscriptionEstablished.error).toBeFalsy();

    let allReceived: LiftedPromise<void> = newLiftedPromise();
    let incomingPublishes: mqtt_request_response.IncomingPublishEvent[] = new Array<mqtt_request_response.IncomingPublishEvent>();
    operation.addListener(mqtt_request_response.StreamingOperationBase.INCOMING_PUBLISH, (event) => {
        incomingPublishes.push(event);
        allReceived.resolve();
    });

    let payload: Buffer = Buffer.from("IncomingPublish", "utf-8");
    context.adapter.triggerIncomingPublish("a/b", payload);
    await allReceived.promise;

    expect(incomingPublishes.length).toEqual(1);

    let incomingPublish1 = incomingPublishes[0];
    expect(Buffer.from(incomingPublish1.payload as ArrayBuffer)).toEqual(payload);

    cleanupTestContext(context);
});

async function doStreamingSessionTest(resumeSession: boolean) {
    let context = createTestContext({
        adapterOptions: {
            subscribeHandler: mockSubscribeSuccessHandler,
            unsubscribeHandler: mockUnsubscribeSuccessHandler
        },
        clientOptions: {
            maxRequestResponseSubscriptions: 2,
            maxStreamingSubscriptions: 2,
        }
    });

    context.adapter.connect();

    let operation = context.client.createStream({
        subscriptionTopicFilter: "a/b"
    });

    let statusEvents: mqtt_request_response.SubscriptionStatusEvent[] = new Array<mqtt_request_response.SubscriptionStatusEvent>();
    let established1Promise: LiftedPromise<void> = newLiftedPromise();
    let established2Promise: LiftedPromise<void> = newLiftedPromise();

    operation.addListener(mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS, (event) => {
        statusEvents.push(event);
        if (event.type == SubscriptionStatusEventType.SubscriptionEstablished) {
            if (statusEvents.length == 1) {
                established1Promise.resolve();
            } else {
                established2Promise.resolve();
            }
        }
    });

    operation.open();

    await established1Promise.promise;

    expect(statusEvents.length).toEqual(1);
    let subscriptionStatus1: mqtt_request_response.SubscriptionStatusEvent = statusEvents[0];
    expect(subscriptionStatus1.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionEstablished);
    expect(subscriptionStatus1.error).toBeFalsy();

    let received1: LiftedPromise<void> = newLiftedPromise();
    let received2: LiftedPromise<void> = newLiftedPromise();
    let incomingPublishes: mqtt_request_response.IncomingPublishEvent[] = new Array<mqtt_request_response.IncomingPublishEvent>();
    operation.addListener(mqtt_request_response.StreamingOperationBase.INCOMING_PUBLISH, (event) => {
        incomingPublishes.push(event);
        if (incomingPublishes.length == 1) {
            received1.resolve();
        } else if (incomingPublishes.length == 2) {
            received2.resolve();
        }
    });

    let payload1: Buffer = Buffer.from("IncomingPublish1", "utf-8");
    context.adapter.triggerIncomingPublish("a/b", payload1);
    await received1.promise;

    expect(incomingPublishes.length).toEqual(1);

    let incomingPublish1 = incomingPublishes[0];
    expect(Buffer.from(incomingPublish1.payload as ArrayBuffer)).toEqual(payload1);

    // expect to see a single subscribe on the mock protocol adapter
    let apiCalls1 = context.adapter.getApiCalls();
    expect(apiCalls1.length).toEqual(1);
    expect(apiCalls1[0].methodName).toEqual("subscribe");

    // "disconnect" and "reconnect"
    context.adapter.disconnect();
    context.adapter.connect(resumeSession);

    if (resumeSession) {
        // wait a second, nothing should happen
        await new Promise((resolve) => setTimeout(resolve, 1000));

        expect(statusEvents.length).toEqual(1);
        expect(context.adapter.getApiCalls().length).toEqual(1);
    } else {
        // expect subscription lost event followed by established event
        await established2Promise.promise;
        expect(statusEvents.length).toEqual(3);

        expect(statusEvents[1].type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionLost);
        expect(statusEvents[2].type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionEstablished);

        // expect to see a second subscribe on the mock protocol adapter
        let apiCalls2 = context.adapter.getApiCalls();
        expect(apiCalls2.length).toEqual(2);
        expect(apiCalls1[1].methodName).toEqual("subscribe");
    }

    // trigger an incoming publish, expect it to arrive
    let payload2: Buffer = Buffer.from("IncomingPublish2", "utf-8");
    context.adapter.triggerIncomingPublish("a/b", payload2);
    await received2.promise;

    expect(incomingPublishes.length).toEqual(2);

    let incomingPublish2 = incomingPublishes[1];
    expect(Buffer.from(incomingPublish2.payload as ArrayBuffer)).toEqual(payload2);

    cleanupTestContext(context);
}

test('streaming operation - successfully reestablish subscription on clean session resumption', async () => {
    await doStreamingSessionTest(false);
});

test('streaming operation - success with session resumption', async () => {
    await doStreamingSessionTest(true);
});

interface FirstSubscribeContext {
    count: number
}

function mockSubscribeFailFirstHandler(adapter: protocol_adapter_mock.MockProtocolAdapter, subscribeOptions: protocol_adapter.SubscribeOptions, context?: any) {
    let subscribeContext = context as FirstSubscribeContext;
    subscribeContext.count++;

    if (subscribeContext.count == 1) {
        setTimeout(() => {
            adapter.completeSubscribe(subscribeOptions.topicFilter, new CrtError("Mock Failure"), true);
        });
    } else {
        setTimeout(() => {
            adapter.completeSubscribe(subscribeOptions.topicFilter);
        });
    }
}

/*
 * Variant of the basic success test where the first subscribe is failed.  Verify the
 * client sends a second subscribe (which succeeds) after which everything is fine.
 */
test('streaming operation - success despite first subscribe failure', async () => {
    let subscribeContext = {
        count: 0
    };

    let context = createTestContext({
        adapterOptions: {
            subscribeHandler: mockSubscribeFailFirstHandler,
            subscribeHandlerContext: subscribeContext,
            unsubscribeHandler: mockUnsubscribeSuccessHandler
        },
        clientOptions: {
            maxRequestResponseSubscriptions: 2,
            maxStreamingSubscriptions: 2,
            operationTimeoutInSeconds: 2,
        }
    });

    context.adapter.connect();

    let operation = context.client.createStream({
        subscriptionTopicFilter: "a/b"
    });

    let subscriptionStatusPromise1 = once(operation, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    operation.open();

    let subscriptionStatus1: mqtt_request_response.SubscriptionStatusEvent = (await subscriptionStatusPromise1)[0];
    expect(subscriptionStatus1.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionEstablished);
    expect(subscriptionStatus1.error).toBeFalsy();

    let allReceived: LiftedPromise<void> = newLiftedPromise();
    let incomingPublishes: mqtt_request_response.IncomingPublishEvent[] = new Array<mqtt_request_response.IncomingPublishEvent>();
    operation.addListener(mqtt_request_response.StreamingOperationBase.INCOMING_PUBLISH, (event) => {
        incomingPublishes.push(event);
        allReceived.resolve();
    });

    let payload: Buffer = Buffer.from("IncomingPublish", "utf-8");
    context.adapter.triggerIncomingPublish("a/b", payload);
    await allReceived.promise;

    expect(incomingPublishes.length).toEqual(1);

    let incomingPublish1 = incomingPublishes[0];
    expect(Buffer.from(incomingPublish1.payload as ArrayBuffer)).toEqual(payload);

    // verify two subscribes sent
    let apiCalls = context.adapter.getApiCalls();
    expect(apiCalls.length).toEqual(2);
    expect(apiCalls[0].methodName).toEqual("subscribe");
    expect(apiCalls[1].methodName).toEqual("subscribe");

    cleanupTestContext(context);
});

/*
 * Failure variant where the subscribe triggers a non-retryable suback failure.  Verify the
 * operation gets halted.
 */
test('streaming operation - halt after unretryable subscribe failure', async () => {
    let subscribeContext: FailingSubscribeContext = {
        startFailingIndex: 0,
        subscribesSeen: 0
    };

    let context = createTestContext({
        adapterOptions: {
            subscribeHandler: mockSubscribeFailureHandler,
            subscribeHandlerContext: subscribeContext,
            unsubscribeHandler: mockUnsubscribeSuccessHandler
        },
        clientOptions: {
            maxRequestResponseSubscriptions: 2,
            maxStreamingSubscriptions: 2,
            operationTimeoutInSeconds: 2,
        }
    });

    context.adapter.connect();

    let operation = context.client.createStream({
        subscriptionTopicFilter: "a/b"
    });

    let subscriptionStatusPromise1 = once(operation, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    operation.open();

    let subscriptionStatus1: mqtt_request_response.SubscriptionStatusEvent = (await subscriptionStatusPromise1)[0];
    expect(subscriptionStatus1.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionHalted);
    expect(subscriptionStatus1.error).toBeTruthy();

    let error = subscriptionStatus1.error as CrtError;
    expect(error.message).toContain("Subscription Failure")

    cleanupTestContext(context);
});

async function openOperationAndVerifyPublishes(operation: mqtt_request_response.StreamingOperationBase, testContext: TestContext, topic: string) {
    let subscriptionStatusPromise1 = once(operation, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    operation.open();

    let subscriptionStatus1: mqtt_request_response.SubscriptionStatusEvent = (await subscriptionStatusPromise1)[0];
    expect(subscriptionStatus1.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionEstablished);
    expect(subscriptionStatus1.error).toBeFalsy();

    let allReceived: LiftedPromise<void> = newLiftedPromise();
    let incomingPublishes: mqtt_request_response.IncomingPublishEvent[] = new Array<mqtt_request_response.IncomingPublishEvent>();
    let publishListener = (event: mqtt_request_response.IncomingPublishEvent) => {
        incomingPublishes.push(event);
        allReceived.resolve();
    };

    operation.addListener(mqtt_request_response.StreamingOperationBase.INCOMING_PUBLISH, publishListener);

    let payload: Buffer = Buffer.from("IncomingPublish-" + uuid(), "utf-8");
    testContext.adapter.triggerIncomingPublish(topic, payload);
    await allReceived.promise;

    expect(incomingPublishes.length).toEqual(1);

    let incomingPublish1 = incomingPublishes[0];
    expect(Buffer.from(incomingPublish1.payload as ArrayBuffer)).toEqual(payload);
}

async function closeOperation(operation: mqtt_request_response.StreamingOperationBase) {

    let subscriptionStatusPromise = once(operation, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

    operation.close();

    let subscriptionStatus: mqtt_request_response.SubscriptionStatusEvent = (await subscriptionStatusPromise)[0];
    expect(subscriptionStatus.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionHalted);
    expect(subscriptionStatus.error).toBeTruthy();
}

/*
 * Multi-operation variant where we exceed the streaming subscription budget, release everything and then verify
 * we can successfully establish a new streaming operation after everything cleans up.
 */
test('streaming operation - failure exceed streaming budget', async () => {
    let context = createTestContext({
        adapterOptions: {
            subscribeHandler: mockSubscribeSuccessHandler,
            unsubscribeHandler: mockUnsubscribeSuccessHandler
        },
        clientOptions: {
            maxRequestResponseSubscriptions: 2,
            maxStreamingSubscriptions: 1,
        }
    });

    context.adapter.connect();

    let operation1 = context.client.createStream({
        subscriptionTopicFilter: "a/b"
    });
    await openOperationAndVerifyPublishes(operation1, context, "a/b");

    // we can make a new one that shares the subscription
    let operation2 = context.client.createStream({
        subscriptionTopicFilter: "a/b"
    });
    await openOperationAndVerifyPublishes(operation2, context, "a/b");

    // but we can't make a new one that uses a new subscription
    let operation3 = context.client.createStream({
        subscriptionTopicFilter: "b/c"
    });

    let subscriptionStatusPromise3 = once(operation3, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);
    operation3.open();
    let subscriptionStatus3: mqtt_request_response.SubscriptionStatusEvent = (await subscriptionStatusPromise3)[0];
    expect(subscriptionStatus3.type).toEqual(mqtt_request_response.SubscriptionStatusEventType.SubscriptionHalted);
    expect(subscriptionStatus3.error).toBeTruthy();

    let error = subscriptionStatus3.error as CrtError;
    expect(error.message).toContain("NoCapacity");

    // close all the existing streams
    await closeOperation(operation1);
    await closeOperation(operation2);

    // now we can make new one that uses a different subscription
    let operation4 = context.client.createStream({
        subscriptionTopicFilter: "b/c"
    });
    await openOperationAndVerifyPublishes(operation4, context, "b/c");

    cleanupTestContext(context);
});

const STREAMING_TOPIC: string = "streaming/topic";

function mockSubscribeStreamingSuccessHandler(adapter: protocol_adapter_mock.MockProtocolAdapter, subscribeOptions: protocol_adapter.SubscribeOptions, context?: any) {
    if (subscribeOptions.topicFilter === STREAMING_TOPIC) {
        setTimeout(() => {
            adapter.completeSubscribe(subscribeOptions.topicFilter);
        });
    }
}

async function verifyRequestResponseFailure(promise: Promise<mqtt_request_response.Response>) {
    try {
        await promise;
        expect(false);
    } catch (err) {
        let error = err as CrtError;
        expect(error.message).toContain("timeout");
    }
}

/*
 * Configure server to only respond to subscribes that match a streaming filter.  Submit a couple of
 * request-response operations ahead of a streaming operation.  Verify they both time out and that the streaming
 * operation successfully subscribes and receives publishes.
 */
test('streaming operation - success delayed by request-response timeouts', async () => {
    let context = createTestContext({
        adapterOptions: {
            subscribeHandler: mockSubscribeStreamingSuccessHandler,
            unsubscribeHandler: mockUnsubscribeSuccessHandler
        },
        clientOptions: {
            maxRequestResponseSubscriptions: 2, // will cause the requests to be performed serially, blocking the streaming operation temporarily
            maxStreamingSubscriptions: 1,
            operationTimeoutInSeconds: 2,
        }
    });

    context.adapter.connect();

    let request1 = makeGoodRequest();
    request1.subscriptionTopicFilters = new Array<string>("a/accepted", "a/rejected");

    let request2 = makeGoodRequest();
    request2.subscriptionTopicFilters = new Array<string>("b/accepted", "b/rejected");

    let requestPromise1 = context.client.submitRequest(request1);
    let requestPromise2 = context.client.submitRequest(request2);

    let operation1 = context.client.createStream({
        subscriptionTopicFilter: STREAMING_TOPIC
    });

    setTimeout(async () => { await verifyRequestResponseFailure(requestPromise1); });
    setTimeout(async () => { await verifyRequestResponseFailure(requestPromise2); });

    await openOperationAndVerifyPublishes(operation1, context, STREAMING_TOPIC);

    operation1.close();

    cleanupTestContext(context);
});

/*
 * Variant of previous test where we sandwich the streaming operation by multiple request response operations and
 * verify all request-response operations fail with a timeout.
 */
test('streaming operation - success sandwiched by request-response timeouts', async () => {
    let context = createTestContext({
        adapterOptions: {
            subscribeHandler: mockSubscribeStreamingSuccessHandler,
            unsubscribeHandler: mockUnsubscribeSuccessHandler
        },
        clientOptions: {
            maxRequestResponseSubscriptions: 2, // will cause the requests to be performed serially, blocking the streaming operation temporarily
            maxStreamingSubscriptions: 1,
            operationTimeoutInSeconds: 2,
        }
    });

    context.adapter.connect();

    let request1 = makeGoodRequest();
    request1.subscriptionTopicFilters = new Array<string>("a/accepted", "a/rejected");

    let request2 = makeGoodRequest();
    request2.subscriptionTopicFilters = new Array<string>("b/accepted", "b/rejected");

    let requestPromise1 = context.client.submitRequest(request1);
    let requestPromise2 = context.client.submitRequest(request2);

    let operation1 = context.client.createStream({
        subscriptionTopicFilter: STREAMING_TOPIC
    });

    setTimeout(async () => { await verifyRequestResponseFailure(requestPromise1); });
    setTimeout(async () => { await verifyRequestResponseFailure(requestPromise2); });

    let streamingCheckPromise = openOperationAndVerifyPublishes(operation1, context, STREAMING_TOPIC);

    let request3 = makeGoodRequest();
    request3.subscriptionTopicFilters = new Array<string>("c/accepted", "c/rejected");

    let request4 = makeGoodRequest();
    request4.subscriptionTopicFilters = new Array<string>("d/accepted", "d/rejected");

    let requestPromise3 = context.client.submitRequest(request3);
    let requestPromise4 = context.client.submitRequest(request4);

    await verifyRequestResponseFailure(requestPromise3);
    await verifyRequestResponseFailure(requestPromise4);

    await streamingCheckPromise;

    operation1.close();

    cleanupTestContext(context);
});
