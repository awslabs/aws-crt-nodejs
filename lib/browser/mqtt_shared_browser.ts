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

    // will be defined only if there is a metadata query param entry and it is formatted correctly
    metadata?: [string, string][] = undefined;
}

const METADATA_KEY : string = "Metadata";
const SDK_KEY : string = "SDK";
const PLATFORM_KEY : string = "Platform";
const BROWSER_PLATFORM_VALUE : string = "Browser";
const BROWSER_METADATA_KEY : string = "Browser";
const QUERY_PARAM_START_DELIMITER : string = "?";
const QUERY_PAIR_DELIMITER : string = "&";
const METADATA_PAIR_DELIMITER : string = ";";
const KEY_VALUE_SEPARATOR : string = "=";
const METADATA_PREFIX : string = "(";
const METADATA_SUFFIX : string = ")";

// used to break up the query param string into key value pairs or the metadata value into key value pairs
function parseDelimitedKeyValueString(input: string, pairDelimiter: string, kvDelimiter: string) : Array<[string, string]> {
    let kvPairs = new Array<[string, string]>;

    let pairs = input.split(pairDelimiter);
    for (let pair of pairs) {
        if (pair.length == 0) {
            continue;
        }

        let kvDelimiterIndex = pair.indexOf(kvDelimiter);
        // just a key, no value?
        if (kvDelimiterIndex < 0) {
            kvPairs.push([pair, ""]);
        } else {
            let value = pair.substring(kvDelimiterIndex + 1);
            kvPairs.push([pair.substring(0, kvDelimiterIndex), value]);
        }
    }

    return kvPairs;
}

// splits the username into a prefix and query param key values.  If metadata is present and correctly formatted,
// it also splits the metadata into key value pairs.
function parseUsername(username?: string) : ParsedUsername {
    let parsed = new ParsedUsername();

    if (!username) {
        return parsed;
    }

    let queryIndex = username.lastIndexOf(QUERY_PARAM_START_DELIMITER);
    if (queryIndex < 0) {
        // no '?'
        parsed.prefix = username;
        return parsed;
    }

    parsed.prefix = username.substring(0, queryIndex);

    let remaining = username.substring(queryIndex + 1);
    parsed.queryParams = parseDelimitedKeyValueString(remaining, QUERY_PAIR_DELIMITER, KEY_VALUE_SEPARATOR);
    let seenMetadata = false;
    for (let pair of parsed.queryParams) {
        if (pair[0] === METADATA_KEY && !seenMetadata) {
            // only process the first instance of metadata
            seenMetadata = true;
            let metadataValue = pair[1];
            if (metadataValue !== undefined && metadataValue.length >= 2 && metadataValue.startsWith(METADATA_PREFIX) && metadataValue.endsWith(METADATA_SUFFIX)) {
                metadataValue = metadataValue.substring(METADATA_PREFIX.length, metadataValue.length - METADATA_SUFFIX.length);
                parsed.metadata = parseDelimitedKeyValueString(metadataValue, METADATA_PAIR_DELIMITER, KEY_VALUE_SEPARATOR);
            }
            break;
        }
    }

    return parsed;
}

// if this is ever public, we need to handle attempting to set metadata in a special way
function addTopLevelPair(parsed: ParsedUsername, key: string, value: string) {
    // no need to check for duplicates; when we build the final username we use the first value only
    parsed.queryParams.push([key, value]);
}

function addMetadataPair(parsed: ParsedUsername, key: string, value: string) {
    let hasMetadataKey = false;
    for (let pair of parsed.queryParams) {
        if (pair[0] === METADATA_KEY) {
            hasMetadataKey = true;
            break;
        }
    }

    // If we have malformed metadata (top level entry, but no parsed pairs), then don't do anything
    if (!parsed.metadata) {
        if (hasMetadataKey) {
            return;
        }

        parsed.metadata = new Array<[string, string]>();
    }

    // no need to check for duplicates; when we build the final username we use the first value only
    let strippedValue = value.replace(METADATA_PAIR_DELIMITER, "");
    parsed.metadata.push([key, strippedValue]);
}

// builds an ordered list of de-duped keys as well as a map of their values
function buildOrderedKeyValues(pairs?: Array<[string, string]>) : [Array<string>, Map<string, string>] {
    let keys: Array<string> = new Array<string>();
    let kvMap = new Map<string, string>();
    if (!pairs) {
        return [keys, kvMap];
    }

    pairs.forEach((pair) => {
       if (!kvMap.has(pair[0])) {
           kvMap.set(pair[0], pair[1]);
           keys.push(pair[0]);
       }
    });

    return [keys, kvMap];
}

function buildUsernameFromQueryParse(parsed: ParsedUsername) : string {
    let [queryKeys, queryValues] = buildOrderedKeyValues(parsed.queryParams);
    let [metadataKeys, metadataValues] = buildOrderedKeyValues(parsed.metadata);

    if (parsed.queryParams.length == 0 && !parsed.metadata) {
        return parsed.prefix;
    }

    // if we have valid metadata pairs, build the final metadata value
    let metadataValue : string | undefined = undefined;
    if (parsed.metadata && metadataKeys.length > 0) {
        let innerValue = metadataKeys.map((key) => {
            return `${key}${KEY_VALUE_SEPARATOR}${metadataValues.get(key) ?? ""}`;
        }).join(METADATA_PAIR_DELIMITER);
        metadataValue = METADATA_PREFIX + innerValue + METADATA_SUFFIX;
    }

    // if we have a final metadata value, replace any existing value and make sure it's in the key list
    if (metadataValue !== undefined) {
        if (queryValues.get(METADATA_KEY) === undefined) {
            queryKeys.push(METADATA_KEY);
        }
        queryValues.set(METADATA_KEY, metadataValue);
    }

    let queryParamValue = queryKeys.map((key) => `${key}${KEY_VALUE_SEPARATOR}${queryValues.get(key) ?? ""}` ).join(QUERY_PAIR_DELIMITER);
    return parsed.prefix + QUERY_PARAM_START_DELIMITER + queryParamValue;
}

export function buildFinalUsernameFromMetrics(metrics: mqtt_shared.AwsIoTDeviceSDKMetrics, username?: string) : string {
    let parsed = parseUsername(username);

    addTopLevelPair(parsed, SDK_KEY, metrics.libraryName);
    addTopLevelPair(parsed, PLATFORM_KEY, BROWSER_PLATFORM_VALUE);

    let browserInfo = window?.navigator?.userAgent ?? "unknown";
    addMetadataPair(parsed, BROWSER_METADATA_KEY, browserInfo);

    return buildUsernameFromQueryParse(parsed);
}