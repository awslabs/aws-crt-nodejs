/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {ICrtError} from "./error";

/**
 * @packageDocumentation
 * @module mqtt_request_response
 */

export type RequestPayload = string;
export type ResponsePayload = ArrayBuffer;
export type StreamingPayload = ArrayBuffer;

/**
 * The type of change to the state of a streaming operation subscription
 */
export enum SubscriptionStatusEventType {

    /**
     * The streaming operation is successfully subscribed to its topic (filter)
     */
    SubscriptionEstablished = 0,

    /**
     * The streaming operation has temporarily lost its subscription to its topic (filter)
     */
    SubscriptionLost = 1,

    /**
     * The streaming operation has entered a terminal state where it has given up trying to subscribe
     * to its topic (filter).  This is always due to user error (bad topic filter or IoT Core permission policy).
     */
    SubscriptionHalted = 2,
}

/**
 * An event that describes a change in subscription status for a streaming operation.
 */
export interface SubscriptionStatusEvent {

    /**
     * The type of status change represented by the event
     */
    type: SubscriptionStatusEventType,

    /**
     * Describes an underlying reason for the event.  Only set for SubscriptionLost and SubscriptionHalted.
     */
    error?: ICrtError,
}

/**
 * An event that describes an incoming message on a streaming operation.
 */
export interface IncomingPublishEvent {

    /**
     * The payload of the incoming message.
     */
    payload: StreamingPayload
}

/**
 * Signature for a handler that listens to subscription status events.
 */
export type SubscriptionStatusListener = (eventData: SubscriptionStatusEvent) => void;

/**
 * Signature for a handler that listens to incoming publish events.
 */
export type IncomingPublishListener = (eventData: IncomingPublishEvent) => void;

/**
 * Encapsulates a response to an AWS IoT Core MQTT-based service request
 */
export interface Response {

    /**
     * Payload of the response that correlates to a submitted request.
     */
    payload: ResponsePayload,

    /**
     * MQTT Topic that the response was received on.  Different topics map to different types within the
     * service model, so we need this value in order to know what to deserialize the payload into.
     */
    topic: string
}

/**
 * A response path is a pair of values - MQTT topic and a JSON path - that describe how a response to
 * an MQTT-based request may arrive.  For a given request type, there may be multiple response paths and each
 * one is associated with a separate JSON schema for the response body.
 */
export interface ResponsePath {

    /**
     * MQTT topic that a response may arrive on.
     */
    topic: string,

    /**
     * JSON path for finding correlation tokens within payloads that arrive on this path's topic.
     */
    correlationTokenJsonPath?: string
}

/**
 * Configuration options for an MQTT-based request-response operation.
 */
export interface RequestResponseOperationOptions {

    /**
     * Set of topic filters that should be subscribed to in order to cover all possible response paths.  Sometimes
     * using wildcards can cut down on the subscriptions needed; other times that isn't valid.
     */
    subscriptionTopicFilters : Array<string>,

    /**
     * Set of all possible response paths associated with this request type.
     */
    responsePaths: Array<ResponsePath>,

    /**
     * Topic to publish the request to once response subscriptions have been established.
     */
    publishTopic: string,

    /**
     * Payload to publish to 'publishTopic' in order to initiate the request
     */
    payload: RequestPayload,

    /**
     * Correlation token embedded in the request that must be found in a response message.  This can be null
     * to support certain services which don't use correlation tokens.  In that case, the client
     * only allows one token-less request at a time.
     */
    correlationToken?: string
}

/**
 * Configuration options for an MQTT-based streaming operation.
 */
export interface StreamingOperationOptions {

    /**
     * Topic filter that the streaming operation should listen on
     */
    subscriptionTopicFilter: string,
}

/**
 * Shared interface for an AWS MQTT service streaming operation.  A streaming operation listens to messages on
 * a particular topic, deserializes them using a service model, and emits the modeled data as Javascript events.
 */
export interface IStreamingOperation {

    /**
     * Triggers the streaming operation to start listening to the configured stream of events.  It is an error
     * to open a streaming operation more than once.  You cannot re-open a closed streaming operation.
     */
    open() : void;

    /**
     * Stops a streaming operation from listening to the configured stream of events.  It is an error to attempt to
     * use the stream for anything further after calling close().
     */
    close(): void;
}

/**
 * MQTT-based request-response client configuration options
 */
export interface RequestResponseClientOptions {

    /**
     * Maximum number of subscriptions that the client will concurrently use for request-response operations
     */
    maxRequestResponseSubscriptions: number,

    /**
     * Maximum number of subscriptions that the client will concurrently use for streaming operations
     */
    maxStreamingSubscriptions: number,

    /**
     * Duration, in seconds, that a request-response operation will wait for completion before giving up
     */
    operationTimeoutInSeconds?: number,
}

/**
 * Shared interface for MQTT-based request-response clients tuned for AWS MQTT services.
 *
 * Supports streaming operations (listen to a stream of modeled events from an MQTT topic) and request-response
 * operations (performs the subscribes, publish, and incoming publish correlation and error checking needed to
 * perform simple request-response operations over MQTT).
 */
export interface IRequestResponseClient {

    /**
     * Shuts down the request-response client.  Closing a client will fail all incomplete requests and close all
     * outstanding streaming operations.
     *
     * It is not valid to invoke any further operations on the client after close() has been called.
     */
    close(): void;

    /**
     * Creates a new streaming operation from a set of configuration options.  A streaming operation provides a
     * mechanism for listening to a specific event stream from an AWS MQTT-based service.
     *
     * @param streamOptions configuration options for the streaming operation
     *
     * browser/node implementers are covariant by returning an implementation of IStreamingOperation.  This split
     * is necessary because event listening (which streaming operations need) cannot be modeled on an interface.
     */
    createStream(streamOptions: StreamingOperationOptions) : IStreamingOperation;

    /**
     * Submits a request to the request-response client.
     *
     * @param requestOptions description of the request to perform
     *
     * Returns a promise that resolves to a response to the request or an error describing how the request attempt
     * failed.
     *
     * A "successful" request-response execution flow is defined as "the service sent a response payload that
     * correlates with the request payload."  Upon deserialization (which is the responsibility of the service model
     * client, one layer up), such a payload may actually indicate a failure.
     */
    submitRequest(requestOptions: RequestResponseOperationOptions): Promise<Response>;
}

