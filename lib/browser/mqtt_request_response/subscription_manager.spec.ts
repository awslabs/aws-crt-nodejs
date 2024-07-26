/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */


import * as protocol_adapter from './protocol_adapter';
import {BufferedEventEmitter} from "../../common/event";
import * as subscription_manager from "./subscription_manager";
import {once} from "events";
import {newLiftedPromise} from "../../common/promise";
import {ICrtError} from "../../common/error";
import {CrtError} from "../error";

jest.setTimeout(10000);

interface ProtocolAdapterApiCall {
    methodName: string;
    args: any;
}

class MockProtocolAdapter extends BufferedEventEmitter {

    private apiCalls: Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>();
    private connectionState: protocol_adapter.ConnectionState = protocol_adapter.ConnectionState.Disconnected;

    constructor() {
        super();
    }

    // ProtocolAdapter API
    close() : void {

    }

    publish(publishOptions : protocol_adapter.PublishOptions) : void {
        this.apiCalls.push({
            methodName: "publish",
            args: publishOptions
        });
    }

    subscribe(subscribeOptions : protocol_adapter.SubscribeOptions) : void {
        this.apiCalls.push({
            methodName: "subscribe",
            args: subscribeOptions
        });
    }

    unsubscribe(unsubscribeOptions : protocol_adapter.UnsubscribeOptions) : void {
        this.apiCalls.push({
            methodName: "unsubscribe",
            args: unsubscribeOptions
        });
    }

    // Internal Testing API
    connect() : void {
        if (this.connectionState === protocol_adapter.ConnectionState.Disconnected) {
            this.connectionState = protocol_adapter.ConnectionState.Connected;
        }
    }

    disconnect() : void {
        if (this.connectionState === protocol_adapter.ConnectionState.Connected) {
            this.connectionState = protocol_adapter.ConnectionState.Disconnected;
        }
    }

    getApiCalls(): Array<ProtocolAdapterApiCall> {
        return this.apiCalls;
    }

    getConnectionState() : protocol_adapter.ConnectionState {
        return this.connectionState;
    }

    completeSubscribe(topicFilter: string, err?: ICrtError, retryable?: boolean) : void {
        let event : protocol_adapter.SubscribeCompletionEvent = {
            topicFilter: topicFilter
        };
        if (err !== undefined) {
            event.err = err;
        }
        if (retryable !== undefined) {
            event.retryable = retryable;
        }

        this.emit(protocol_adapter.ProtocolClientAdapter.SUBSCRIBE_COMPLETION, event);
    }

    completeUnsubscribe(topicFilter: string, err?: ICrtError, retryable?: boolean) : void {
        let event : protocol_adapter.UnsubscribeCompletionEvent = {
            topicFilter: topicFilter
        };
        if (err !== undefined) {
            event.err = err;
        }
        if (retryable !== undefined) {
            event.retryable = retryable;
        }

        this.emit(protocol_adapter.ProtocolClientAdapter.UNSUBSCRIBE_COMPLETION, event);
    }

    // Events
    on(event: 'publishCompletion', listener: protocol_adapter.PublishCompletionEventListener): this;

    on(event: 'subscribeCompletion', listener: protocol_adapter.SubscribeCompletionEventListener): this;

    on(event: 'unsubscribeCompletion', listener: protocol_adapter.UnsubscribeCompletionEventListener): this;

    on(event: 'connectionStatus', listener: protocol_adapter.ConnectionStatusEventListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }
}

function createBasicSubscriptionManagerConfig() : subscription_manager.SubscriptionManagerConfig {
    return {
        maxRequestResponseSubscriptions: 2,
        maxStreamingSubscriptions: 1,
        operationTimeoutInSeconds: 30,
    };
}

test('Subscription Manager - Acquire Subscribing Success', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
    let filter2 = "hello/world";
    let filter3 = "a/b/events";
    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter2,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter3,
                timeoutInSeconds: 30
            }
        }
    );

    let subscribeSuccessPromise1 = once(subscriptionManager, subscription_manager.SubscriptionManager.SUBSCRIBE_SUCCESS);
    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter1);

    let subscribeSuccess1 = (await subscribeSuccessPromise1)[0];
    expect(subscribeSuccess1.topicFilter).toEqual(filter1);
    expect(subscribeSuccess1.operationId).toEqual(1);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    let subscribeSuccessPromise2 = once(subscriptionManager, subscription_manager.SubscriptionManager.SUBSCRIBE_SUCCESS);
    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter2);

    let subscribeSuccess2 = (await subscribeSuccessPromise2)[0];
    expect(subscribeSuccess2.topicFilter).toEqual(filter2);
    expect(subscribeSuccess2.operationId).toEqual(2);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 2));

    let streamingSubscriptionEstablishedPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_ESTABLISHED);

    expect(subscriptionManager.acquireSubscription({
        operationId: 3,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter3]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter3);

    let streamingSubscriptionEstablished = (await streamingSubscriptionEstablishedPromise)[0];
    expect(streamingSubscriptionEstablished.topicFilter).toEqual(filter3);
    expect(streamingSubscriptionEstablished.operationId).toEqual(3);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Multiple Subscribing Success', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/accepted";
    let filter2 = "a/b/rejected";
    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter2,
                timeoutInSeconds: 30
            }
        },
    );

    let allPromise = newLiftedPromise<void>();
    let subscribeSuccesses = new Array<subscription_manager.SubscribeSuccessEvent>();
    subscriptionManager.addListener(subscription_manager.SubscriptionManager.SUBSCRIBE_SUCCESS, (event) => {
        subscribeSuccesses.push(event);
        if (subscribeSuccesses.length == 2) {
            allPromise.resolve();
        }
    });

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1, filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter1);
    adapter.completeSubscribe(filter2);

    await allPromise.promise;

    let expectedSubscribeSuccesses = new Array<subscription_manager.SubscribeSuccessEvent>(
        {
            topicFilter: filter1,
            operationId: 1,
        },
        {
            topicFilter: filter2,
            operationId: 1,
        }
    );
    expect(subscribeSuccesses).toEqual(expectedSubscribeSuccesses);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Existing Subscribing', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
    let filter2 = "hello/world";
    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter2,
                timeoutInSeconds: 30
            }
        }
    );

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);

    expect(subscriptionManager.acquireSubscription({
        operationId: 3,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(subscriptionManager.acquireSubscription({
        operationId: 4,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Multi Existing Subscribing', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
    let filter2 = "hello/world";
    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter2,
                timeoutInSeconds: 30
            }
        }
    );

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1, filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1, filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Multi Partially Subscribed', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
    let filter2 = "hello/world";
    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter2,
                timeoutInSeconds: 30
            }
        }
    );

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1, filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Subscribed Success', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
    let filter2 = "hello/world";
    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter2,
                timeoutInSeconds: 30
            }
        },
    );

    let subscribeSuccessPromise1 = once(subscriptionManager, subscription_manager.SubscriptionManager.SUBSCRIBE_SUCCESS);
    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter1);

    let subscribeSuccess1 = (await subscribeSuccessPromise1)[0];
    expect(subscribeSuccess1.topicFilter).toEqual(filter1);
    expect(subscribeSuccess1.operationId).toEqual(1);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    let streamingSubscriptionEstablishedPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_ESTABLISHED);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter2);

    let streamingSubscriptionEstablished = (await streamingSubscriptionEstablishedPromise)[0];
    expect(streamingSubscriptionEstablished.topicFilter).toEqual(filter2);
    expect(streamingSubscriptionEstablished.operationId).toEqual(2);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);

    expect(subscriptionManager.acquireSubscription({
        operationId: 3,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribed);

    expect(subscriptionManager.acquireSubscription({
        operationId: 4,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribed);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Multi Subscribed Success', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
    let filter2 = "hello/world";
    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter2,
                timeoutInSeconds: 30
            }
        },
    );

    let subscribeSuccessPromise1 = once(subscriptionManager, subscription_manager.SubscriptionManager.SUBSCRIBE_SUCCESS);
    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter1);

    let subscribeSuccess1 = (await subscribeSuccessPromise1)[0];
    expect(subscribeSuccess1.topicFilter).toEqual(filter1);
    expect(subscribeSuccess1.operationId).toEqual(1);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    let subscribeSuccessPromise2 = once(subscriptionManager, subscription_manager.SubscriptionManager.SUBSCRIBE_SUCCESS);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter2);

    let subscribeSuccess2 = (await subscribeSuccessPromise2)[0];
    expect(subscribeSuccess2.topicFilter).toEqual(filter2);
    expect(subscribeSuccess2.operationId).toEqual(2);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);

    expect(subscriptionManager.acquireSubscription({
        operationId: 3,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1, filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribed);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Request-Response Blocked', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
    let filter2 = "hello/world";
    let filter3 = "fail/ure";

    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter2,
                timeoutInSeconds: 30
            }
        },
    );

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);

    expect(subscriptionManager.acquireSubscription({
        operationId: 3,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter3]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Blocked);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Multi Request-Response Partial Blocked', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
    let filter2 = "hello/world";
    let filter3 = "fail/ure";

    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
    );

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter2, filter3]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Blocked);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Streaming Blocked', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
    let filter2 = "hello/world";

    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'unsubscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
    );

    let streamingSubscriptionEstablishedPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_ESTABLISHED);

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter1);

    let streamingSubscriptionEstablished = (await streamingSubscriptionEstablishedPromise)[0];
    expect(streamingSubscriptionEstablished.topicFilter).toEqual(filter1);
    expect(streamingSubscriptionEstablished.operationId).toEqual(1);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    let subscriptionOrphanedPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.SUBSCRIPTION_ORPHANED);
    subscriptionManager.releaseSubscription({
        operationId: 1,
        topicFilters: [filter1]
    });

    let subscriptionOrphaned = (await subscriptionOrphanedPromise)[0];
    expect(subscriptionOrphaned.topicFilter).toEqual(filter1);

    subscriptionManager.purge();

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Blocked);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Multi Streaming Blocked', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    let config = createBasicSubscriptionManagerConfig();
    config.maxStreamingSubscriptions = 2;

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, config);

    let filter1 = "a/b/+";
    let filter2 = "hello/world";
    let filter3 = "foo/bar";

    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'unsubscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
    );

    let streamingSubscriptionEstablishedPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_ESTABLISHED);

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter1);

    let streamingSubscriptionEstablished = (await streamingSubscriptionEstablishedPromise)[0];
    expect(streamingSubscriptionEstablished.topicFilter).toEqual(filter1);
    expect(streamingSubscriptionEstablished.operationId).toEqual(1);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    let subscriptionOrphanedPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.SUBSCRIPTION_ORPHANED);
    subscriptionManager.releaseSubscription({
        operationId: 1,
        topicFilters: [filter1]
    });

    let subscriptionOrphaned = (await subscriptionOrphanedPromise)[0];
    expect(subscriptionOrphaned.topicFilter).toEqual(filter1);

    subscriptionManager.purge();

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter2, filter3]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Blocked);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Streaming NoCapacity, None Allowed', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    let config = createBasicSubscriptionManagerConfig();
    config.maxStreamingSubscriptions = 0;

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, config);

    let filter1 = "a/b/+";

    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>();

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.NoCapacity);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Streaming NoCapacity, Too Many', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    let config = createBasicSubscriptionManagerConfig();
    config.maxStreamingSubscriptions = 4;

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, config);

    for (let i = 0; i < 4; i++) {
        let filter = `a/b/${i}`;
        expect(subscriptionManager.acquireSubscription({
            operationId: i + 1,
            type: subscription_manager.SubscriptionType.EventStream,
            topicFilters: [filter]
        })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);
    }

    let filter1 = "hello/world";

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.NoCapacity);
});

test('Subscription Manager - Acquire Multi Streaming NoCapacity', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    let config = createBasicSubscriptionManagerConfig();
    config.maxStreamingSubscriptions = 2;

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, config);

    let filter1 = "a/b/+";
    let filter2 = "hello/world";
    let filter3 = "foo/bar";

    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
        {
            methodName: 'subscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
    );

    let streamingSubscriptionEstablishedPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_ESTABLISHED);

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter1);

    let streamingSubscriptionEstablished = (await streamingSubscriptionEstablishedPromise)[0];
    expect(streamingSubscriptionEstablished.topicFilter).toEqual(filter1);
    expect(streamingSubscriptionEstablished.operationId).toEqual(1);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter2, filter3]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.NoCapacity);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Failure Mixed Subscription Types', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    let config = createBasicSubscriptionManagerConfig();
    config.maxStreamingSubscriptions = 2;

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, config);

    let filter1 = "a/b/+";

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Failure);
});

test('Subscription Manager - Acquire Multi Failure Mixed Subscription Types', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    let config = createBasicSubscriptionManagerConfig();
    config.maxStreamingSubscriptions = 2;

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, config);

    let filter1 = "a/b/+";
    let filter2 = "c/d";

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1, filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Failure);
});

test('Subscription Manager - Acquire Failure Poisoned', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    let config = createBasicSubscriptionManagerConfig();
    config.maxStreamingSubscriptions = 2;

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, config);

    let filter1 = "a/b/+";

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    let subscriptionHaltedPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_HALTED);

    adapter.completeSubscribe(filter1, new CrtError("Unrecoverable Error"));

    let subscriptionHalted = (await subscriptionHaltedPromise)[0];
    expect(subscriptionHalted.topicFilter).toEqual(filter1);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Failure);
});

