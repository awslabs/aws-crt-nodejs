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

/** @internal */
export const DEFAULT_KEEP_ALIVE : number = 1200;


function isValidTopicInternal(topic: string, isFilter: boolean) : boolean {
    if (topic.length === 0 || topic.length > 65535) {
        return false;
    }

    let sawHash : boolean = false;
    for (let segment of topic.split('/')) {
        if (sawHash) {
            return false;
        }

        if (segment.length === 0) {
            continue;
        }

        if (segment.includes("+")) {
            if (!isFilter) {
                return false;
            }

            if (segment.length > 1) {
                return false;
            }
        }

        if (segment.includes("#")) {
            if (!isFilter) {
                return false;
            }

            if (segment.length > 1) {
                return false;
            }

            sawHash = true;
        }
    }

    return true;
}

export function isValidTopicFilter(topicFilter: any) : boolean {
    if (typeof(topicFilter) !== 'string') {
        return false;
    }

    let topicFilterAsString = topicFilter as string;

    return isValidTopicInternal(topicFilterAsString, true);
}

export function isValidTopic(topic: any) : boolean {
    if (typeof(topic) !== 'string') {
        return false;
    }

    let topicAsString = topic as string;

    return isValidTopicInternal(topicAsString, false);
}