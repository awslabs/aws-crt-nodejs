/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import {BufferedEventEmitter} from "../../common/event";
import * as protocol_adapter from "./protocol_adapter";
import {ConnectionState} from "./protocol_adapter";

/**
 *
 * @packageDocumentation
 * @module mqtt_request_response
 *
 */

enum SubscriptionEventType {
    SubscribeSuccess,
    SubscribeFailure,
    SubscriptionEnded,
    StreamingSubscriptionEstablished,
    StreamingSubscriptionLost,
    StreamingSubscriptionHalted,
    SubscriptionOrphaned,
    UnsubscribeComplete
}

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
    topicFilters: Array<string>,
    operationId: number,
    type: SubscriptionType,
}

export interface ReleaseSubscriptionsConfig {
    topicFilters: Array<string>,
    operationId: number,
}

export enum AcquireSubscriptionResult {
    Subscribed,
    Subscribing,
    Blocked,
    NoCapacity,
    Failure,
}

export interface SubscriptionManagerConfig {
    maxRequestResponseSubscriptions: number,
    maxStreamingSubscriptions: number,
    operationTimeoutInSeconds: number,
}

enum SubscriptionStatus {
    Subscribed,
    NotSubscribed,
}

enum SubscriptionPendingAction {
    Nothing,
    Subscribing,
    Unsubscribing,
}

interface SubscriptionRecord {
    topicFilter: string,
    listeners: Set<number>,
    status: SubscriptionStatus,
    pendingAction: SubscriptionPendingAction,
    type: SubscriptionType,
    poisoned: boolean,
}

interface SubscriptionStats {
    requestResponseCount: number,
    streamingCount: number,
    unsubscribingStreamingCount: number,
}

export class SubscriptionManager extends BufferedEventEmitter {

    private records: Map<string, SubscriptionRecord>;

    constructor(private adapter: protocol_adapter.ProtocolClientAdapter, private options: SubscriptionManagerConfig) {
        super();

        this.records = new Map<string, SubscriptionRecord>();

        this.adapter.addListener(protocol_adapter.ProtocolClientAdapter.SUBSCRIBE_COMPLETION, this.handleSubscribeCompletionEvent.bind(this));
        this.adapter.addListener(protocol_adapter.ProtocolClientAdapter.UNSUBSCRIBE_COMPLETION, this.handleUnsubscribeCompletionEvent.bind(this));
        this.adapter.addListener(protocol_adapter.ProtocolClientAdapter.CONNECTION_STATUS, this.handleConnectionStatusEvent.bind(this));
    }

    close() {
        throw new CrtError("Unimplemented");
    }

    acquireSubscription(options: AcquireSubscriptionConfig) : AcquireSubscriptionResult {
        if (options.topicFilters.length == 0) {
            return AcquireSubscriptionResult.Failure;
        }

        for (let topicFilter of options.topicFilters) {
            let existingRecord = this.records.get(topicFilter);
            if (!existingRecord) {
                continue;
            }

            if (existingRecord.poisoned || (existingRecord.type != options.type)) {
                return AcquireSubscriptionResult.Failure;
            }
        }

        let subscriptionsNeeded : number = 0;
        for (let topicFilter of options.topicFilters) {
            let existingRecord = this.records.get(topicFilter);
            if (existingRecord) {
                if (existingRecord.pendingAction == SubscriptionPendingAction.Unsubscribing) {
                    return AcquireSubscriptionResult.Blocked;
                }
            } else {
                subscriptionsNeeded++;
            }
        }

        if (subscriptionsNeeded > 0) {
            let stats = this.getStats();
            if (options.type == SubscriptionType.RequestResponse) {
                if (subscriptionsNeeded > this.options.maxRequestResponseSubscriptions - stats.requestResponseCount) {
                    return AcquireSubscriptionResult.Blocked;
                }
            } else {
                if (subscriptionsNeeded + stats.streamingCount > this.options.maxStreamingSubscriptions) {
                    if (subscriptionsNeeded + stats.streamingCount <= this.options.maxStreamingSubscriptions + stats.unsubscribingStreamingCount) {
                        return AcquireSubscriptionResult.Blocked;
                    } else {
                        return AcquireSubscriptionResult.NoCapacity;
                    }
                }
            }
        }

        let isFullySubscribed = true;
        for (let topicFilter of options.topicFilters) {
            let existingRecord = this.records.get(topicFilter);
            if (!existingRecord) {
                existingRecord = {
                    topicFilter: topicFilter,
                    listeners: new Set<number>(),
                    status: SubscriptionStatus.NotSubscribed,
                    pendingAction: SubscriptionPendingAction.Nothing,
                    type: options.type,
                    poisoned: false,
                };

                this.records.set(topicFilter, existingRecord);
            }

            existingRecord.listeners.add(options.operationId);
            if (existingRecord.status != SubscriptionStatus.Subscribed) {
                isFullySubscribed = false;
            }
        }

        if (isFullySubscribed) {
            return AcquireSubscriptionResult.Subscribed;
        }

        for (let topicFilter of options.topicFilters) {
            let existingRecord = this.records.get(topicFilter);
            try {
                // @ts-ignore
                this.activateSubscription(existingRecord);
            } catch (err) {
                return AcquireSubscriptionResult.Failure;
            }
        }

        return AcquireSubscriptionResult.Subscribing;
    }

    releaseSubscription(options: ReleaseSubscriptionsConfig) {
        for (let topicFilter of options.topicFilters) {
            this.removeSubscriptionListener(topicFilter, options.operationId);
        }
    }

    purge() {
        let toRemove : Array<string> = new Array<string>();
        for (let [_, record] of this.records) {
            if (record.listeners.size > 0) {
                continue;
            }

            if (this.adapter.getConnectionState() == ConnectionState.Connected) {
                this.unsubscribe(record, false);
            }

            if (record.status == SubscriptionStatus.Subscribed && record.pendingAction == SubscriptionPendingAction.Nothing) {
                toRemove.push(record.topicFilter);
            }
        }

        for (let topicFilter in toRemove) {
            this.records.delete(topicFilter);
        }
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

    private getStats() : SubscriptionStats {
        let stats : SubscriptionStats = {
            requestResponseCount: 0,
            streamingCount: 0,
            unsubscribingStreamingCount: 0,
        };

        for (let [_, value] of this.records) {
            if (value.type == SubscriptionType.RequestResponse) {
                stats.requestResponseCount++;
            } else if (value.type == SubscriptionType.EventStream) {
                stats.streamingCount++;
                if (value.pendingAction == SubscriptionPendingAction.Unsubscribing) {
                    stats.unsubscribingStreamingCount++;
                }
            }
        }

        return stats;
    }

    private unsubscribe(record: SubscriptionRecord, isShutdown: boolean) {
        const currentlySubscribed = record.status == SubscriptionStatus.Subscribed;
        const currentlySubscribing = record.pendingAction == SubscriptionPendingAction.Subscribing;
        const currentlyUnsubscribing = record.pendingAction == SubscriptionPendingAction.Unsubscribing;

        let shouldUnsubscribe = currentlySubscribed && !currentlyUnsubscribing;
        if (isShutdown) {
            shouldUnsubscribe = shouldUnsubscribe || currentlySubscribing;
        }

        if (!shouldUnsubscribe) {
            return;
        }

        try {
            this.adapter.unsubscribe({
                topicFilter: record.topicFilter,
                timeoutInSeconds: this.options.operationTimeoutInSeconds
            });
        } catch (err) {
            return;
        }

        record.pendingAction = SubscriptionPendingAction.Unsubscribing;
    }

    private unsubscribeAll() {
        for (let [_, value] of this.records) {
            this.unsubscribe(value, true);
        }
    }

    private removeSubscriptionListener(topicFilter: string, operationId: number) {
        let record = this.records.get(topicFilter);
        if (!record) {
            return;
        }

        record.listeners.delete(operationId);
        if (record.listeners.size > 0) {
            return;
        }

        setImmediate(() => {
           this.emit(SubscriptionManager.SUBSCRIPTION_ORPHANED, {
              topicFilter: topicFilter
           });
        });
    }


    private emitEvents(record: SubscriptionRecord, eventType: SubscriptionEventType) {
        for (let id of record.listeners) {
            let event = {
                topicFilter: record.topicFilter,
                operationId: id,
            };

            setImmediate(() => {
                switch (eventType) {
                    case SubscriptionEventType.SubscribeSuccess:
                        this.emit(SubscriptionManager.SUBSCRIBE_SUCCESS, event);
                        break;

                    case SubscriptionEventType.SubscribeFailure:
                        this.emit(SubscriptionManager.SUBSCRIBE_FAILURE, event);
                        break;

                    case SubscriptionEventType.SubscriptionEnded:
                        this.emit(SubscriptionManager.SUBSCRIPTION_ENDED, event);
                        break;

                    case SubscriptionEventType.StreamingSubscriptionEstablished:
                        this.emit(SubscriptionManager.STREAMING_SUBSCRIPTION_ESTABLISHED, event);
                        break;

                    case SubscriptionEventType.StreamingSubscriptionLost:
                        this.emit(SubscriptionManager.STREAMING_SUBSCRIPTION_LOST, event);
                        break;

                    case SubscriptionEventType.StreamingSubscriptionHalted:
                        this.emit(SubscriptionManager.STREAMING_SUBSCRIPTION_HALTED, event);
                        break;

                    default:
                        break;
                }
            });
        }
    }

    // this method re-throws dependent errors
    private activateSubscription(record: SubscriptionRecord) {
        if (record.poisoned) {
            return;
        }

        if (this.adapter.getConnectionState() != ConnectionState.Connected || record.listeners.size == 0) {
            return;
        }

        if (record.status != SubscriptionStatus.NotSubscribed || record.pendingAction != SubscriptionPendingAction.Nothing) {
            return;
        }

        try {
            this.adapter.subscribe({
                topicFilter: record.topicFilter,
                timeoutInSeconds: this.options.operationTimeoutInSeconds
            });

            record.pendingAction = SubscriptionPendingAction.Subscribing;
        } catch (err) {
            if (record.type == SubscriptionType.RequestResponse) {
                this.emitEvents(record, SubscriptionEventType.SubscribeFailure);
            } else {
                record.poisoned = true;
                this.emitEvents(record, SubscriptionEventType.StreamingSubscriptionHalted);
            }

            throw err;
        }
    }

    private handleRequestSubscribeCompletionEvent(record: SubscriptionRecord, event: protocol_adapter.SubscribeCompletionEvent) {
        record.pendingAction = SubscriptionPendingAction.Nothing;
        if (!event.err) {
            record.status = SubscriptionStatus.Subscribed;
            this.emitEvents(record, SubscriptionEventType.SubscribeSuccess);
        } else {
            this.emitEvents(record, SubscriptionEventType.SubscribeFailure);
        }
    }

    private handleStreamingSubscribeCompletionEvent(record: SubscriptionRecord, event: protocol_adapter.SubscribeCompletionEvent) {
        record.pendingAction = SubscriptionPendingAction.Nothing;
        if (!event.err) {
            record.status = SubscriptionStatus.Subscribed;
            this.emitEvents(record, SubscriptionEventType.StreamingSubscriptionEstablished);
        } else {
            // TODO: any way to get retryable from the subscribe failure?
            record.poisoned = true;
            this.emitEvents(record, SubscriptionEventType.StreamingSubscriptionHalted);
        }
    }

    private handleSubscribeCompletionEvent(event: protocol_adapter.SubscribeCompletionEvent) {
        let record = this.records.get(event.topicFilter);
        if (!record) {
            return;
        }

        if (record.pendingAction != SubscriptionPendingAction.Subscribing) {
            return;
        }

        if (record.type == SubscriptionType.RequestResponse) {
            this.handleRequestSubscribeCompletionEvent(record, event);
        } else {
            this.handleStreamingSubscribeCompletionEvent(record, event);
        }
    }

    private handleUnsubscribeCompletionEvent(event: protocol_adapter.UnsubscribeCompletionEvent) {
        let record = this.records.get(event.topicFilter);
        if (!record) {
            return;
        }

        if (record.pendingAction != SubscriptionPendingAction.Unsubscribing) {
            return;
        }

        record.pendingAction = SubscriptionPendingAction.Nothing;
        if (!event.err) {
            record.status = SubscriptionStatus.NotSubscribed;

            setImmediate(() => {
                this.emit(SubscriptionManager.UNSUBSCRIBE_COMPLETE, {
                    topicFilter: record.topicFilter
                });
            });
        }
    }

    private handleSessionLost() {
        let toRemove = new Array<string>();
        for (let [_, record] of this.records) {
            if (record.status != SubscriptionStatus.Subscribed) {
                continue;
            }

            record.status = SubscriptionStatus.NotSubscribed;
            if (record.type == SubscriptionType.RequestResponse) {
                this.emitEvents(record, SubscriptionEventType.SubscriptionEnded);
                if (record.pendingAction != SubscriptionPendingAction.Unsubscribing) {
                    toRemove.push(record.topicFilter);
                }
            } else {
                this.emitEvents(record, SubscriptionEventType.StreamingSubscriptionLost);
            }
        }

        for (let topicFilter in toRemove) {
            this.records.delete(topicFilter);
        }

        for (let [_, record] of this.records) {
            if (record.type == SubscriptionType.EventStream) {
                this.activateSubscription(record);
            }
        }
    }

    private activateIdleSubscriptions() {
        for (let [_, record] of this.records) {
            this.activateSubscription(record);
        }
    }

    private handleConnectionStatusEvent(event: protocol_adapter.ConnectionStatusEvent) {
        if (event.status != protocol_adapter.ConnectionState.Connected) {
            return;
        }

        if (!event.joinedSession) {
            this.handleSessionLost();
        }

        this.purge();
        this.activateIdleSubscriptions();
    }

}

