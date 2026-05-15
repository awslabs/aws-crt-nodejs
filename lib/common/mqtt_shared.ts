/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt_shared
 * @mergeTarget
 */

import { MqttWill } from './mqtt';
import * as event from "./event";
import * as mqtt5 from "./mqtt5";
import * as mqtt5_packet from "./mqtt5_packet";

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

/**
 * Base configuration options shared by all MQTT5 clients.
 *
 * This interface contains the common configuration properties used by both
 * browser and native MQTT5 client implementations. Platform-specific implementations
 * extend this interface with additional properties.
 *
 * @category MQTT5
 */
export interface Mqtt5ClientConfigBase {

    /**
     * Host name of the MQTT server to connect to.
     */
    hostName: string;

    /**
     * Network port of the MQTT server to connect to.
     */
    port: number;

    /**
     * Controls how the MQTT5 client should behave with respect to MQTT sessions.
     */
    sessionBehavior? : mqtt5.ClientSessionBehavior;

    /**
     * Controls how the reconnect delay is modified in order to smooth out the distribution of reconnection attempt
     * timepoints for a large set of reconnecting clients.
     */
    retryJitterMode? : mqtt5.RetryJitterType;

    /**
     * Minimum amount of time to wait to reconnect after a disconnect.  Exponential backoff is performed with jitter
     * after each connection failure.
     */
    minReconnectDelayMs? : number;

    /**
     * Maximum amount of time to wait to reconnect after a disconnect.  Exponential backoff is performed with jitter
     * after each connection failure.
     */
    maxReconnectDelayMs? : number;

    /**
     * Amount of time that must elapse with an established connection before the reconnect delay is reset to the minimum.
     * This helps alleviate bandwidth-waste in fast reconnect cycles due to permission failures on operations.
     */
    minConnectedTimeToResetReconnectDelayMs? : number;

    /**
     * All configurable options with respect to the CONNECT packet sent by the client, including the will.  These
     * connect properties will be used for every connection attempt made by the client.
     */
    connectProperties?: mqtt5_packet.ConnectPacket;

    /**
     * Additional controls for client behavior with respect to topic alias usage.
     *
     * If this setting is left undefined, then topic aliasing behavior will be disabled.
     */
    topicAliasingOptions? : mqtt5.TopicAliasingOptions;
}

