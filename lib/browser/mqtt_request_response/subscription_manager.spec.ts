/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */


import * as protocol_adapter from './protocol_adapter';
import {BufferedEventEmitter} from "../../common/event";
import * as subscription_manager from "./subscription_manager";
import {once} from "events";
import {newLiftedPromise} from "../../common/promise";

jest.setTimeout(10000);

interface ProtocolAdapterApiCall {
    methodName: string;
    args: any;
}

type PublishHandler = (mock: MockProtocolAdapter, options: protocol_adapter.PublishOptions) => void;
type SubscribeHandler = (mock: MockProtocolAdapter, options: protocol_adapter.SubscribeOptions) => void;
type UnsubscribeHandler = (mock: MockProtocolAdapter, options: protocol_adapter.UnsubscribeOptions) => void;

interface MockProtocolAdapterOptions {
    publishHandler?: PublishHandler,
    subscribeHandler?: SubscribeHandler,
    unsubscribeHandler?: UnsubscribeHandler,
}

class MockProtocolAdapter extends BufferedEventEmitter {

    private apiCalls: Array<ProtocolAdapterApiCall> = new Array<ProtocolAdapterApiCall>();
    private connectionState: protocol_adapter.ConnectionState = protocol_adapter.ConnectionState.Disconnected;

    constructor(private options: MockProtocolAdapterOptions) {
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

        if (this.options.publishHandler) {
            (this.options.publishHandler)(this, publishOptions);
        }
    }

    subscribe(subscribeOptions : protocol_adapter.SubscribeOptions) : void {
        this.apiCalls.push({
            methodName: "subscribe",
            args: subscribeOptions
        });

        if (this.options.subscribeHandler) {
            (this.options.subscribeHandler)(this, subscribeOptions);
        }
    }

    unsubscribe(unsubscribeOptions : protocol_adapter.UnsubscribeOptions) : void {
        this.apiCalls.push({
            methodName: "unsubscribe",
            args: unsubscribeOptions
        });

        if (this.options.unsubscribeHandler) {
            (this.options.unsubscribeHandler)(this, unsubscribeOptions);
        }
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

function createAllSuccessMockAdapterConfig() : MockProtocolAdapterOptions {
    return {
        subscribeHandler: (mockAdapter, subscribeOptions) => {
            setImmediate(() => {
                mockAdapter.emit(protocol_adapter.ProtocolClientAdapter.SUBSCRIBE_COMPLETION, {
                    topicFilter: subscribeOptions.topicFilter
                });
            });
        },
        unsubscribeHandler: (mockAdapter, unsubscribeOptions) => {
            setImmediate(() => {
                mockAdapter.emit(protocol_adapter.ProtocolClientAdapter.UNSUBSCRIBE_COMPLETION, {
                    topicFilter: unsubscribeOptions.topicFilter
                });
            });
        },
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
    let adapter = new MockProtocolAdapter(createAllSuccessMockAdapterConfig());
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

    let streamingSubscriptionEstablished = (await streamingSubscriptionEstablishedPromise)[0];
    expect(streamingSubscriptionEstablished.topicFilter).toEqual(filter3);
    expect(streamingSubscriptionEstablished.operationId).toEqual(3);

    expect(adapter.getApiCalls()).toEqual(expectedApiCalls);
});

test('Subscription Manager - Acquire Multiple Subscribing Success', async () => {
    let adapter = new MockProtocolAdapter(createAllSuccessMockAdapterConfig());
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

    await allPromise.promise;

    let successFilters = subscribeSuccesses.map((event) => {

    });
    expect(subscribeSuccesses).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                topicFilter: filter1,
                operationId: 1,
            })
        ])
    );
    expect(subscribeSuccesses).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                topicFilter: filter2,
                operationId: 1,
            })
        ])
    );

    expect(subscribeSuccesses.includes({
        topicFilter: filter1,
        operationId: 1,
    })).toBeTruthy();

    expect(subscribeSuccesses.indexOf({
        topicFilter: filter2,
        operationId: 1,
    })).toBeGreaterThan(-1);

    expect(adapter.getApiCalls().indexOf(expectedApiCalls[0])).toBeGreaterThan(-1);
    expect(adapter.getApiCalls().indexOf(expectedApiCalls[1])).toBeGreaterThan(-1);
});