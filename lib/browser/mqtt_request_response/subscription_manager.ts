/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import {BufferedEventEmitter} from "../../common/event";
import * as protocol_adapter from "./protocol_adapter";

/**
 *
 * @packageDocumentation
 * @module mqtt_request_response
 *
 */

export interface SubscribeSuccessEvent {
    topicFilter: string,
    operationId: number,
}

export type SubscribeSuccessEventListener = (event: SubscribeSuccessEvent) => void;

export interface SubscribeFailureEvent {
    topicFilter: string,
    operationId: number,
}

export type SubscribeFailureEventListener = (event: SubscribeFailureEvent) => void;

export interface SubscriptionEndedEvent {
    topicFilter: string,
    operationId: number,
}

export type SubscriptionEndedEventListener = (event: SubscriptionEndedEvent) => void;

export interface StreamingSubscriptionEstablishedEvent {
    topicFilter: string,
    operationId: number,
}

export type StreamingSubscriptionEstablishedEventListener = (event: StreamingSubscriptionEstablishedEvent) => void;

export interface StreamingSubscriptionLostEvent {
    topicFilter: string,
    operationId: number,
}

export type StreamingSubscriptionLostEventListener = (event: StreamingSubscriptionLostEvent) => void;

export interface StreamingSubscriptionHaltedEvent {
    topicFilter: string,
    operationId: number,
}

export type StreamingSubscriptionHaltedEventListener = (event: StreamingSubscriptionHaltedEvent) => void;

export interface SubscriptionOrphanedEvent {
    topicFilter: string,
}

export type SubscriptionOrphanedEventListener = (event: SubscriptionOrphanedEvent) => void;

export interface UnsubscribeCompleteEvent {
    topicFilter: string,
}

export type UnsubscribeCompleteEventListener = (event: UnsubscribeCompleteEvent) => void;

export enum SubscriptionType {
    EventStream,
    RequestResponse,
}

export interface AcquireSubscriptionConfig {
    topicFilters: [string],
    operationId: number,
    type: SubscriptionType,
}

export interface ReleaseSubscriptionsConfig {
    topicFilters: [string],
    operationId: number,
}

export interface SubscriptionManagerConfig {
    maxRequestResponseSubscriptions: number,
    maxStreamingSubscriptions: number,
    operationTimeoutInSeconds: number,
}

export class SubscriptionManager extends BufferedEventEmitter {

    constructor(private adapter: protocol_adapter.ProtocolClientAdapter, private options: SubscriptionManagerConfig) {
        super();
    }

    close() {
        throw new CrtError("Unimplemented");
    }

    acquireSubscription(options: AcquireSubscriptionConfig) {
        throw new CrtError("Unimplemented");
    }

    releaseSubscription(options: ReleaseSubscriptionsConfig) {
        throw new CrtError("Unimplemented");
    }

    purge() {
        throw new CrtError("Unimplemented");
    }

    static SUBSCRIBE_SUCCESS : string = 'subscribeSuccess';
    static SUBSCRIBE_FAILURE : string = 'subscribeFailure';
    static SUBSCRIPTION_ENDED : string = 'subscriptionEnded';
    static STREAMING_SUBSCRIPTION_ESTABLISHED : string = "streamingSubscriptionEstablished";
    static STREAMING_SUBSCRIPTION_LOST : string = "streamingSubscriptionLost";
    static STREAMING_SUBSCRIPTION_HALTED : string = "streamingSubscriptionHalted";
    static SUBSCRIPTION_ORPHANED : string = "subscriptionOrphaned";
    static UNSUBSCRIBE_COMPLETE : string = "unsubscribeComplete";

    on(event: 'subscribeSuccess', listener: SubscribeSuccessEventListener): this;
    on(event: 'subscribeFailure', listener: SubscribeFailureEventListener): this;
    on(event: 'subscriptionEnded', listener: SubscriptionEndedEventListener): this;
    on(event: 'streamingSubscriptionEstablished', listener: StreamingSubscriptionEstablishedEventListener): this;
    on(event: 'streamingSubscriptionLost', listener: StreamingSubscriptionLostEventListener): this;
    on(event: 'streamingSubscriptionHalted', listener: StreamingSubscriptionHaltedEventListener): this;
    on(event: 'subscriptionOrphaned', listener: SubscriptionOrphanedEventListener): this;
    on(event: 'unsubscribeComplete', listener: UnsubscribeCompleteEventListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }
}