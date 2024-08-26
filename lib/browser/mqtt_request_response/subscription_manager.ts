/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {BufferedEventEmitter} from "../../common/event";
import * as protocol_adapter from "./protocol_adapter";
import * as io from "../../common/io";

/**
 *
 * @packageDocumentation
 * @module mqtt_request_response
 *
 */

// exported for tests only
export enum SubscriptionEventType {
    SubscribeSuccess,
    SubscribeFailure,
    SubscriptionEnded,
    StreamingSubscriptionEstablished,
    StreamingSubscriptionLost,
    StreamingSubscriptionHalted,
    SubscriptionOrphaned,
    UnsubscribeComplete
}

function subscriptionEventTypeToString(eventType: SubscriptionEventType) : string {
    switch (eventType) {
        case SubscriptionEventType.SubscribeSuccess:
            return "SubscribeSuccess";
        case SubscriptionEventType.SubscribeFailure:
            return "SubscribeFailure";
        case SubscriptionEventType.SubscriptionEnded:
            return "SubscriptionEnded";
        case SubscriptionEventType.StreamingSubscriptionEstablished:
            return "StreamingSubscriptionEstablished";
        case SubscriptionEventType.StreamingSubscriptionLost:
            return "StreamingSubscriptionLost";
        case SubscriptionEventType.StreamingSubscriptionHalted:
            return "StreamingSubscriptionHalted";
        case SubscriptionEventType.SubscriptionOrphaned:
            return "SubscriptionOrphaned";
        case SubscriptionEventType.UnsubscribeComplete:
            return "UnsubscribeComplete";
        default:
            return "Unknown";
    }
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

export function acquireSubscriptionResultToString(result: AcquireSubscriptionResult) : string {
    switch (result) {
        case AcquireSubscriptionResult.Subscribed:
            return "Subscribed";
        case AcquireSubscriptionResult.Subscribing:
            return "Subscribing";
        case AcquireSubscriptionResult.Blocked:
            return "Blocked";
        case AcquireSubscriptionResult.NoCapacity:
            return "NoCapacity";
        case AcquireSubscriptionResult.Failure:
            return "Failure";
        default:
            return "Unknown";
    }
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

    /*
     * A poisoned record represents a subscription that we will never try to subscribe to because a previous
     * attempt resulted in a failure that we judge to be "terminal."  Terminal failures include permission failures
     * and validation failures.  To remove a poisoned record, all listeners must be removed.  For request-response
     * operations this will happen naturally.  For streaming operations, the operation must be closed by the user (in
     * response to the user-facing event we emit on the streaming operation when the failure that poisons the
     * record occurs).
     */
    poisoned: boolean,
}

interface SubscriptionStats {
    requestResponseCount: number,
    streamingCount: number,
    unsubscribingStreamingCount: number,
}

export class SubscriptionManager extends BufferedEventEmitter {
    private static logSubject : string = "SubscriptionManager";

    private closed: boolean = false;
    private records: Map<string, SubscriptionRecord>;

    constructor(private adapter: protocol_adapter.ProtocolClientAdapter, private options: SubscriptionManagerConfig) {
        super();

        this.records = new Map<string, SubscriptionRecord>();

        this.adapter.addListener(protocol_adapter.ProtocolClientAdapter.SUBSCRIBE_COMPLETION, this.handleSubscribeCompletionEvent.bind(this));
        this.adapter.addListener(protocol_adapter.ProtocolClientAdapter.UNSUBSCRIBE_COMPLETION, this.handleUnsubscribeCompletionEvent.bind(this));
        this.adapter.addListener(protocol_adapter.ProtocolClientAdapter.CONNECTION_STATUS, this.handleConnectionStatusEvent.bind(this));
    }

    close() {
        this.closed = true;

        this.unsubscribeAll();
    }

    acquireSubscription(options: AcquireSubscriptionConfig) : AcquireSubscriptionResult {
        if (this.closed) {
            return AcquireSubscriptionResult.Failure;
        }

        if (options.topicFilters.length == 0) {
            return AcquireSubscriptionResult.Failure;
        }

        for (let topicFilter of options.topicFilters) {
            let existingRecord = this.records.get(topicFilter);
            if (!existingRecord) {
                continue;
            }

            if (existingRecord.poisoned) {
                io.logError(SubscriptionManager.logSubject, `acquire subscription for '${topicFilter}' via operation '${options.operationId}' failed - existing subscription is poisoned and has not been released`);
                return AcquireSubscriptionResult.Failure;
            }
            if (existingRecord.type != options.type) {
                io.logError(SubscriptionManager.logSubject, `acquire subscription for '${topicFilter}' via operation '${options.operationId}' failed - conflicts with subscription type of existing subscription`);
                return AcquireSubscriptionResult.Failure;
            }
        }

        let subscriptionsNeeded : number = 0;
        for (let topicFilter of options.topicFilters) {
            let existingRecord = this.records.get(topicFilter);
            if (existingRecord) {
                if (existingRecord.pendingAction == SubscriptionPendingAction.Unsubscribing) {
                    io.logDebug(SubscriptionManager.logSubject, `acquire subscription for '${topicFilter}' via operation '${options.operationId}' blocked - existing subscription is unsubscribing`);
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
                    io.logDebug(SubscriptionManager.logSubject, `acquire subscription for request operation '${options.operationId}' blocked - insufficient room`);
                    return AcquireSubscriptionResult.Blocked;
                }
            } else {
                if (subscriptionsNeeded + stats.streamingCount > this.options.maxStreamingSubscriptions) {
                    if (subscriptionsNeeded + stats.streamingCount <= this.options.maxStreamingSubscriptions + stats.unsubscribingStreamingCount) {
                        io.logDebug(SubscriptionManager.logSubject, `acquire subscription for streaming operation '${options.operationId}' blocked - insufficient room`);
                        return AcquireSubscriptionResult.Blocked;
                    } else {
                        io.logError(SubscriptionManager.logSubject, `acquire subscription for streaming operation '${options.operationId}' failed - insufficient room`);
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
            io.logDebug(SubscriptionManager.logSubject, `added listener '${options.operationId}' to subscription '${topicFilter}', ${existingRecord.listeners.size} listeners total`);

            if (existingRecord.status != SubscriptionStatus.Subscribed) {
                isFullySubscribed = false;
            }
        }

        if (isFullySubscribed) {
            io.logDebug(SubscriptionManager.logSubject, `acquire subscription for operation '${options.operationId}' fully subscribed - all required subscriptions are active`);
            return AcquireSubscriptionResult.Subscribed;
        }

        for (let topicFilter of options.topicFilters) {
            let existingRecord = this.records.get(topicFilter);
            try {
                // @ts-ignore
                this.activateSubscription(existingRecord);
            } catch (err) {
                io.logError(SubscriptionManager.logSubject, `acquire subscription for operation '${options.operationId}' failed subscription activation: ${(err as Error).toString()}`);
                return AcquireSubscriptionResult.Failure;
            }
        }

        io.logDebug(SubscriptionManager.logSubject, `acquire subscription for operation '${options.operationId}' subscribing - waiting on one or more subscriptions to complete`);
        return AcquireSubscriptionResult.Subscribing;
    }

    releaseSubscription(options: ReleaseSubscriptionsConfig) {
        if (this.closed) {
            return;
        }

        for (let topicFilter of options.topicFilters) {
            this.removeSubscriptionListener(topicFilter, options.operationId);
        }
    }

    purge() {
        if (this.closed) {
            return;
        }

        io.logDebug(SubscriptionManager.logSubject, `purging unused subscriptions`);
        let toRemove : Array<string> = new Array<string>();
        for (let [_, record] of this.records) {
            if (record.listeners.size > 0) {
                continue;
            }

            io.logDebug(SubscriptionManager.logSubject, `subscription '${record.topicFilter}' has zero listeners and is a candidate for removal`);

            if (this.adapter.getConnectionState() == protocol_adapter.ConnectionState.Connected) {
                this.unsubscribe(record, false);
            }

            if (record.status == SubscriptionStatus.NotSubscribed && record.pendingAction == SubscriptionPendingAction.Nothing) {
                toRemove.push(record.topicFilter);
            }
        }

        for (let topicFilter of toRemove) {
            io.logDebug(SubscriptionManager.logSubject, `deleting subscription '${topicFilter}'`);
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

        io.logDebug(SubscriptionManager.logSubject, `Current stats -- ${stats.requestResponseCount} request-response subscription records, ${stats.streamingCount} event stream subscription records, ${stats.unsubscribingStreamingCount} unsubscribing event stream subscriptions`);

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
            io.logDebug(SubscriptionManager.logSubject, `subscription '${record.topicFilter}' has no listeners but is not in a state that allows unsubscribe yet`);
            return;
        }

        try {
            this.adapter.unsubscribe({
                topicFilter: record.topicFilter,
                timeoutInSeconds: this.options.operationTimeoutInSeconds
            });
        } catch (err) {
            io.logError(SubscriptionManager.logSubject, `synchronous unsubscribe failure for '${record.topicFilter}': ${(err as Error).toString()}`);
            return;
        }

        io.logDebug(SubscriptionManager.logSubject, `unsubscribe submitted for '${record.topicFilter}'`);

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

        let remainingListenerCount: number = record.listeners.size;
        io.logDebug(SubscriptionManager.logSubject, `removed listener '${operationId}' from '${record.topicFilter}', ${remainingListenerCount} listeners left`);
        if (remainingListenerCount > 0) {
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

            io.logDebug(SubscriptionManager.logSubject, `emitting ${subscriptionEventTypeToString(eventType)} subscription event for '${record.topicFilter}' with id ${id}`);

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

        if (this.adapter.getConnectionState() != protocol_adapter.ConnectionState.Connected || record.listeners.size == 0) {
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

            io.logDebug(SubscriptionManager.logSubject, `initiated subscribe operation for '${record.topicFilter}'`);

            record.pendingAction = SubscriptionPendingAction.Subscribing;
        } catch (err) {
            io.logError(SubscriptionManager.logSubject, `synchronous failure subscribing to '${record.topicFilter}': ${(err as Error).toString()}`);

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
            if (event.retryable && !this.closed) {
                this.activateSubscription(record);
            } else {
                record.poisoned = true;
                this.emitEvents(record, SubscriptionEventType.StreamingSubscriptionHalted);
            }
        }
    }

    private handleSubscribeCompletionEvent(event: protocol_adapter.SubscribeCompletionEvent) {
        io.logDebug(SubscriptionManager.logSubject, ` received a protocol adapter subscribe completion event: ${JSON.stringify(event)}`);

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
        io.logDebug(SubscriptionManager.logSubject, ` received a protocol adapter unsubscribe completion event: ${JSON.stringify(event)}`);

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
            let topicFilter = record.topicFilter;

            setImmediate(() => {
                this.emit(SubscriptionManager.UNSUBSCRIBE_COMPLETE, {
                    topicFilter: topicFilter
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
        io.logDebug(SubscriptionManager.logSubject, ` received a protocol adapter connection status event: ${JSON.stringify(event)}`);

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

