/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt_shared
 */

import * as mqtt_shared from "../common/mqtt_shared";
import * as mqtt5 from "../common/mqtt5";

/**
 * Converts payload to Buffer only, regardless of the supplied type
 * @param payload The payload to convert
 * @internal
 */
export function normalize_payload_to_buffer(payload: any): Buffer {
    let normalized = mqtt_shared.normalize_payload(payload);
    if (typeof normalized === 'string') {
        // pass string through
        return Buffer.from(new TextEncoder().encode(normalized).buffer);
    }

    return normalized;
}

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