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

class ParsedUsername {
    prefix: string = "";
    queryParams: [string, string][] = new Array<[string, string]>;
//    metadata: [string, string][] = new Array<[string, string]>;
}

const METADATA_KEY : string = "Metadata";
const SDK_KEY : string = "SDK";
const PLATFORM_KEY : string = "Platform";
const BROWSER_PLATFORM_VALUE : string = "Browser";
const BROWSER_METADATA_KEY : string = "Browser";

function parseDelimitedKeyValueString(input: string, pairDelimiter: string, kvDelimeter: string) : Array<[string, string]> | null {
    let kvPairs = new Array<[string, string]>;

    let pairs = input.split(pairDelimiter);
    for (let pair of pairs) {
        let kvDelimeterIndex = pair.indexOf(kvDelimeter);
        if (kvDelimeterIndex < 0) {
            kvPairs.push([pair, ""]);
        }

        let value = pair.substring(kvDelimeterIndex + 1);
        kvPairs.push([pair.substring(0, kvDelimeterIndex), value]);
    }

    if (kvPairs.length > 0) {
        return kvPairs;
    }

    return null;
}

function parseUsername(username?: string) : ParsedUsername {
    let parsed = new ParsedUsername();

    if (!username) {
        return parsed;
    }

    let queryIndex = username.lastIndexOf('?');
    if (queryIndex < 0) {
        parsed.prefix = username;
        return parsed;
    }

    parsed.prefix = username.substring(0, queryIndex);

    let remaining = username.substring(queryIndex + 1);
    let topLevelPairs = parseDelimitedKeyValueString(remaining, "&", "=");
    if (topLevelPairs) {
        parsed.queryParams = topLevelPairs;
        /*
        let metadataValue = topLevelPairs.get(METADATA_KEY);
        if (metadataValue !== undefined && metadataValue.length >= 2 && metadataValue[0] == '(' && metadataValue[metadataValue.length - 1] == ')') {
            metadataValue = metadataValue.substring(1, metadataValue.length - 2);
            let metadataMap = parseDelimitedKeyValueString(metadataValue, ";", "=");
            if (metadataMap) {
                parsed.metadata = metadataMap;
                parsed.queryParams.delete(METADATA_KEY);
            }
        }*/
    }

    return parsed;
}

function addTopLevelPairIfNonexistent(parsed: ParsedUsername, key: string, value: string) {
    if (parsed.queryParams.has(key)) {
        return;
    }

    parsed.queryParams.set(key, value);
}

function addMetadataPairIfNonExistent(parsed: ParsedUsername, key: string, value: string) {
    // can't add metadata pairs if there's an existing top-level metadata entry that is malformed
    if (parsed.queryParams.has(METADATA_KEY)) {
        return;
    }

    let metadataValue = parsed.metadata.get(key);
    if (metadataValue !== undefined) {
        return;
    }

    parsed.metadata.set(key, value);
}

function buildUsernameFromQueryParse(parsed: ParsedUsername) : string {
    let metadataValue = undefined;
    if (!parsed.queryParams.get(METADATA_KEY) && parsed.metadata.size > 0) {
        let innerValue = Array.from(parsed.metadata.entries()).map((pair) => pair.join("=")).join(";");
        metadataValue = "(" + innerValue + ")";
    }

    let topLevelParamArray = Array.from(parsed.queryParams.entries());
    if (metadataValue !== undefined) {
        topLevelParamArray.push([METADATA_KEY, metadataValue]);
    }

    let queryParamValue = topLevelParamArray.map((pair) => pair.join("=")).join(":");

    return parsed.prefix + "?" + queryParamValue;
}

export function buildFinalUsernameFromMetrics(metrics: mqtt_shared.AwsIoTDeviceSDKMetrics, username?: string) : string {
    let parsed = parseUsername(username);

    addTopLevelPairIfNonexistent(parsed, SDK_KEY, metrics.libraryName);
    addTopLevelPairIfNonexistent(parsed, PLATFORM_KEY, BROWSER_PLATFORM_VALUE);

    let browserInfo = window?.navigator?.userAgent ?? "unknown";
    addMetadataPairIfNonExistent(parsed, BROWSER_METADATA_KEY, browserInfo);

    return buildUsernameFromQueryParse(parsed);
}