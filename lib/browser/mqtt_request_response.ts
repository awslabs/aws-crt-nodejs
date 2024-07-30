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

import * as protocol_client_adapter from "./mqtt_request_response/protocol_adapter";
import * as subscription_manager from "./mqtt_request_response/subscription_manager";
import {MqttClientConnection} from "./mqtt";
import {Mqtt5Client} from "./mqtt5";
import * as mqtt_request_response from "../common/mqtt_request_response";
import * as mqtt_request_response_internal from "../common/mqtt_request_response_internal";
import {BufferedEventEmitter} from "../common/event";
import {CrtError} from "./error";
import {IStreamingOperation, StreamingOperationOptions} from "../common/mqtt_request_response";

export * from "../common/mqtt_request_response";

enum OperationState {
    /* creation -> in event loop enqueue */
    None,

    /* in event loop queue -> non blocked response from subscription manager */
    Queued,

    /* subscribing response from sub manager -> subscription success/failure event */
    PendingSubscription,

    /* (request only) subscription success -> (publish failure OR correlated response received) */
    PendingResponse,

    /* (streaming only) subscription success -> (operation finished OR subscription ended event) */
    Subscribed,

    /* (streaming only) (subscription failure OR subscription ended) -> operation close/terminate */
    Terminal,

    /* (request only) the operation's destroy task has been scheduled but not yet executed */
    PendingDestroy,
}

enum OperationType {
    RequestResponse,
    Streaming
}

interface Operation {
    id: number,
    type: OperationType,
    options: mqtt_request_response.RequestResponseOperationOptions | mqtt_request_response.StreamingOperationOptions,
    state: OperationState,
    liftedPromise?: LiftedPromise<>
}

/**
 * Native implementation of an MQTT-based request-response client tuned for AWS MQTT services.
 *
 * Supports streaming operations (listen to a stream of modeled events from an MQTT topic) and request-response
 * operations (performs the subscribes, publish, and incoming publish correlation and error checking needed to
 * perform simple request-response operations over MQTT).
 */
export class RequestResponseClient extends BufferedEventEmitter implements mqtt_request_response.IRequestResponseClient {

    private operationTimeoutInSeconds: number,
    private nextOperationId: number = 1;
    private protocolClientAdapter : protocol_client_adapter.ProtocolClientAdapter;
    private subscriptionManager : subscription_manager.SubscriptionManager;
    private state: mqtt_request_response_internal.RequestResponseClientState = mqtt_request_response_internal.RequestResponseClientState.Ready;

    private operations : Map<number, RequestResponseOperation> = new Map<number, RequestResponseOperation>();
    private operationQueue : Array<number> = new Array<number>;

    private constructor(protocolClientAdapter: protocol_client_adapter.ProtocolClientAdapter, options: mqtt_request_response.RequestResponseClientOptions) {
        super();

        this.protocolClientAdapter = protocolClientAdapter;
        this.operationTimeoutInSeconds = options.operationTimeoutInSeconds ?? 60;

        let config : subscription_manager.SubscriptionManagerConfig = {
            maxRequestResponseSubscriptions: options.maxRequestResponseSubscriptions,
            maxStreamingSubscriptions: options.maxStreamingSubscriptions,
            operationTimeoutInSeconds: this.operationTimeoutInSeconds,
        }

        this.subscriptionManager = new subscription_manager.SubscriptionManager(protocolClientAdapter, config);

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

        let adapter = protocol_client_adapter.ProtocolClientAdapter.newFrom5(protocolClient);
        let client = new RequestResponseClient(adapter, options);

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

        let adapter = protocol_client_adapter.ProtocolClientAdapter.newFrom311(protocolClient);
        let client = new RequestResponseClient(adapter, options);

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

            // TOFIX
            //crt_native.mqtt_request_response_client_close(this.native_handle());
        }
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

        let id = this.nextOperationId;
        this.nextOperationId++;

        let operation : Operation = {
            id: id,
            type: OperationType.RequestResponse,
            options: requestOptions,
            state: OperationState.Queued,
        }

        this.operations.set(id, operation);
        this.operationQueue.push(id);

        setTimeout(() => {
            this.cancelOperation(id);
        }, this.operationTimeoutInSeconds * 1000)

        throw new CrtError("NYI");
        /*
        return new Promise<mqtt_request_response.Response>((resolve, reject) => {
            function curriedPromiseCallback(errorCode: number, topic?: string, response?: ArrayBuffer){
                return RequestResponseClient._s_on_request_completion(resolve, reject, errorCode, topic, response);
            }

            try {
                // TOFIX
                // crt_native.mqtt_request_response_client_submit_request(this.native_handle(), requestOptions, curriedPromiseCallback);
            } catch (e) {
                reject(e);
            }
        });*/
    }

    /**
     * Creates a new streaming operation from a set of configuration options.  A streaming operation provides a
     * mechanism for listening to a specific event stream from an AWS MQTT-based service.
     *
     * @param streamOptions configuration options for the streaming operation
     *
     * browser/node implementers are covariant by returning an implementation of IStreamingOperation.  This split
     * is necessary because event listening (which streaming operations need) cannot be modeled on an interface.
     */
    createStream(streamOptions: StreamingOperationOptions) : IStreamingOperation {
        // NYI
        throw new CrtError("NYI");
    }

    private closeStreamingOperations() : void {
        // NYI
    }
}