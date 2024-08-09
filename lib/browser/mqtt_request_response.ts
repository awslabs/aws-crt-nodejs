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
import {LiftedPromise, newLiftedPromise} from "../common/promise";

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
    state: OperationState,
    pendingSubscriptionCount: number,
    inClientTables: boolean
}

interface RequestResponseOperation extends Operation {
    options: mqtt_request_response.RequestResponseOperationOptions,
    resultPromise: LiftedPromise<mqtt_request_response.Response>
}

interface StreamingOperation extends Operation {
    options: mqtt_request_response.StreamingOperationOptions
}

interface ResponsePathEntry {
    refCount: number,
    correlationTokenPath?: string[],
}

interface ServiceTaskWrapper {
    serviceTask : ReturnType<typeof setTimeout>;
    nextserviceTime : number;
}

/**
 * Native implementation of an MQTT-based request-response client tuned for AWS MQTT services.
 *
 * Supports streaming operations (listen to a stream of modeled events from an MQTT topic) and request-response
 * operations (performs the subscribes, publish, and incoming publish correlation and error checking needed to
 * perform simple request-response operations over MQTT).
 */
export class RequestResponseClient extends BufferedEventEmitter implements mqtt_request_response.IRequestResponseClient {

    private operationTimeoutInSeconds: number;
    private nextOperationId : number = 1;
    private protocolClientAdapter : protocol_client_adapter.ProtocolClientAdapter;
    private subscriptionManager : subscription_manager.SubscriptionManager;
    private state : mqtt_request_response_internal.RequestResponseClientState = mqtt_request_response_internal.RequestResponseClientState.Ready;
    private serviceTask? : ServiceTaskWrapper;

    private operations : Map<number, Operation> = new Map<number, Operation>();
    private streamingOperationsByTopicFilter : Map<string, Set<number>> = new Map<string, Set<number>>(); // topic filter -> set of operation ids
    private correlationTokenPathsByResponsePaths : Map<string, ResponsePathEntry> = new Map<string, ResponsePathEntry>(); // response topic -> response path entry
    private operationsByCorrelationToken : Map<string, number> = new Map<string, number>(); // correlation token -> operation id

    private operationQueue : Array<number> = new Array<number>;

    private constructor(protocolClientAdapter: protocol_client_adapter.ProtocolClientAdapter, options: mqtt_request_response.RequestResponseClientOptions) {
        super();

        this.operationTimeoutInSeconds = options.operationTimeoutInSeconds ?? 60;
        this.protocolClientAdapter = protocolClientAdapter;

        this.protocolClientAdapter.addListener(protocol_client_adapter.ProtocolClientAdapter.PUBLISH_COMPLETION, this.handlePublishCompletionEvent.bind(this));
        this.protocolClientAdapter.addListener(protocol_client_adapter.ProtocolClientAdapter.CONNECTION_STATUS, this.handleConnectionStatusEvent.bind(this));
        this.protocolClientAdapter.addListener(protocol_client_adapter.ProtocolClientAdapter.INCOMING_PUBLISH, this.handleIncomingPublishEvent.bind(this));

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
            this.closeAllOperations();

            this.protocolClientAdapter.close();
            this.subscriptionManager.close();
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

        let resultPromise : LiftedPromise<mqtt_request_response.Response> = newLiftedPromise();
        let operation : RequestResponseOperation = {
            id: id,
            type: OperationType.RequestResponse,
            state: OperationState.Queued,
            pendingSubscriptionCount: requestOptions.subscriptionTopicFilters.length,
            inClientTables: false,
            options: requestOptions,
            resultPromise: resultPromise,
        };

        this.operations.set(id, operation);
        this.operationQueue.push(id);

        setTimeout(() => {
            this.completeRequestResponseOperationWithError(id, new CrtError("Operation Timeout"));
        }, this.operationTimeoutInSeconds * 1000)

        this.wakeServiceTask();

        return resultPromise.promise;
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
    createStream(streamOptions: mqtt_request_response.StreamingOperationOptions) : mqtt_request_response.IStreamingOperation {
        // NYI
        throw new CrtError("NYI");
    }

    private canOperationDequeue(operation: Operation) : boolean {
        if (operation.type != OperationType.RequestResponse) {
            return true;
        }

        let rrOperation = operation as RequestResponseOperation;
        let correlationToken = rrOperation.options.correlationToken ?? "";

        return !this.operationsByCorrelationToken.has(correlationToken);
    }

    private static buildSuscriptionListFromOperation(operation : Operation) : string[] {
        if (operation.type == OperationType.RequestResponse) {
            let rrOperation = operation as RequestResponseOperation;
            return rrOperation.options.subscriptionTopicFilters;
        } else {
            let streamingOperation = operation as StreamingOperation;
            return new Array(streamingOperation.options.subscriptionTopicFilter);
        }
    }

    private addOperationToInProgressTables(operation: Operation) {
        if (operation.type == OperationType.Streaming) {
            let streamingOperation = operation as StreamingOperation;
            let filter = streamingOperation.options.subscriptionTopicFilter;
            let existingSet = this.streamingOperationsByTopicFilter.get(filter);
            if (!existingSet) {
                existingSet = new Set<number>();
                this.streamingOperationsByTopicFilter.set(filter, existingSet);
            }

            existingSet.add(operation.id);
        } else {
            let rrOperation = operation as RequestResponseOperation;

            this.operationsByCorrelationToken.set(rrOperation.options.correlationToken ?? "", operation.id);

            for (let path of rrOperation.options.responsePaths) {
                let existingEntry = this.correlationTokenPathsByResponsePaths.get(path.topic);
                if (!existingEntry) {
                    existingEntry = {
                        refCount: 0
                    };

                    if (path.correlationTokenJsonPath) {
                        existingEntry.correlationTokenPath = path.correlationTokenJsonPath.split('.');
                    }

                    this.correlationTokenPathsByResponsePaths.set(path.topic, existingEntry);
                }

                existingEntry.refCount++;
            }
        }
    }

    private makeOperationRequest(operation : RequestResponseOperation) : void {
        try {
            let requestOptions = {
                topic: operation.options.publishTopic,
                payload: operation.options.payload,
                timeoutInSeconds: this.operationTimeoutInSeconds,
                completionData: operation.id
            };

            this.protocolClientAdapter.publish(requestOptions);

            operation.state = OperationState.PendingResponse;
        } catch (err) {
            this.completeOperationWithError(operation.id, new CrtError(`Publish error: "${JSON.stringify(err)}"`));
            return;
        }
    }

    private handleAcquireSubscriptionResult(operation: Operation, result: subscription_manager.AcquireSubscriptionResult) {
        if (result == subscription_manager.AcquireSubscriptionResult.Failure || result == subscription_manager.AcquireSubscriptionResult.NoCapacity) {
            this.completeOperationWithError(operation.id, new CrtError(`Acquire subscription error: ${subscription_manager.acquireSubscriptionResultToString(result)}`));
            return;
        }

        this.addOperationToInProgressTables(operation);

        if (result == subscription_manager.AcquireSubscriptionResult.Subscribing) {
            operation.state = OperationState.PendingSubscription;
            return;
        }

        if (operation.type == OperationType.Streaming) {
            operation.state = OperationState.Subscribed;
            // NYI - emit streaming operation subscription established event
        } else {
            this.makeOperationRequest(operation as RequestResponseOperation);
        }
    }

    private service() {
        this.serviceTask = undefined;

        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        while (this.operationQueue.length > 0) {
            let headId = this.operationQueue[0];
            let operation = this.operations.get(headId);
            if (!operation) {
                this.operationQueue.shift();
                continue;
            }

            if (!this.canOperationDequeue(operation)) {
                break;
            }

            let acquireOptions : subscription_manager.AcquireSubscriptionConfig = {
                topicFilters: RequestResponseClient.buildSuscriptionListFromOperation(operation),
                operationId: headId,
                type: (operation.type == OperationType.RequestResponse) ? subscription_manager.SubscriptionType.RequestResponse : subscription_manager.SubscriptionType.EventStream,
            };

            let acquireResult = this.subscriptionManager.acquireSubscription(acquireOptions);
            if (acquireResult == subscription_manager.AcquireSubscriptionResult.Blocked) {
                break;
            }

            this.operationQueue.shift();
            this.handleAcquireSubscriptionResult(operation, acquireResult);
        }
    }

    private clearServiceTask() {
        if (this.serviceTask) {
            clearTimeout(this.serviceTask.serviceTask);
            this.serviceTask = undefined;
        }
    }

    private tryScheduleServiceTask(serviceTime: number) {
        if (this.serviceTask) {
            if (serviceTime >= this.serviceTask.nextserviceTime) {
                return;
            }

            this.clearServiceTask();
        }

        let futureMs = Math.max(0, Date.now() - serviceTime);
        this.serviceTask = {
            serviceTask: setTimeout(() => { this.service(); }, futureMs),
            nextserviceTime: serviceTime,
        }
    }

    private wakeServiceTask() : void {
        this.tryScheduleServiceTask(Date.now());
    }

    private closeAllOperations() : void {
        // NYI
    }

    private removeStreamingOperationFromTopicFilterSet(topicFilter: string, id: number) {
        let operationSet = this.streamingOperationsByTopicFilter.get(topicFilter);
        if (!operationSet) {
            return;
        }

        operationSet.delete(id);
        if (operationSet.size > 0) {
            return;
        }

        this.streamingOperationsByTopicFilter.delete(topicFilter);
    }

    private decRefResponsePaths(topic: string) {
        let pathEntry = this.correlationTokenPathsByResponsePaths.get(topic);
        if (!pathEntry) {
            return;
        }

        pathEntry.refCount--;
        if (pathEntry.refCount < 1) {
            this.correlationTokenPathsByResponsePaths.delete(topic);
        }
    }

    private removeRequestResponseOperation(operation: RequestResponseOperation) {
        this.operations.delete(operation.id);

        if (operation.inClientTables) {
            for (let responsePath of operation.options.responsePaths) {
                this.decRefResponsePaths(responsePath.topic);
            }

            let correlationToken = operation.options.correlationToken ?? "";
            this.operationsByCorrelationToken.delete(correlationToken);
        }
    }

    private removeStreamingOperation(operation: StreamingOperation) {
        this.operations.delete(operation.id);

        if (operation.inClientTables) {
            this.removeStreamingOperationFromTopicFilterSet(operation.options.subscriptionTopicFilter, operation.id);
        }
    }

    private removeOperation(id: number) {
        let operation = this.operations.get(id);
        if (!operation) {
            return;
        }

        if (operation.type == OperationType.RequestResponse) {
            this.removeRequestResponseOperation(operation as RequestResponseOperation);
        } else {
            this.removeStreamingOperation(operation as StreamingOperation);
        }
    }

    private completeRequestResponseOperationWithError(id: number, err: CrtError) {
        let operation = this.operations.get(id);
        if (!operation) {
            return;
        }

        if (operation.type != OperationType.RequestResponse) {
            return;
        }

        let rrOperation = operation as RequestResponseOperation;
        let promise = rrOperation.resultPromise;

        this.removeOperation(id);

        promise.reject(err);
    }

    private haltStreamingOperationWithError(id: number, err: CrtError) {
        throw new CrtError("NYI");
    }

    private completeOperationWithError(id: number, err: CrtError) {
        let operation = this.operations.get(id);
        if (!operation) {
            return;
        }

        if (operation.type == OperationType.RequestResponse) {
            this.completeRequestResponseOperationWithError(id, err);
        } else {
            this.haltStreamingOperationWithError(id, err);
        }
    }

    private completeRequestResponseOperationWithResponse(id: number, responseTopic: string, payload: Buffer) {
        let operation = this.operations.get(id);
        if (!operation) {
            return;
        }

        if (operation.type != OperationType.RequestResponse) {
            return;
        }

        let rrOperation = operation as RequestResponseOperation;
        let promise = rrOperation.resultPromise;

        this.removeOperation(id);

        promise.resolve({
            topic: responseTopic,
            payload: payload
        });
    }

    private handlePublishCompletionEvent(event: protocol_client_adapter.PublishCompletionEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        if (event.err) {
            let id = event.completionData as number;
            this.completeOperationWithError(id, event.err as CrtError);
        }
    }

    private handleConnectionStatusEvent(event: protocol_client_adapter.ConnectionStatusEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        if (event.status == protocol_client_adapter.ConnectionState.Connected && this.operationQueue.length > 0) {
            this.wakeServiceTask();
        }
    }

    private handleIncomingPublishEvent(event: protocol_client_adapter.IncomingPublishEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        let responsePathEntry = this.correlationTokenPathsByResponsePaths.get(event.topic);
        if (!responsePathEntry) {
            return;
        }

        try {
            let correlationToken : string | undefined = undefined;

            if (!responsePathEntry.correlationTokenPath) {
                correlationToken = "";
            } else {
                let payloadAsString = new TextDecoder().decode(new Uint8Array(event.payload));
                let payloadAsJson = JSON.parse(payloadAsString);
                let segmentValue : any = payloadAsJson;
                for (let segment of responsePathEntry.correlationTokenPath) {
                    ??;
                }

                if (segmentValue && typeof(segmentValue) === "string") {
                    correlationToken = segmentValue as string;
                }
            }

            if (!correlationToken) {
                return;
            }

            let id = this.operationsByCorrelationToken.get(correlationToken);
            if (!id) {
                return;
            }

            this.completeRequestResponseOperationWithResponse(id, event.topic, event.payload);
        } catch (err) {
            ;
        }
    }
}