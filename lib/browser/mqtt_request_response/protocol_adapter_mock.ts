/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */


import * as protocol_adapter from "./protocol_adapter";
import {BufferedEventEmitter} from "../../common/event";
import {ICrtError} from "../../common/error";
import * as subscription_manager from "./subscription_manager";
import {IncomingPublishEventListener} from "./protocol_adapter";


export interface ProtocolAdapterApiCall {
    methodName: string;
    args: any;
}

export interface MockProtocolAdapterOptions {
    subscribeHandler?: (adapter: MockProtocolAdapter, subscribeOptions: protocol_adapter.SubscribeOptions, context?: any) => void,
    subscribeHandlerContext?: any,
    unsubscribeHandler?: (adapter: MockProtocolAdapter, unsubscribeOptions: protocol_adapter.UnsubscribeOptions, context?: any) => void,
    unsubscribeHandlerContext?: any,
    publishHandler?: (adapter: MockProtocolAdapter, publishOptions: protocol_adapter.PublishOptions, context?: any) => void,
    publishHandlerContext?: any,
}

export class MockProtocolAdapter extends BufferedEventEmitter {

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

        if (this.options && this.options.publishHandler) {
            this.options.publishHandler(this, publishOptions, this.options.publishHandlerContext);
        }
    }

    subscribe(subscribeOptions : protocol_adapter.SubscribeOptions) : void {
        this.apiCalls.push({
            methodName: "subscribe",
            args: subscribeOptions
        });

        if (this.options && this.options.subscribeHandler) {
            this.options.subscribeHandler(this, subscribeOptions, this.options.subscribeHandlerContext);
        }
    }

    unsubscribe(unsubscribeOptions : protocol_adapter.UnsubscribeOptions) : void {
        this.apiCalls.push({
            methodName: "unsubscribe",
            args: unsubscribeOptions
        });

        if (this.options && this.options.unsubscribeHandler) {
            this.options.unsubscribeHandler(this, unsubscribeOptions,this.options.unsubscribeHandlerContext);
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

        // TODO - rework tests to pass with deferred event emission
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

        // TODO - rework tests to pass with deferred event emission
        this.emit(protocol_adapter.ProtocolClientAdapter.UNSUBSCRIBE_COMPLETION, event);
    }

    completePublish(completionData: any, err?: ICrtError) : void {
        let event : protocol_adapter.PublishCompletionEvent = {
            completionData: completionData
        };

        if (err) {
            event.err = err;
        }

        this.emit(protocol_adapter.ProtocolClientAdapter.PUBLISH_COMPLETION, event);
    }

    triggerIncomingPublish(topic: string, payload: ArrayBuffer) : void {
        let event : protocol_adapter.IncomingPublishEvent = {
            topic : topic,
            payload: payload
        };

        this.emit(protocol_adapter.ProtocolClientAdapter.INCOMING_PUBLISH, event);
    }

    // Events
    on(event: 'publishCompletion', listener: protocol_adapter.PublishCompletionEventListener): this;

    on(event: 'subscribeCompletion', listener: protocol_adapter.SubscribeCompletionEventListener): this;

    on(event: 'unsubscribeCompletion', listener: protocol_adapter.UnsubscribeCompletionEventListener): this;

    on(event: 'connectionStatus', listener: protocol_adapter.ConnectionStatusEventListener): this;

    on(event: 'incomingPublish', listener: IncomingPublishEventListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }
}

export interface SubscriptionManagerEvent {
    type: subscription_manager.SubscriptionEventType,
    data: any,
};

export function subscriptionManagerEventSequenceContainsEvent(eventSequence: SubscriptionManagerEvent[], expectedEvent: SubscriptionManagerEvent) : boolean {
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

export function subscriptionManagerEventSequenceContainsEvents(eventSequence: SubscriptionManagerEvent[], expectedEvents: SubscriptionManagerEvent[]) : boolean {
    for (let expectedEvent of expectedEvents) {
        if (!subscriptionManagerEventSequenceContainsEvent(eventSequence, expectedEvent)) {
            return false;
        }
    }

    return true;
}

export function protocolAdapterApiCallSequenceContainsApiCall(apiCallSequence: ProtocolAdapterApiCall[], expectedApiCall: ProtocolAdapterApiCall) : boolean {
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

export function protocolAdapterApiCallSequenceContainsApiCalls(apiCallSequence: ProtocolAdapterApiCall[], expectedApiCalls: ProtocolAdapterApiCall[]) : boolean {
    for (let expectedApiCall of expectedApiCalls) {
        if (!protocolAdapterApiCallSequenceContainsApiCall(apiCallSequence, expectedApiCall)) {
            return false;
        }
    }

    return true;
}