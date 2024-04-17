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
import {NativeResourceMixin} from "./native_resource";
import {BufferedEventEmitter} from "../common/event";
import {
    mqtt_request_response_client_close,
    mqtt_request_response_client_new_from_311,
    mqtt_request_response_client_new_from_5,
    mqtt_streaming_operation_close,
    mqtt_streaming_operation_new,
    mqtt_streaming_operation_open
} from "./binding";

export * from "../common/mqtt_request_response";

enum StreamingOperationState {
    None,
    Open,
    Closed,
}

/**
 * An AWS MQTT service streaming operation.  A streaming operation listens to messages on
 * a particular topic, deserializes them using a service model, and emits the modeled data as Javascript events.
 */
export class StreamingOperation extends NativeResourceMixin(BufferedEventEmitter) implements mqtt_request_response.IStreamingOperation {

    private state = StreamingOperationState.None;

    static new(options: mqtt_request_response.StreamingOperationOptions, client: RequestResponseClient) : StreamingOperation {
        let operation = new StreamingOperation();
        operation._super(mqtt_streaming_operation_new(operation, options, client.native_handle()));

        return operation;
    }

    private constructor() {
        super();
    }

    /**
     * Triggers the streaming operation to start listening to the configured stream of events.  It is an error
     * to open a streaming operation more than once or re-open a closed streaming operation.
     */
    open() : void {
        if (this.state != StreamingOperationState.None) {
            throw new CrtError("MQTT streaming operation not in an openable state");
        }

        this.state = StreamingOperationState.Open;
        mqtt_streaming_operation_open(this.native_handle());
    }

    /**
     * Stops a streaming operation from listening to the configured stream of events and releases all native
     * resources associated with the stream.
     */
    close(): void {
        if (this.state != StreamingOperationState.Closed) {
            this.state = StreamingOperationState.Closed;
            mqtt_streaming_operation_close(this.native_handle());
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
}

enum RequestResponseClientState {
    Ready,
    Closed
}

/**
 * Native implementation of an MQTT-based request-response client tuned for AWS MQTT services.
 *
 * Supports streaming operations (listen to a stream of modeled events from an MQTT topic) and request-response
 * operations (performs the subscribes, publish, and incoming publish correlation and error checking needed to
 * perform simple request-response operations over MQTT).
 */
export class RequestResponseClient extends NativeResourceMixin(BufferedEventEmitter) implements mqtt_request_response.IRequestResponseClient {

    state: RequestResponseClientState = RequestResponseClientState.Ready;

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
        let client = new RequestResponseClient();
        client._super(mqtt_request_response_client_new_from_5(client, protocolClient.native_handle(), options));

        return client;
    }

    /**
     * Creates a new MQTT service request-response client that uses an MQTT311 client as the protocol implementation.
     *
     * @param protocolClient protocol client to use for all operations
     * @param options configuration options for the desired request-response client
     */
    static newFromMqtt311(protocolClient: MqttClientConnection, options: mqtt_request_response.RequestResponseClientOptions) : RequestResponseClient {
        let client = new RequestResponseClient();
        client._super(mqtt_request_response_client_new_from_311(client, protocolClient.native_handle(), options));

        return client;
    }

    /**
     * Triggers cleanup of native resources associated with the request-response client.  Closing a client will fail
     * all incomplete requests and close all outstanding streaming operations.
     *
     * This must be called when finished with a client; otherwise, native resources will leak.
     */
    close(): void {
        if (this.state != RequestResponseClientState.Closed) {
            this.state = RequestResponseClientState.Closed;
            mqtt_request_response_client_close(this.native_handle());
        }
    }

    /**
     * Creates a new streaming operation from a set of configuration options.  A streaming operation provides a
     * mechanism for listening to a specific event stream from an AWS MQTT-based service.
     *
     * @param streamOptions configuration options for the streaming operation
     */
    createStream(streamOptions: mqtt_request_response.StreamingOperationOptions) : StreamingOperation {
        if (this.state == RequestResponseClientState.Closed) {
            throw new CrtError("MQTT request-response client has already been closed");
        }

        return StreamingOperation.new(streamOptions, this);
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
        if (this.state == RequestResponseClientState.Closed) {
            throw new CrtError("MQTT request-response client has already been closed");
        }

        return new Promise<mqtt_request_response.Response>((resolve, reject) => {
            reject(new CrtError("NYI"));
        });
    }
}
