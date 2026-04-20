/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 */

import { MqttWill } from './mqtt';

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

/**
 * Base configuration options shared by all MQTT connections.
 *
 * This interface contains the common configuration properties used by both
 * browser and native MQTT client connections. Platform-specific implementations
 * extend this interface with additional properties.
 *
 * @category MQTT
 */
export interface MqttConnectionConfigBase {
    /**
     * ID to place in CONNECT packet. Must be unique across all devices/clients.
     * If an ID is already in use, the other client will be disconnected.
     */
    client_id: string;

    /** Server name to connect to */
    host_name: string;

    /** Server port to connect to */
    port: number;

    /**
     * Whether or not to start a clean session with each reconnect.
     * If True, the server will forget all subscriptions with each reconnect.
     * Set False to request that the server resume an existing session
     * or start a new session that may be resumed after a connection loss.
     * The `session_present` bool in the connection callback informs
     * whether an existing session was successfully resumed.
     * If an existing session is resumed, the server remembers previous subscriptions
     * and sends messages (with QoS1 or higher) that were published while the client was offline.
     */
    clean_session?: boolean;

    /**
     * The keep alive value, in seconds, to send in CONNECT packet.
     * A PING will automatically be sent at this interval.
     * The server will assume the connection is lost if no PING is received after 1.5X this value.
     * This duration must be longer than {@link ping_timeout}.
     */
    keep_alive?: number;

    /**
     * Milliseconds to wait for ping response before client assumes
     * the connection is invalid and attempts to reconnect.
     * This duration must be shorter than keep_alive_secs.
     * Alternatively, TCP keep-alive via :attr:`SocketOptions.keep_alive`
     * may accomplish this in a more efficient (low-power) scenario,
     * but keep-alive options may not work the same way on every platform and OS version.
     */
    ping_timeout?: number;

    /**
     * Milliseconds to wait for the response to the operation requires response by protocol.
     * Set to zero to disable timeout. Otherwise, the operation will fail if no response is
     * received within this amount of time after the packet is written to the socket.
     * It applied to PUBLISH (QoS>0) and UNSUBSCRIBE now.
     */
    protocol_operation_timeout?: number;

    /**
     * Minimum seconds to wait between reconnect attempts.
     * Must be <= {@link reconnect_max_sec}.
     * Wait starts at min and doubles with each attempt until max is reached.
     */
    reconnect_min_sec?: number;

    /**
     * Maximum seconds to wait between reconnect attempts.
     * Must be >= {@link reconnect_min_sec}.
     * Wait starts at min and doubles with each attempt until max is reached.
     */
    reconnect_max_sec?: number;

    /**
     * Will to send with CONNECT packet. The will is
     * published by the server when its connection to the client is unexpectedly lost.
     */
    will?: MqttWill;

    /** Username to connect with */
    username?: string;

    /** Password to connect with */
    password?: string;

    /** Disable Aws IoT SDK Metrics. The metrics includes SDK name, version, and platform.*/
    disable_metrics?: boolean;
}
