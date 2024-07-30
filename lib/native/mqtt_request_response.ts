/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 *
 * @packageDocumentation
 * @module mqtt_request_response
 * @mergeTarget
 *
 */

import {CrtError} from "./error";
import {MqttClientConnection} from "./mqtt";
import {Mqtt5Client} from "./mqtt5";
import * as mqtt_request_response from "../common/mqtt_request_response";
import * as mqtt_request_response_internal from "../common/mqtt_request_response_internal";
import {NativeResourceMixin} from "./native_resource";
import {BufferedEventEmitter} from "../common/event";
import crt_native from './binding';
import { error_code_to_string } from "./io";

export * from "../common/mqtt_request_response";



/**
 * An AWS MQTT service streaming operation.  A streaming operation listens to messages on
 * a particular topic, deserializes them using a service model, and emits the modeled data as Javascript events.
 */
export class StreamingOperationBase extends NativeResourceMixin(BufferedEventEmitter) implements mqtt_request_response.IStreamingOperation {

    private client: RequestResponseClient;
    private state = mqtt_request_response_internal.StreamingOperationState.None;

    static new(options: mqtt_request_response.StreamingOperationOptions, client: RequestResponseClient) : StreamingOperationBase {
        if (!options) {
            throw new CrtError("invalid configuration for streaming operation");
        }

        let operation = new StreamingOperationBase(client);
        operation._super(crt_native.mqtt_streaming_operation_new(
            operation,
            client.native_handle(),
            options,
            (streamingOperation: StreamingOperationBase, type: mqtt_request_response.SubscriptionStatusEventType, error_code: number) => {
                StreamingOperationBase._s_on_subscription_status_update(operation, type, error_code);
            },
            (streamingOperation: StreamingOperationBase, publishEvent: mqtt_request_response.IncomingPublishEvent) => {
                StreamingOperationBase._s_on_incoming_publish(operation, publishEvent);
            }));

        client.registerUnclosedStreamingOperation(operation);

        return operation;
    }

    private constructor(client: RequestResponseClient) {
        super();
        this.client = client;
    }

    /**
     * Triggers the streaming operation to start listening to the configured stream of events.  Has no effect on an
     * already-open operation.  It is an error to attempt to re-open a closed streaming operation.
     */
    open() : void {
        if (this.state == mqtt_request_response_internal.StreamingOperationState.None) {
            this.state = mqtt_request_response_internal.StreamingOperationState.Open;
            crt_native.mqtt_streaming_operation_open(this.native_handle());
        } else if (this.state != mqtt_request_response_internal.StreamingOperationState.Open) {
            throw new CrtError("MQTT streaming operation not in an openable state");
        }
    }

    /**
     * Stops a streaming operation from listening to the configured stream of events and releases all native
     * resources associated with the stream.
     */
    close(): void {
        if (this.state != mqtt_request_response_internal.StreamingOperationState.Closed) {
            this.client.unregisterUnclosedStreamingOperation(this);
            this.state = mqtt_request_response_internal.StreamingOperationState.Closed;
            crt_native.mqtt_streaming_operation_close(this.native_handle());
        }
    }

    /**
     * Event emitted when the stream's subscription status changes.
     *
     * Listener type: {@link SubscriptionStatusListener}
     *
     * @event
     */
    static SUBSCRIPTION_STATUS : string = 'subscriptionStatus';

    /**
     * Event emitted when a stream message is received
     *
     * Listener type: {@link IncomingPublishListener}
     *
     * @event
     */
    static INCOMING_PUBLISH : string = 'incomingPublish';

    on(event: 'subscriptionStatus', listener: mqtt_request_response.SubscriptionStatusListener): this;

    on(event: 'incomingPublish', listener: mqtt_request_response.IncomingPublishListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    private static _s_on_subscription_status_update(streamingOperation: StreamingOperationBase, type: mqtt_request_response.SubscriptionStatusEventType, error_code: number) : void {
        let statusEvent : mqtt_request_response.SubscriptionStatusEvent = {
            type: type
        };

        if (error_code != 0) {
            statusEvent.error = new CrtError(error_code)
        }

        process.nextTick(() => {
            streamingOperation.emit(StreamingOperationBase.SUBSCRIPTION_STATUS, statusEvent);
        });
    }

    private static _s_on_incoming_publish(streamingOperation: StreamingOperationBase, publishEvent: mqtt_request_response.IncomingPublishEvent) : void {
        process.nextTick(() => {
            streamingOperation.emit(StreamingOperationBase.INCOMING_PUBLISH, publishEvent);
        });
    }
}



/**
 * Native implementation of an MQTT-based request-response client tuned for AWS MQTT services.
 *
 * Supports streaming operations (listen to a stream of modeled events from an MQTT topic) and request-response
 * operations (performs the subscribes, publish, and incoming publish correlation and error checking needed to
 * perform simple request-response operations over MQTT).
 */
export class RequestResponseClient extends NativeResourceMixin(BufferedEventEmitter) implements mqtt_request_response.IRequestResponseClient {

    private state: mqtt_request_response_internal.RequestResponseClientState = mqtt_request_response_internal.RequestResponseClientState.Ready;
    private unclosedOperations? : Set<StreamingOperationBase> = new Set<StreamingOperationBase>();

    private constructor() {
        super();
    }

    /**
     * Creates a new MQTT service request-response client that uses an MQTT5 client as the protocol implementation.
     *
     * @param protocolClient protocol client to use for all operations
     * @param options configuration options for the desired request-response client
     */
    static newFromMqtt5(protocolClient: Mqtt5Client, options: mqtt_request_response.RequestResponseClientOptions): RequestResponseClient {
        if (!protocolClient) {
            throw new CrtError("protocol client is null");
        }

        let client = new RequestResponseClient();
        client._super(crt_native.mqtt_request_response_client_new_from_5(client, protocolClient.native_handle(), options));

        return client;
    }

    /**
     * Creates a new MQTT service request-response client that uses an MQTT311 client as the protocol implementation.
     *
     * @param protocolClient protocol client to use for all operations
     * @param options configuration options for the desired request-response client
     */
    static newFromMqtt311(protocolClient: MqttClientConnection, options: mqtt_request_response.RequestResponseClientOptions) : RequestResponseClient {
        if (!protocolClient) {
            throw new CrtError("protocol client is null");
        }

        let client = new RequestResponseClient();
        client._super(crt_native.mqtt_request_response_client_new_from_311(client, protocolClient.native_handle(), options));

        return client;
    }

    /**
     * Triggers cleanup of native resources associated with the request-response client.  Closing a client will fail
     * all incomplete requests and close all outstanding streaming operations.
     *
     * This must be called when finished with a client; otherwise, native resources will leak.
     */
    close(): void {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Closed) {
            this.state = mqtt_request_response_internal.RequestResponseClientState.Closed;
            this.closeStreamingOperations();
            crt_native.mqtt_request_response_client_close(this.native_handle());
        }
    }

    /**
     * Creates a new streaming operation from a set of configuration options.  A streaming operation provides a
     * mechanism for listening to a specific event stream from an AWS MQTT-based service.
     *
     * @param streamOptions configuration options for the streaming operation
     */
    createStream(streamOptions: mqtt_request_response.StreamingOperationOptions) : StreamingOperationBase {
        if (this.state == mqtt_request_response_internal.RequestResponseClientState.Closed) {
            throw new CrtError("MQTT request-response client has already been closed");
        }

        return StreamingOperationBase.new(streamOptions, this);
    }

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
    async submitRequest(requestOptions: mqtt_request_response.RequestResponseOperationOptions): Promise<mqtt_request_response.Response> {
        if (this.state == mqtt_request_response_internal.RequestResponseClientState.Closed) {
            throw new CrtError("MQTT request-response client has already been closed");
        }

        if (!requestOptions) {
            throw new CrtError("null request options");
        }

        return new Promise<mqtt_request_response.Response>((resolve, reject) => {
            function curriedPromiseCallback(errorCode: number, topic?: string, response?: ArrayBuffer){
                return RequestResponseClient._s_on_request_completion(resolve, reject, errorCode, topic, response);
            }

            try {
                crt_native.mqtt_request_response_client_submit_request(this.native_handle(), requestOptions, curriedPromiseCallback);
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     *
     * Adds a streaming operation to the set of operations that will be closed automatically when the
     * client is closed.
     *
     * @internal
     *
     * @param operation streaming operation to add
     */
    registerUnclosedStreamingOperation(operation: StreamingOperationBase) : void {
        if (this.unclosedOperations) {
            this.unclosedOperations.add(operation);
        }
    }

    /**
     *
     * Removes a streaming operation from the set of operations that will be closed automatically when the
     * client is closed.
     *
     * @internal
     *
     * @param operation streaming operation to remove
     */
    unregisterUnclosedStreamingOperation(operation: StreamingOperationBase) : void {
        if (this.unclosedOperations) {
            this.unclosedOperations.delete(operation);
        }
    }

    private closeStreamingOperations() : void {
        if (this.unclosedOperations) {
            // swap out the set so that calls to unregisterUnclosedStreamingOperation do not mess with things mid-iteration
            let unclosedOperations = this.unclosedOperations;
            this.unclosedOperations = undefined;

            for (const operation of unclosedOperations) {
                operation.close();
            }
        }
    }

    private static _s_on_request_completion(resolve : (value: (mqtt_request_response.Response | PromiseLike<mqtt_request_response.Response>)) => void, reject : (reason?: any) => void, errorCode: number, topic?: string, payload?: ArrayBuffer) {
        if (errorCode == 0 && topic !== undefined && payload !== undefined) {
            let response : mqtt_request_response.Response = {
                payload : payload,
                topic: topic,
            }
            resolve(response);
        } else {
            reject(error_code_to_string(errorCode));
        }
    }
}
