/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 */


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
        return Buffer.from(normalized);
    }

    return normalized;
}

/** @internal */
export const DEFAULT_KEEP_ALIVE : number = 1200;

export interface TopicProperties {
    isValid: boolean;
    isShared: boolean;
    hasWildcard: boolean;
}

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

export function isValidTopicFilter(topicFilter: any) : boolean {
    if (typeof(topicFilter) !== 'string') {
        return false;
    }

    let properties = computeTopicProperties(topicFilter as string, true);
    return properties.isValid;
}

export function isValidTopic(topic: any) : boolean {
    if (typeof(topic) !== 'string') {
        return false;
    }

    let properties = computeTopicProperties(topic as string, false);
    return properties.isValid;
}
