/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt_shared
 * @mergeTarget
 */

import * as mqtt5 from "./mqtt5";
import * as event from "./event";

/**
 * Converts payload to Buffer or string regardless of the supplied type
 * @param payload The payload to convert
 * @internal
 */
export function normalize_payload(payload: any): Buffer | string {
    if (payload instanceof Buffer) {
        // pass Buffer through
        return payload;
    }
    if (typeof payload === 'string') {
        // pass string through
        return payload;
    }
    if (ArrayBuffer.isView(payload)) {
        // return Buffer with view upon the same bytes (no copy)
        const view = payload as ArrayBufferView;
        return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
    }
    if (payload instanceof ArrayBuffer) {
        // return Buffer with view upon the same bytes (no copy)
        return Buffer.from(payload);
    }
    if (typeof payload === 'object') {
        // Convert Object to JSON string
        return JSON.stringify(payload);
    }

    if (!payload) {
        return "";
    }

    throw new TypeError("payload parameter must be a string, object, or DataView.");
}

/**
 * Converts payload to Buffer only, regardless of the supplied type
 * @param payload The payload to convert
 * @internal
 */
export function normalize_payload_to_buffer(payload: any): Buffer {
    let normalized = normalize_payload(payload);
    if (typeof normalized === 'string') {
        // pass string through
        return Buffer.from(new TextEncoder().encode(normalized).buffer);
    }

    return normalized;
}

/**
 * SDK name used for metrics and identification
 * @internal
 */
export const SDK_NAME : string = "IoTDeviceSDK/JS";

/**
 * IoT Device SDK Metrics Structure
 * @internal
 */
export class AwsIoTDeviceSDKMetrics {
    /**
     * Name of the library
     */
    libraryName: string = SDK_NAME;
}

/** @internal */
export const DEFAULT_KEEP_ALIVE : number = 1200;

/** @internal */
export interface TopicProperties {
    isValid: boolean;
    isShared: boolean;
    hasWildcard: boolean;
}

/** @internal */
export function computeTopicProperties(topic: string, isFilter: boolean) : TopicProperties {
    let properties : TopicProperties = {
        isValid: false,
        isShared: false,
        hasWildcard: false
    };

    if (topic.length === 0) {
        return properties;
    }

    let hasSharePrefix : boolean = false;
    let hasShareName : boolean = false;
    let sawHash : boolean = false;
    let index : number = 0;
    for (let segment of topic.split('/')) {
        if (sawHash) {
            return properties;
        }

        if (segment.includes("+")) {
            if (!isFilter) {
                return properties;
            }

            if (segment.length > 1) {
                return properties;
            }

            properties.hasWildcard = true;
        }

        if (segment.includes("#")) {
            if (!isFilter) {
                return properties;
            }

            if (segment.length > 1) {
                return properties;
            }

            properties.hasWildcard = true;
            sawHash = true;
        }

        if (index == 0 && segment === "$share") {
            hasSharePrefix = true;
        }

        if (index == 1 && hasSharePrefix && segment.length > 0 && !properties.hasWildcard) {
            hasShareName = true;
        }

        if (hasShareName && ((index == 2 && segment.length > 0) || index > 2)) {
            properties.isShared = true;
        }

        index += 1;
    }

    properties.isValid = true;

    return properties;
}

/** @internal */
export function isValidTopicFilter(topicFilter: any) : boolean {
    if (typeof(topicFilter) !== 'string') {
        return false;
    }

    let properties = computeTopicProperties(topicFilter as string, true);
    return properties.isValid;
}

/** @internal */
export function isValidTopic(topic: any) : boolean {
    if (typeof(topic) !== 'string') {
        return false;
    }

    let properties = computeTopicProperties(topic as string, false);
    return properties.isValid;
}

function randomInRange(min: number, max: number) : number {
    return min + (max - min) * Math.random();
}

/** @internal */
export interface ReconnectDelayContext {
    retryJitterMode?: mqtt5.RetryJitterType,
    minReconnectDelayMs? : number,
    maxReconnectDelayMs? : number,
    lastReconnectDelay? : number,
    connectionFailureCount : number,
}

const DEFAULT_MIN_RECONNECT_DELAY_MS : number = 1000;
const DEFAULT_MAX_RECONNECT_DELAY_MS : number = 120000;

/** @internal */
export const MAXIMUM_VARIABLE_LENGTH_INTEGER : number= 268435455;

/** @internal */
export const MAXIMUM_PACKET_SIZE : number = 5 + MAXIMUM_VARIABLE_LENGTH_INTEGER;

/** @internal */
export const DEFAULT_RECEIVE_MAXIMUM : number = 65535;

function getOrderedReconnectDelayBounds(configMin: number | undefined, configMax: number | undefined) : [number, number] {
    const minDelay : number = Math.max(1, configMin ?? DEFAULT_MIN_RECONNECT_DELAY_MS);
    const maxDelay : number = Math.max(1, configMax ?? DEFAULT_MAX_RECONNECT_DELAY_MS);
    if (minDelay > maxDelay) {
        return [maxDelay, minDelay];
    } else {
        return [minDelay, maxDelay];
    }
}

/**
 * Computes the next reconnect delay based on the Jitter/Retry configuration.
 * Implements jitter calculations in https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 * @internal
 */
export function calculateNextReconnectDelay(context: ReconnectDelayContext) : number {
    const jitterType : mqtt5.RetryJitterType = context.retryJitterMode ?? mqtt5.RetryJitterType.Default;
    const [minDelay, maxDelay] : [number, number] = getOrderedReconnectDelayBounds(context.minReconnectDelayMs, context.maxReconnectDelayMs);
    const clampedFailureCount : number = Math.min(52, context.connectionFailureCount);
    let delay : number = 0;

    if (jitterType == mqtt5.RetryJitterType.None) {
        delay = minDelay * Math.pow(2, clampedFailureCount);
    } else if (jitterType == mqtt5.RetryJitterType.Decorrelated && context.lastReconnectDelay) {
        delay = randomInRange(minDelay, 3 * context.lastReconnectDelay);
    } else {
        delay = randomInRange(minDelay, Math.min(maxDelay, minDelay * Math.pow(2, clampedFailureCount)));
    }

    delay = Math.min(maxDelay, delay);

    return delay;
}

export type PublishAcknowledgementFunctor = () => void;

/**
 * Wrapper class containing a one-use singleton handle that can be used to trigger sending the acknowledgement (Puback in
 * QoS 1, Pubrec in QoS 2) packet for an incoming publish.
 */
export class PublishAcknowledgementHandleWrapper {

    private ackHandle : PublishAcknowledgementHandle | null;

    constructor(handle : PublishAcknowledgementHandle | null) {
        this.ackHandle = handle;
    }

    /**
     * Attempt to take the acknowledgement handle held by the wrapper.  This will only succeed for the first caller;
     * after the initial call, null will be returned.  By taking the handle, the caller assumes responsibility
     * for sending the acknowledgement packet associated with the incoming publish packet.  Failing to trigger the
     * acknowledgement will cause the broker to potentially re-send the publish.
     */
    acquireHandle() : PublishAcknowledgementHandle | null {
        let handle = this.ackHandle;
        this.ackHandle = null;

        return handle;
    }
}

function movePublishAcknowledgementHandleWrapper(wrapper: PublishAcknowledgementHandleWrapper | undefined, compositionFunctor?: PublishAcknowledgementFunctor) : PublishAcknowledgementHandleWrapper | undefined {
    if (wrapper) {
        let handle = wrapper.acquireHandle();
        if (compositionFunctor && handle) {
            let interiorHandle = handle;
            handle = new PublishAcknowledgementHandle(() => {
                interiorHandle.invokeAcknowledgement();
                compositionFunctor();
            });
        }

        return new PublishAcknowledgementHandleWrapper(handle);
    }

    return undefined;
}

/** @internal */
export function emitAcknowledgeableEvent<T>(emitter: event.BufferedEventEmitter, ackEvent: string, ackEventPayload: T, wrapperFieldName: string, ackHandleWrapper?: PublishAcknowledgementHandleWrapper, compositionFunctor?: PublishAcknowledgementFunctor) : void {
    ackHandleWrapper = movePublishAcknowledgementHandleWrapper(ackHandleWrapper, compositionFunctor);
    if (ackHandleWrapper) {
        (ackEventPayload as any)[wrapperFieldName] = ackHandleWrapper;
        emitter.emitWithCallback(ackEvent, () => {
            if (ackHandleWrapper) {
                let handle = ackHandleWrapper.acquireHandle();
                if (handle) {
                    // Even if corked, all listeners have had a chance to react to the event
                    // and acquire the acknowledgement handle if they wanted to.  If no one did so, then we do it ourselves.
                    handle.invokeAcknowledgement();
                }
            }
        }, ackEventPayload);
    } else {
        emitter.emit(ackEvent, ackEventPayload);
    }
}

/** @internal */
export function queueAcknowledgeableEvent<T>(emitter: event.BufferedEventEmitter, ackEvent: string, ackEventPayload: T, wrapperFieldName: string, ackHandleWrapper?: PublishAcknowledgementHandleWrapper, compositionFunctor?: PublishAcknowledgementFunctor) : void {
    let wrapper : PublishAcknowledgementHandleWrapper | undefined = movePublishAcknowledgementHandleWrapper(ackHandleWrapper, compositionFunctor);

    queueMicrotask(() => {
        if (wrapper) {
            (ackEventPayload as any)[wrapperFieldName] = wrapper;
            emitter.emitWithCallback(ackEvent, () => {
                if (wrapper) {
                    let handle = wrapper.acquireHandle();
                    if (handle) {
                        // Even if corked, all listeners have had a chance to react to the event
                        // and acquire the acknowledgement handle if they wanted to.  If no one did so, then we do it ourselves.
                        handle.invokeAcknowledgement();
                    }
                }
            }, ackEventPayload);
        } else {
            emitter.emit(ackEvent, ackEventPayload);
        }
    });
}

/**
 * Object that allows the holder to trigger the acknowledgement for an associated publish packet.
 */
export class PublishAcknowledgementHandle {

    private acknowledgementFunction? : PublishAcknowledgementFunctor;

    constructor(acknowledgementFunction : PublishAcknowledgementFunctor) {
        this.acknowledgementFunction = acknowledgementFunction;
    }

    /**
     * trigger the acknowledgement for an associated Publish packet
     */
    invokeAcknowledgement() : void {
        let acknowledgementFunction = this.acknowledgementFunction;
        this.acknowledgementFunction = undefined;
        if (acknowledgementFunction) {
            acknowledgementFunction();
        }
    }
}

