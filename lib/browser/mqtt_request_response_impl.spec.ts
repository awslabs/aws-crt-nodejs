/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as protocol_adapter_mock from "./mqtt_request_response/protocol_adapter_mock";
import * as mqtt_request_response from "./mqtt_request_response";
import * as protocol_adapter from "./mqtt_request_response/protocol_adapter";
import { CrtError } from "./error";
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

function mockSubscribeSuccessHandler(adapter: protocol_adapter_mock.MockProtocolAdapter, subscribeOptions: protocol_adapter.SubscribeOptions, context?: any) {
    setImmediate(() => { adapter.completeSubscribe(subscribeOptions.topicFilter); });
}

function mockUnsubscribeSuccessHandler(adapter: protocol_adapter_mock.MockProtocolAdapter, unsubscribeOptions: protocol_adapter.UnsubscribeOptions, context?: any) {
    setImmediate(() => { adapter.completeUnsubscribe(unsubscribeOptions.topicFilter); });
}

interface PublishHandlerContext {
    responseTopic: string,
    responsePayload: any
}

function mockPublishSuccessHandler(adapter: protocol_adapter_mock.MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions, context?: any) {
    let publishHandlerContext = context as PublishHandlerContext;
    setImmediate(() => {
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
    let publishHandlerContext : PublishHandlerContext = {
        responseTopic: responsePath,
        responsePayload: {}
    }

    let adapterOptions : protocol_adapter_mock.MockProtocolAdapterOptions = {
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
    expect(decoder.decode(response.payload)).toEqual(JSON.stringify({token:DEFAULT_CORRELATION_TOKEN}));

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
    setImmediate(() => {
        adapter.completePublish(publishOptions.completionData);
        adapter.triggerIncomingPublish(responseTopic, publishOptions.payload);
    });
}

async function do_request_response_success_empty_correlation_token(responsePath: string, count: number) {
    let adapterOptions : protocol_adapter_mock.MockProtocolAdapterOptions = {
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
        expect(decoder.decode(response.payload)).toEqual(JSON.stringify({requestNumber:`${i}`}));
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
        setImmediate(() => {
            adapter.completeSubscribe(subscribeOptions.topicFilter, new CrtError("Nope"));
        });
    } else {
        setImmediate(() => {
            adapter.completeSubscribe(subscribeOptions.topicFilter);
        });
    }

    subscribeContext.subscribesSeen++;
}

async function do_request_response_failure_subscribe(failSecondSubscribe: boolean) {

    let subscribeContext : FailingSubscribeContext = {
        startFailingIndex : failSecondSubscribe ? 1 : 0,
        subscribesSeen : 0,
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
    setImmediate(() => {
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
    let publishHandlerContext : PublishHandlerContext = {
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
    setImmediate(() => {
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
    setImmediate(() => {
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
    setImmediate(() => {
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
    setImmediate(() => {
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

    let baseResponseAsObject : any = {};
    baseResponseAsObject["requestPayload"] = definition.uniqueRequestPayload;
    if (definition.correlationToken) {
        baseResponseAsObject[DEFAULT_CORRELATION_TOKEN_PATH] = definition.correlationToken;
    }

    let options : mqtt_request_response.RequestResponseOperationOptions = {
        subscriptionTopicFilters : new Array<string>(`${definition.topicPrefix}/+`),
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
    setImmediate(() => {
        adapter.completePublish(publishOptions.completionData);

        let decoder = new TextDecoder();
        let payloadAsString = decoder.decode(publishOptions.payload);

        let payloadAsObject: any = JSON.parse(payloadAsString);
        let token : string | undefined = payloadAsObject[DEFAULT_CORRELATION_TOKEN_PATH];

        let uniquenessValue = payloadAsObject["requestPayload"] as string;
        let definition = publishHandlerContext.responseMap.get(uniquenessValue);
        if (!definition) {
            return;
        }

        let responsePayload : any = {
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
    let operations : Array<TestOperationDefinition> = new Array<TestOperationDefinition>(
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

    let responseMap = operations.reduce(function(map, def) {
        map.set(def.uniqueRequestPayload, def);
        return map;
    }, new Map<string, TestOperationDefinition>());

    let publishHandlerContext : RequestSequenceContext = {
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
