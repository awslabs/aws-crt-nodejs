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

interface MockProtocolAdapterOptions {
    subscribeHandler?: (subscribeOptions: protocol_adapter.SubscribeOptions) => void,
    unsubscribeHandler?: (unsubscribeOptions: protocol_adapter.UnsubscribeOptions) => void,
}

class MockProtocolAdapter extends BufferedEventEmitter {

    private apiCalls: Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>();
    private connectionState: protocol_adapter.ConnectionState = protocol_adapter.ConnectionState.Disconnected;

    constructor(private options?: MockProtocolAdapterOptions) {
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

        if (this.options && this.options.subscribeHandler) {
            this.options.subscribeHandler(subscribeOptions);
        }
    }

    unsubscribe(unsubscribeOptions : protocol_adapter.UnsubscribeOptions) : void {
        this.apiCalls.push({
            methodName: "unsubscribe",
            args: unsubscribeOptions
        });

        if (this.options && this.options.unsubscribeHandler) {
            this.options.unsubscribeHandler(unsubscribeOptions);
        }
    }

    // Internal Testing API
    connect(joinedSession?: boolean) : void {
        if (this.connectionState === protocol_adapter.ConnectionState.Disconnected) {
            this.connectionState = protocol_adapter.ConnectionState.Connected;

            this.emit('connectionStatus', {
                status: protocol_adapter.ConnectionState.Connected,
                joinedSession: joinedSession
            });
        }
    }

    disconnect() : void {
        if (this.connectionState === protocol_adapter.ConnectionState.Connected) {
            this.connectionState = protocol_adapter.ConnectionState.Disconnected;

            this.emit('connectionStatus', {
                status: protocol_adapter.ConnectionState.Disconnected,
            });
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

interface SubscriptionManagerEvent {
    type: subscription_manager.SubscriptionEventType,
    data: any,
};

function subscriptionManagerEventSequenceContainsEvent(eventSequence: SubscriptionManagerEvent[], expectedEvent: SubscriptionManagerEvent) : boolean {
    for (let event of eventSequence) {
        if (event.type !== expectedEvent.type) {
            continue;
        }

        if (expectedEvent.data.hasOwnProperty('operationId')) {
            if (!event.data.hasOwnProperty('operationId') || expectedEvent.data.operationId !== event.data.operationId) {
                continue;
            }
        }

        if (expectedEvent.data.hasOwnProperty('topicFilter')) {
            if (!event.data.hasOwnProperty('topicFilter') || expectedEvent.data.topicFilter !== event.data.topicFilter) {
                continue;
            }
        }

        return true;
    }

    return false;
}

function subscriptionManagerEventSequenceContainsEvents(eventSequence: SubscriptionManagerEvent[], expectedEvents: SubscriptionManagerEvent[]) : boolean {
    for (let expectedEvent of expectedEvents) {
        if (!subscriptionManagerEventSequenceContainsEvent(eventSequence, expectedEvent)) {
            return false;
        }
    }

    return true;
}

function protocolAdapterApiCallSequenceContainsApiCall(apiCallSequence: ProtocolAdapterApiCall[], expectedApiCall: ProtocolAdapterApiCall) : boolean {
    for (let apiCall of apiCallSequence) {
        if (apiCall.methodName !== expectedApiCall.methodName) {
            continue;
        }

        if (expectedApiCall.args.hasOwnProperty('topicFilter')) {
            if (!apiCall.args.hasOwnProperty('topicFilter') || expectedApiCall.args.topicFilter !== apiCall.args.topicFilter) {
                continue;
            }
        }

        return true;
    }

    return false;
}

function protocolAdapterApiCallSequenceContainsApiCalls(apiCallSequence: ProtocolAdapterApiCall[], expectedApiCalls: ProtocolAdapterApiCall[]) : boolean {
    for (let expectedApiCall of expectedApiCalls) {
        if (!protocolAdapterApiCallSequenceContainsApiCall(apiCallSequence, expectedApiCall)) {
            return false;
        }
    }

    return true;
}


test('Subscription Manager - RequestResponse Multi Acquire/Release triggers Unsubscribe', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/accepted";
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

    let allPromise = newLiftedPromise<void>();
    let events = new Array<SubscriptionManagerEvent>();
    subscriptionManager.addListener(subscription_manager.SubscriptionManager.SUBSCRIBE_SUCCESS, (event) => {
        events.push({
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: event
        });
        if (events.length == 2) {
            allPromise.resolve();
        }
    });

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter1);

    await allPromise.promise;

    let expectedSubscribeSuccesses : SubscriptionManagerEvent[] = [
        {
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: {
                topicFilter: filter1,
                operationId: 1,
            }
        },
        {
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: {
                topicFilter: filter1,
                operationId: 2,
            }
        }
    ];

    expect(subscriptionManagerEventSequenceContainsEvents(events, expectedSubscribeSuccesses)).toBeTruthy();
    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    subscriptionManager.releaseSubscription({
        operationId: 1,
        topicFilters: [filter1]
    });

    subscriptionManager.purge();

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    subscriptionManager.releaseSubscription({
        operationId: 2,
        topicFilters: [filter1]
    });

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    subscriptionManager.purge();

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Multi Acquire/Release Multi triggers Unsubscribes', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/accepted";
    let filter2 = "a/b/rejected";
    let expectedSubscribes : ProtocolAdapterApiCall[] = [
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
    ];

    let expectedUnsubscribes : ProtocolAdapterApiCall[] = [
        {
            methodName: 'unsubscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
        {
            methodName: 'unsubscribe',
            args: {
                topicFilter: filter2,
                timeoutInSeconds: 30
            }
        },
    ];

    let allSubscribedPromise = newLiftedPromise<void>();
    let events = new Array<SubscriptionManagerEvent>();
    subscriptionManager.addListener(subscription_manager.SubscriptionManager.SUBSCRIBE_SUCCESS, (event) => {
        events.push({
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: event
        });
        if (events.length == 4) {
            allSubscribedPromise.resolve();
        }
    });

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1, filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1, filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter1);
    adapter.completeSubscribe(filter2);

    await allSubscribedPromise.promise;

    let expectedSubscribeSuccesses : SubscriptionManagerEvent[] = [
        {
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: {
                topicFilter: filter1,
                operationId: 1,
            }
        },
        {
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: {
                topicFilter: filter1,
                operationId: 2,
            }
        },
        {
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: {
                topicFilter: filter2,
                operationId: 1,
            }
        },
        {
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: {
                topicFilter: filter2,
                operationId: 2,
            }
        },
    ];

    expect(subscriptionManagerEventSequenceContainsEvents(events, expectedSubscribeSuccesses)).toBeTruthy();
    expect(protocolAdapterApiCallSequenceContainsApiCalls(adapter.getApiCalls(), expectedSubscribes)).toBeTruthy();

    subscriptionManager.releaseSubscription({
        operationId: 1,
        topicFilters: [filter1, filter2]
    });

    subscriptionManager.purge();

    expect(protocolAdapterApiCallSequenceContainsApiCalls(adapter.getApiCalls(), expectedUnsubscribes)).toBeFalsy();

    subscriptionManager.releaseSubscription({
        operationId: 2,
        topicFilters: [filter1, filter2]
    });

    expect(protocolAdapterApiCallSequenceContainsApiCalls(adapter.getApiCalls(), expectedUnsubscribes)).toBeFalsy();

    subscriptionManager.purge();

    expect(protocolAdapterApiCallSequenceContainsApiCalls(adapter.getApiCalls(), expectedUnsubscribes)).toBeTruthy();
});

test('Subscription Manager - Streaming Multi Acquire/Release triggers Unsubscribe', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/accepted";
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

    let allPromise = newLiftedPromise<void>();
    let events = new Array<SubscriptionManagerEvent>();
    subscriptionManager.addListener(subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_ESTABLISHED, (event) => {
        events.push({
            type: subscription_manager.SubscriptionEventType.StreamingSubscriptionEstablished,
            data: event
        });
        if (events.length == 2) {
            allPromise.resolve();
        }
    });

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    adapter.completeSubscribe(filter1);

    await allPromise.promise;

    let expectedStreamingSubscriptionEstablishments : SubscriptionManagerEvent[] = [
        {
            type: subscription_manager.SubscriptionEventType.StreamingSubscriptionEstablished,
            data: {
                topicFilter: filter1,
                operationId: 1,
            }
        },
        {
            type: subscription_manager.SubscriptionEventType.StreamingSubscriptionEstablished,
            data: {
                topicFilter: filter1,
                operationId: 2,
            }
        }
    ];

    expect(subscriptionManagerEventSequenceContainsEvents(events, expectedStreamingSubscriptionEstablishments)).toBeTruthy();
    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    subscriptionManager.releaseSubscription({
        operationId: 1,
        topicFilters: [filter1]
    });

    subscriptionManager.purge();

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    subscriptionManager.releaseSubscription({
        operationId: 2,
        topicFilters: [filter1]
    });

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    subscriptionManager.purge();

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

async function doUnsubscribeMakesRoomTest(shouldUnsubscribeSucceed: boolean) {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/accepted";
    let filter2 = "a/b/rejected";
    let filter3 = "hello/world";
    let expectedSubscribes : ProtocolAdapterApiCall[] = [
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
    ];

    let blockedSubscribe = {
        methodName: 'subscribe',
        args: {
            topicFilter: filter3,
            timeoutInSeconds: 30
        }
    };

    let expectedUnsubscribes : ProtocolAdapterApiCall[] = [
        {
            methodName: 'unsubscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
    ];

    let allSubscribedPromise = newLiftedPromise<void>();
    let events = new Array<SubscriptionManagerEvent>();
    subscriptionManager.addListener(subscription_manager.SubscriptionManager.SUBSCRIBE_SUCCESS, (event) => {
        events.push({
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: event
        });
        if (events.length == 2) {
            allSubscribedPromise.resolve();
        }
    });

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(subscriptionManager.acquireSubscription({
        operationId: 3,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter3]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Blocked);

    adapter.completeSubscribe(filter1);
    adapter.completeSubscribe(filter2);

    await allSubscribedPromise.promise;

    let expectedSubscribeSuccesses : SubscriptionManagerEvent[] = [
        {
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: {
                topicFilter: filter1,
                operationId: 1,
            }
        },
        {
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: {
                topicFilter: filter2,
                operationId: 2,
            }
        },
    ];

    expect(subscriptionManagerEventSequenceContainsEvents(events, expectedSubscribeSuccesses)).toBeTruthy();
    expect(protocolAdapterApiCallSequenceContainsApiCalls(adapter.getApiCalls(), expectedSubscribes)).toBeTruthy();

    expect(subscriptionManager.acquireSubscription({
        operationId: 3,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter3]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Blocked);

    subscriptionManager.releaseSubscription({
        operationId: 1,
        topicFilters: [filter1]
    });

    expect(subscriptionManager.acquireSubscription({
        operationId: 3,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter3]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Blocked);

    expect(protocolAdapterApiCallSequenceContainsApiCalls(adapter.getApiCalls(), expectedUnsubscribes)).toBeFalsy();

    subscriptionManager.purge();

    expect(subscriptionManager.acquireSubscription({
        operationId: 3,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter3]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Blocked);

    expect(protocolAdapterApiCallSequenceContainsApiCalls(adapter.getApiCalls(), expectedUnsubscribes)).toBeTruthy();

    if (shouldUnsubscribeSucceed) {
        adapter.completeUnsubscribe(filter1);
    } else {
        adapter.completeUnsubscribe(filter1, new CrtError("Help"));
    }

    expect(protocolAdapterApiCallSequenceContainsApiCall(adapter.getApiCalls(), blockedSubscribe)).toBeFalsy();

    subscriptionManager.purge();

    let expectedAcquireResult = shouldUnsubscribeSucceed ? subscription_manager.AcquireSubscriptionResult.Subscribing : subscription_manager.AcquireSubscriptionResult.Blocked;
    expect(subscriptionManager.acquireSubscription({
        operationId: 3,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter3]
    })).toEqual(expectedAcquireResult);

    expect(protocolAdapterApiCallSequenceContainsApiCall(adapter.getApiCalls(), blockedSubscribe)).toEqual(shouldUnsubscribeSucceed);
}

test('Subscription Manager - Successful Unsubscribe Frees Subscription Space', async () => {
    await doUnsubscribeMakesRoomTest(true);
});

test('Subscription Manager - Unsuccessful Unsubscribe Does Not Free Subscription Space', async () => {
    await doUnsubscribeMakesRoomTest(false);
});

test('Subscription Manager - Synchronous RequestResponse Subscribe Failure causes acquire failure', async () => {
    let adapter = new MockProtocolAdapter({
        subscribeHandler: (subscribeOptions) => { throw new CrtError("Bad"); }
    });
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
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
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Failure);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Synchronous Streaming Subscribe Failure causes acquire failure and poisons future acquires', async () => {
    let attemptNumber = 0;

    let adapter = new MockProtocolAdapter({
        subscribeHandler: (subscribeOptions) => {
            attemptNumber++;
            if (attemptNumber == 1) {
                throw new CrtError("Bad");
            }
        }
    });
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
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
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Failure);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);

    subscriptionManager.purge();

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Failure);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - RequestResponse Acquire Subscribe with error emits SubscribeFailed', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
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

    let subscribeFailedPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.SUBSCRIBE_FAILURE);
    adapter.completeSubscribe(filter1, new CrtError("Derp"));

    let subscribeFailed = (await subscribeFailedPromise)[0];
    expect(subscribeFailed.topicFilter).toEqual(filter1);
    expect(subscribeFailed.operationId).toEqual(1);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Streaming Acquire Subscribe with retryable error triggers resubscribe', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
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
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
    );

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0, 1));

    adapter.completeSubscribe(filter1, new CrtError("Derp"), true);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

function getExpectedEventTypeForOfflineAcquireOnlineTest(subscriptionType: subscription_manager.SubscriptionType, shouldSubscribeSucceed: boolean) : subscription_manager.SubscriptionEventType {
    if (subscriptionType == subscription_manager.SubscriptionType.RequestResponse) {
        if (shouldSubscribeSucceed) {
            return subscription_manager.SubscriptionEventType.SubscribeSuccess;
        } else {
            return subscription_manager.SubscriptionEventType.SubscribeFailure;
        }
    } else {
        if (shouldSubscribeSucceed) {
            return subscription_manager.SubscriptionEventType.StreamingSubscriptionEstablished;
        } else {
            return subscription_manager.SubscriptionEventType.StreamingSubscriptionHalted;
        }
    }
}

async function offlineAcquireOnlineTest(subscriptionType: subscription_manager.SubscriptionType, shouldSubscribeSucceed: boolean) {
    let adapter = new MockProtocolAdapter();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
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
        type: subscriptionType,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual([]);

    adapter.connect();

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);

    let anyPromise = newLiftedPromise<void>();
    let events = new Array<SubscriptionManagerEvent>();
    subscriptionManager.addListener(subscription_manager.SubscriptionManager.SUBSCRIBE_SUCCESS, (event) => {
        events.push({
            type: subscription_manager.SubscriptionEventType.SubscribeSuccess,
            data: event
        });
        anyPromise.resolve();
    });
    subscriptionManager.addListener(subscription_manager.SubscriptionManager.SUBSCRIBE_FAILURE, (event) => {
        events.push({
            type: subscription_manager.SubscriptionEventType.SubscribeFailure,
            data: event
        });
        anyPromise.resolve();
    });
    subscriptionManager.addListener(subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_ESTABLISHED, (event) => {
        events.push({
            type: subscription_manager.SubscriptionEventType.StreamingSubscriptionEstablished,
            data: event
        });
        anyPromise.resolve();
    });
    subscriptionManager.addListener(subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_HALTED, (event) => {
        events.push({
            type: subscription_manager.SubscriptionEventType.StreamingSubscriptionHalted,
            data: event
        });
        anyPromise.resolve();
    });

    if (shouldSubscribeSucceed) {
        adapter.completeSubscribe(filter1);
    } else {
        adapter.completeSubscribe(filter1, new CrtError("Argh"));
    }

    await anyPromise.promise;

    expect(events.length).toEqual(1);
    let event = events[0];
    expect(event.type).toEqual(getExpectedEventTypeForOfflineAcquireOnlineTest(subscriptionType, shouldSubscribeSucceed));
    expect(event.data.topicFilter).toEqual(filter1);
}

test('Subscription Manager - RequestResponse Acquire While Offline, Going online triggers Subscribe, Subscribe Success', async () => {
    await offlineAcquireOnlineTest(subscription_manager.SubscriptionType.RequestResponse, true);
});

test('Subscription Manager - RequestResponse Acquire While Offline, Going online triggers Subscribe, Subscribe Failure', async () => {
    await offlineAcquireOnlineTest(subscription_manager.SubscriptionType.RequestResponse, false);
});

test('Subscription Manager - Streaming Acquire While Offline, Going online triggers Subscribe, Subscribe Success', async () => {
    await offlineAcquireOnlineTest(subscription_manager.SubscriptionType.EventStream, true);
});

test('Subscription Manager - Streaming Acquire While Offline, Going online triggers Subscribe, Subscribe Failure', async () => {
    await offlineAcquireOnlineTest(subscription_manager.SubscriptionType.EventStream, false);
});

async function offlineAcquireReleaseOnlineTest(subscriptionType: subscription_manager.SubscriptionType) {
    let adapter = new MockProtocolAdapter();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
    let filter2 = "hello/world"
    let expectedApiCalls : Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>(
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
        type: subscriptionType,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual([]);

    subscriptionManager.releaseSubscription({
        operationId: 1,
        topicFilters: [filter1],
    });

    expect(adapter.getApiCalls()).toEqual([]);

    adapter.connect();

    expect(adapter.getApiCalls()).toEqual([]);

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscriptionType,
        topicFilters: [filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
}

test('Subscription Manager - RequestResponse Acquire-Release While Offline, Going online triggers nothing', async () => {
    await offlineAcquireReleaseOnlineTest(subscription_manager.SubscriptionType.RequestResponse);
});

test('Subscription Manager - Streaming Acquire-Release While Offline, Going online triggers nothing', async () => {
    await offlineAcquireReleaseOnlineTest(subscription_manager.SubscriptionType.EventStream);
});

async function acquireOfflineReleaseAcquireOnlineTest(subscriptionType: subscription_manager.SubscriptionType) {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    let config = createBasicSubscriptionManagerConfig();
    config.maxStreamingSubscriptions = 2;

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, config);

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
        {
            methodName: 'unsubscribe',
            args: {
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
    );

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscriptionType,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0,1));

    adapter.completeSubscribe(filter1);

    adapter.disconnect();

    subscriptionManager.releaseSubscription({
        operationId: 1,
        topicFilters: [filter1],
    });

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0,1));

    expect(subscriptionManager.acquireSubscription({
        operationId: 2,
        type: subscriptionType,
        topicFilters: [filter2]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(protocolAdapterApiCallSequenceContainsApiCalls(adapter.getApiCalls(), expectedApiCalls)).toBeFalsy();

    adapter.connect(true);

    expect(protocolAdapterApiCallSequenceContainsApiCalls(adapter.getApiCalls(), expectedApiCalls)).toBeTruthy();
}

test('Subscription Manager - RequestResponse Release-Acquire2 while offline, Going online triggers Unsubscribe and Subscribe', async () => {
    await acquireOfflineReleaseAcquireOnlineTest(subscription_manager.SubscriptionType.RequestResponse);
});

test('Subscription Manager - Streaming Release-Acquire2 while offline, Going online triggers Unsubscribe and Subscribe', async () => {
    await acquireOfflineReleaseAcquireOnlineTest(subscription_manager.SubscriptionType.EventStream);
});

async function closeTest(subscriptionType: subscription_manager.SubscriptionType, completeSubscribe: boolean, closeWhileConnected: boolean) {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
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

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscriptionType,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0,1));

    if (completeSubscribe) {
        adapter.completeSubscribe(filter1);
    }

    if (!closeWhileConnected) {
        adapter.disconnect();
    }

    subscriptionManager.close();

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
}

test('Subscription Manager - Close while request-response subscribed and online triggers unsubscribe', async () => {
    await closeTest(subscription_manager.SubscriptionType.RequestResponse, true, true);
});

test('Subscription Manager - Close while streaming subscribed and online triggers unsubscribe', async () => {
    await closeTest(subscription_manager.SubscriptionType.EventStream, true, true);
});

test('Subscription Manager - Close while request-response subscribing and online triggers unsubscribe', async () => {
    await closeTest(subscription_manager.SubscriptionType.RequestResponse, false, true);
});

test('Subscription Manager - Close while streaming subscribing and online triggers unsubscribe', async () => {
    await closeTest(subscription_manager.SubscriptionType.EventStream, false, true);
});

test('Subscription Manager - Close while request-response subscribing and offline triggers unsubscribe', async () => {
    await closeTest(subscription_manager.SubscriptionType.RequestResponse, false, false);
});

test('Subscription Manager - Close while streaming subscribing and offline triggers unsubscribe', async () => {
    await closeTest(subscription_manager.SubscriptionType.EventStream, false, false);
});

async function noSessionSubscriptionEndedTest(offlineWhileUnsubscribing: boolean) {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
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

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0,1));

    adapter.completeSubscribe(filter1);

    if (offlineWhileUnsubscribing) {
        subscriptionManager.releaseSubscription({
            operationId: 1,
            topicFilters: [filter1]
        });

        subscriptionManager.purge();

        expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
    }

    let subscriptionEndedPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.SUBSCRIPTION_ENDED);

    adapter.disconnect();
    adapter.connect();

    if (!offlineWhileUnsubscribing) {
        let subscriptionEnded = (await subscriptionEndedPromise)[0];
        expect(subscriptionEnded.topicFilter).toEqual(filter1);
    }

    let reaquire: subscription_manager.AcquireSubscriptionConfig = {
        operationId: 2,
        type: subscription_manager.SubscriptionType.RequestResponse,
        topicFilters : [filter1],
    };

    if (offlineWhileUnsubscribing) {
        expect(subscriptionManager.acquireSubscription(reaquire)).toEqual(subscription_manager.AcquireSubscriptionResult.Blocked);

        adapter.completeUnsubscribe(filter1, new CrtError("timeout"));
    }

    expect(subscriptionManager.acquireSubscription(reaquire)).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);
}

test('Subscription Manager - Subscribed Session Rejoin Failure triggers subscription ended', async () => {
    await noSessionSubscriptionEndedTest(false);
});

test('Subscription Manager - Subscribed Session Rejoin Failure while unsubscribing triggers subscription ended', async () => {
    await noSessionSubscriptionEndedTest(true);
});

test('Subscription Manager - Subscribed Streaming Session Rejoin Failure triggers resubscribe and emits SubscriptionLost', async () => {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
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
                topicFilter: filter1,
                timeoutInSeconds: 30
            }
        },
    );

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0,1));

    adapter.completeSubscribe(filter1);

    let subscriptionLostPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_LOST);

    adapter.disconnect();

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0,1));

    adapter.connect();

    let subscriptionLost = (await subscriptionLostPromise)[0];
    expect(subscriptionLost.topicFilter).toEqual(filter1);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

async function doPurgeTest(subscriptionType: subscription_manager.SubscriptionType) {
    let adapter = new MockProtocolAdapter();
    adapter.connect();

    // @ts-ignore
    let subscriptionManager = new subscription_manager.SubscriptionManager(adapter, createBasicSubscriptionManagerConfig());

    let filter1 = "a/b/+";
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

    expect(subscriptionManager.acquireSubscription({
        operationId: 1,
        type: subscription_manager.SubscriptionType.EventStream,
        topicFilters: [filter1]
    })).toEqual(subscription_manager.AcquireSubscriptionResult.Subscribing);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0,1));

    adapter.completeSubscribe(filter1);

    let subscriptionOrphanedPromise = once(subscriptionManager, subscription_manager.SubscriptionManager.SUBSCRIPTION_ORPHANED);

    subscriptionManager.releaseSubscription({
        operationId: 1,
        topicFilters: [filter1],
    });

    let subscriptionOrphaned = (await subscriptionOrphanedPromise)[0];
    expect(subscriptionOrphaned.topicFilter).toEqual(filter1);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls.slice(0,1));

    subscriptionManager.purge();

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
}

test('Subscription Manager - Subscribed RequestResponse emits orphaned event on release', async () => {
    await doPurgeTest(subscription_manager.SubscriptionType.RequestResponse);
});

test('Subscription Manager - Subscribed Streaming emits orphaned event on release', async () => {
    await doPurgeTest(subscription_manager.SubscriptionType.EventStream);
});