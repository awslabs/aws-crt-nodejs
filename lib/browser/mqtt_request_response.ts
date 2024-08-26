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
import * as io from "../common/io";
import {acquireSubscriptionResultToString} from "./mqtt_request_response/subscription_manager";
import * as mqtt_shared from "../common/mqtt_shared";

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

function operationStateToString(state: OperationState) {
    switch(state) {
        case OperationState.None:
            return "None";
        case OperationState.Queued:
            return "Queued";
        case OperationState.PendingSubscription:
            return "PendingSubscription";
        case OperationState.PendingResponse:
            return "PendingResponse";
        case OperationState.Subscribed:
            return "Subscribed";
        case OperationState.Terminal:
            return "Terminal";
        case OperationState.PendingDestroy:
            return "PendingDestroy";
        default:
            return "Unknown";
    }
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
    nextServiceTime : number;
}

function areClientOptionsValid(options: mqtt_request_response.RequestResponseClientOptions) : boolean {
    if (!options) {
        return false;
    }

    if (!options.maxRequestResponseSubscriptions) {
        return false;
    }

    if (!Number.isInteger(options.maxRequestResponseSubscriptions)) {
        return false;
    }

    if (options.maxRequestResponseSubscriptions < 2) {
        return false;
    }

    if (!options.maxStreamingSubscriptions) {
        return false;
    }

    if (!Number.isInteger(options.maxStreamingSubscriptions)) {
        return false;
    }

    if (options.operationTimeoutInSeconds) {
        if (!Number.isInteger(options.operationTimeoutInSeconds)) {
            return false;
        }

        if (options.operationTimeoutInSeconds <= 0) {
            return false;
        }
    }

    return true;
}

/**
 * Native implementation of an MQTT-based request-response client tuned for AWS MQTT services.
 *
 * Supports streaming operations (listen to a stream of modeled events from an MQTT topic) and request-response
 * operations (performs the subscribes, publish, and incoming publish correlation and error checking needed to
 * perform simple request-response operations over MQTT).
 */
export class RequestResponseClient extends BufferedEventEmitter implements mqtt_request_response.IRequestResponseClient {

    private static logSubject = "RequestResponseClient";

    private readonly operationTimeoutInSeconds: number;
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

    constructor(protocolClientAdapter: protocol_client_adapter.ProtocolClientAdapter, options: mqtt_request_response.RequestResponseClientOptions) {
        if (!areClientOptionsValid(options)) {
            throw new CrtError("Invalid client options passed to RequestResponseClient constructor");
        }

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

        this.subscriptionManager.addListener(subscription_manager.SubscriptionManager.SUBSCRIBE_SUCCESS, this.handleSubscribeSuccessEvent.bind(this));
        this.subscriptionManager.addListener(subscription_manager.SubscriptionManager.SUBSCRIBE_FAILURE, this.handleSubscribeFailureEvent.bind(this));
        this.subscriptionManager.addListener(subscription_manager.SubscriptionManager.SUBSCRIPTION_ENDED, this.handleSubscriptionEndedEvent.bind(this));
        this.subscriptionManager.addListener(subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_ESTABLISHED, this.handleStreamingSubscriptionEstablishedEvent.bind(this));
        this.subscriptionManager.addListener(subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_LOST, this.handleStreamingSubscriptionLostEvent.bind(this));
        this.subscriptionManager.addListener(subscription_manager.SubscriptionManager.STREAMING_SUBSCRIPTION_HALTED, this.handleStreamingSubscriptionHaltedEvent.bind(this));
        this.subscriptionManager.addListener(subscription_manager.SubscriptionManager.SUBSCRIPTION_ORPHANED, this.handleSubscriptionOrphanedEvent.bind(this));
        this.subscriptionManager.addListener(subscription_manager.SubscriptionManager.UNSUBSCRIBE_COMPLETE, this.handleUnsubscribeCompleteEvent.bind(this));
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
            io.logInfo(RequestResponseClient.logSubject, `closing MQTT RequestResponseClient`);
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
        let resultPromise : LiftedPromise<mqtt_request_response.Response> = newLiftedPromise();

        if (this.state == mqtt_request_response_internal.RequestResponseClientState.Closed) {
            resultPromise.reject(new CrtError("MQTT request-response client has already been closed"));
            return resultPromise.promise;
        }

        try {
            validateRequestOptions(requestOptions);
        } catch (err) {
            resultPromise.reject(err);
            return resultPromise.promise;
        }

        let id = this.nextOperationId;
        this.nextOperationId++;

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
            this.completeRequestResponseOperationWithError(id, new CrtError("Operation timeout"));
        }, this.operationTimeoutInSeconds * 1000)

        this.wakeServiceTask();

        io.logInfo(RequestResponseClient.logSubject, `request-response operation with id "${id}" submitted to operation queue`);

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

                io.logDebug(RequestResponseClient.logSubject, `adding topic filter "${filter}" to streaming subscriptions table`);
            }

            existingSet.add(operation.id);
            io.logDebug(RequestResponseClient.logSubject, `adding operation ${operation.id} to streaming subscriptions table under topic filter "${filter}"`);
        } else {
            let rrOperation = operation as RequestResponseOperation;

            let correlationToken = rrOperation.options.correlationToken ?? "";
            this.operationsByCorrelationToken.set(correlationToken, operation.id);

            io.logDebug(RequestResponseClient.logSubject, `operation ${operation.id} registered with correlation token "${correlationToken}"`);

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

                    io.logDebug(RequestResponseClient.logSubject, `adding response path "${path.topic}" to response path table`);
                }

                existingEntry.refCount++;
                io.logDebug(RequestResponseClient.logSubject, `operation ${operation.id} adding reference to response path "${path.topic}"`);
            }
        }

        operation.inClientTables = true;
    }

    private handleAcquireSubscriptionResult(operation: Operation, result: subscription_manager.AcquireSubscriptionResult) {
        if (result == subscription_manager.AcquireSubscriptionResult.Failure || result == subscription_manager.AcquireSubscriptionResult.NoCapacity) {
            this.completeOperationWithError(operation.id, new CrtError(`Acquire subscription error: ${subscription_manager.acquireSubscriptionResultToString(result)}`));
            return;
        }

        this.addOperationToInProgressTables(operation);

        if (result == subscription_manager.AcquireSubscriptionResult.Subscribing) {
            this.changeOperationState(operation, OperationState.PendingSubscription);
            return;
        }

        if (operation.type == OperationType.Streaming) {
            this.changeOperationState(operation, OperationState.Subscribed);
            // NYI - emit streaming operation subscription established event
        } else {
            this.applyRequestResponsePublish(operation as RequestResponseOperation);
        }
    }

    private service() {
        this.serviceTask = undefined;

        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        this.subscriptionManager.purge();

        io.logDebug(RequestResponseClient.logSubject, `servicing operation queue with ${this.operationQueue.length} entries`);
        while (this.operationQueue.length > 0) {
            let headId = this.operationQueue[0];
            let operation = this.operations.get(headId);
            if (!operation) {
                this.operationQueue.shift();
                continue;
            }

            if (!this.canOperationDequeue(operation)) {
                io.logDebug(RequestResponseClient.logSubject, `operation ${headId} cannot be dequeued`);
                break;
            }

            let acquireOptions : subscription_manager.AcquireSubscriptionConfig = {
                topicFilters: RequestResponseClient.buildSuscriptionListFromOperation(operation),
                operationId: headId,
                type: (operation.type == OperationType.RequestResponse) ? subscription_manager.SubscriptionType.RequestResponse : subscription_manager.SubscriptionType.EventStream,
            };

            let acquireResult = this.subscriptionManager.acquireSubscription(acquireOptions);
            io.logDebug(RequestResponseClient.logSubject, `servicing queued operation ${operation.id} yielded acquire subscription result of "${acquireSubscriptionResultToString(acquireResult)}"`);
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
            if (serviceTime >= this.serviceTask.nextServiceTime) {
                return;
            }

            this.clearServiceTask();
        }

        let futureMs = Math.max(0, Date.now() - serviceTime);
        this.serviceTask = {
            serviceTask: setTimeout(() => { this.service(); }, futureMs),
            nextServiceTime: serviceTime,
        }

        io.logDebug(RequestResponseClient.logSubject, `service task scheduled for execution in ${futureMs} MS`);
    }

    private wakeServiceTask() : void {
        this.tryScheduleServiceTask(Date.now());
    }

    private closeAllOperations() : void {
        let operations = Array.from(this.operations).map(([key, value]) => key);
        for (let id of operations) {
            this.completeOperationWithError(id, new CrtError("Request-response client closed"));
        }
    }

    private removeStreamingOperationFromTopicFilterSet(topicFilter: string, id: number) {
        let operationSet = this.streamingOperationsByTopicFilter.get(topicFilter);
        if (!operationSet) {
            return;
        }

        operationSet.delete(id);
        io.logDebug(RequestResponseClient.logSubject, `removed operation ${id} from streaming topic filter table entry for "${topicFilter}"`);
        if (operationSet.size > 0) {
            return;
        }

        this.streamingOperationsByTopicFilter.delete(topicFilter);
        io.logDebug(RequestResponseClient.logSubject, `removed streaming topic filter table entry for "${topicFilter}"`);
    }

    private decRefResponsePaths(topic: string) {
        let pathEntry = this.correlationTokenPathsByResponsePaths.get(topic);
        if (!pathEntry) {
            return;
        }

        pathEntry.refCount--;
        io.logDebug(RequestResponseClient.logSubject, `dec-refing response path entry for "${topic}", ${pathEntry.refCount} references left`);
        if (pathEntry.refCount < 1) {
            io.logDebug(RequestResponseClient.logSubject, `removing response path entry for "${topic}"`);
            this.correlationTokenPathsByResponsePaths.delete(topic);
        }
    }

    private removeRequestResponseOperation(operation: RequestResponseOperation) {
        io.logDebug(RequestResponseClient.logSubject, `removing request-response operation ${operation.id} from client state`);
        this.operations.delete(operation.id);

        if (operation.inClientTables) {
            for (let responsePath of operation.options.responsePaths) {
                this.decRefResponsePaths(responsePath.topic);
            }

            let correlationToken = operation.options.correlationToken ?? "";
            this.operationsByCorrelationToken.delete(correlationToken);
        }

        let releaseOptions : subscription_manager.ReleaseSubscriptionsConfig = {
            topicFilters: operation.options.subscriptionTopicFilters,
            operationId: operation.id,
        };
        this.subscriptionManager.releaseSubscription(releaseOptions);
    }

    private removeStreamingOperation(operation: StreamingOperation) {
        io.logDebug(RequestResponseClient.logSubject, `removing streaming operation ${operation.id} from client state`);
        this.operations.delete(operation.id);

        if (operation.inClientTables) {
            this.removeStreamingOperationFromTopicFilterSet(operation.options.subscriptionTopicFilter, operation.id);
        }

        let releaseOptions : subscription_manager.ReleaseSubscriptionsConfig = {
            topicFilters: new Array<string>(operation.options.subscriptionTopicFilter),
            operationId: operation.id,
        };
        this.subscriptionManager.releaseSubscription(releaseOptions);
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

        io.logInfo(RequestResponseClient.logSubject, `request-response operation ${id} completed with error: "${JSON.stringify(err)}"`);

        this.removeOperation(id);

        if (operation.type != OperationType.RequestResponse) {
            return;
        }

        let rrOperation = operation as RequestResponseOperation;
        let promise = rrOperation.resultPromise;

        promise.reject(err);
    }

    private haltStreamingOperationWithError(id: number, err: CrtError) {
        let operation = this.operations.get(id);
        if (!operation) {
            return;
        }

        io.logInfo(RequestResponseClient.logSubject, `streaming operation ${id} halted with error: "${JSON.stringify(err)}"`);

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

    private completeRequestResponseOperationWithResponse(id: number, responseTopic: string, payload: ArrayBuffer) {
        let operation = this.operations.get(id);
        if (!operation) {
            return;
        }

        io.logInfo(RequestResponseClient.logSubject, `request-response operation ${id} successfully completed with response"`);

        this.removeOperation(id);

        if (operation.type != OperationType.RequestResponse) {
            return;
        }

        let rrOperation = operation as RequestResponseOperation;
        let promise = rrOperation.resultPromise;

        promise.resolve({
            topic: responseTopic,
            payload: payload
        });
    }

    private handlePublishCompletionEvent(event: protocol_client_adapter.PublishCompletionEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        let id = event.completionData as number;
        if (event.err) {
            this.completeRequestResponseOperationWithError(id, event.err as CrtError);
        } else {
            io.logDebug(RequestResponseClient.logSubject, `request-response operation ${id} successfully published request payload"`);
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

    private handleIncomingPublishEventStreaming(event: protocol_client_adapter.IncomingPublishEvent, operations: Set<number>) {
        // NYI
    }

    private handleIncomingPublishEventRequestResponse(event: protocol_client_adapter.IncomingPublishEvent, responsePathEntry: ResponsePathEntry) {

        io.logDebug(RequestResponseClient.logSubject, `processing incoming publish event on response path topic "${event.topic}"`);
        if (!event.payload) {
            io.logError(RequestResponseClient.logSubject, `incoming publish on response path topic "${event.topic}" has no payload`);
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
                    let segmentPropertyValue = segmentValue[segment];
                    if (!segmentPropertyValue) {
                        io.logError(RequestResponseClient.logSubject, `incoming publish on response path topic "${event.topic}" does not have a correlation token at the expected JSON path`);
                        break;
                    }

                    segmentValue = segmentValue[segment];
                }

                if (segmentValue && typeof(segmentValue) === "string") {
                    correlationToken = segmentValue as string;
                }
            }

            if (correlationToken === undefined) {
                io.logError(RequestResponseClient.logSubject, `A valid correlation token could not be inferred for incoming publish on response path topic "${event.topic}"`);
                return;
            }

            let id = this.operationsByCorrelationToken.get(correlationToken);
            if (!id) {
                io.logDebug(RequestResponseClient.logSubject, `incoming publish on response path topic "${event.topic}" with correlation token "${correlationToken}" does not have an originating request entry`);
                return;
            }

            this.completeRequestResponseOperationWithResponse(id, event.topic, event.payload);
        } catch (err) {
            io.logError(RequestResponseClient.logSubject, `incoming publish on response path topic "${event.topic}" triggered exception: ${JSON.stringify(err)}`);
        }
    }

    private handleIncomingPublishEvent(event: protocol_client_adapter.IncomingPublishEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        let responsePathEntry = this.correlationTokenPathsByResponsePaths.get(event.topic);
        if (responsePathEntry) {
            this.handleIncomingPublishEventRequestResponse(event, responsePathEntry);
        }

        let streamingOperationSet = this.streamingOperationsByTopicFilter.get(event.topic);
        if (streamingOperationSet) {
            this.handleIncomingPublishEventStreaming(event, streamingOperationSet);
        }
    }

    private handleSubscribeSuccessEvent(event: subscription_manager.SubscribeSuccessEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        io.logDebug(RequestResponseClient.logSubject, `subscribe success event received for operation ${event.operationId} using topic filter "${event.topicFilter}"`);
        let operation = this.operations.get(event.operationId);
        if (!operation) {
            return;
        }

        let rrOperation = operation as RequestResponseOperation;
        rrOperation.pendingSubscriptionCount--;
        if (rrOperation.pendingSubscriptionCount === 0) {
            this.applyRequestResponsePublish(rrOperation);
        } else {
            io.logDebug(RequestResponseClient.logSubject, `operation ${event.operationId} has ${rrOperation.pendingSubscriptionCount} pending subscriptions left`);
        }
    }

    private handleSubscribeFailureEvent(event: subscription_manager.SubscribeFailureEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        io.logDebug(RequestResponseClient.logSubject, `subscribe failure event received for operation ${event.operationId} using topic filter "${event.topicFilter}"`);
        this.completeRequestResponseOperationWithError(event.operationId, new CrtError("Subscribe failure"));
    }

    private handleSubscriptionEndedEvent(event: subscription_manager.SubscriptionEndedEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        io.logDebug(RequestResponseClient.logSubject, `subscription ended event received for operation ${event.operationId} using topic filter "${event.topicFilter}"`);
        this.completeRequestResponseOperationWithError(event.operationId, new CrtError("Subscription Ended Early"));
    }

    private handleStreamingSubscriptionEstablishedEvent(event: subscription_manager.StreamingSubscriptionEstablishedEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        // NYI
    }

    private handleStreamingSubscriptionLostEvent(event: subscription_manager.StreamingSubscriptionLostEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        // NYI
    }

    private handleStreamingSubscriptionHaltedEvent(event: subscription_manager.StreamingSubscriptionHaltedEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        // NYI
    }

    private handleSubscriptionOrphanedEvent(event: subscription_manager.SubscriptionOrphanedEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        io.logDebug(RequestResponseClient.logSubject, `subscription orphaned event received for topic filter "${event.topicFilter}"`);
        this.wakeServiceTask();
    }

    private handleUnsubscribeCompleteEvent(event: subscription_manager.UnsubscribeCompleteEvent) {
        if (this.state != mqtt_request_response_internal.RequestResponseClientState.Ready) {
            return;
        }

        io.logDebug(RequestResponseClient.logSubject, `unsubscribe completion event received for topic filter "${event.topicFilter}"`);
        this.wakeServiceTask();
    }

    private changeOperationState(operation: Operation, state: OperationState) {
        if (state == operation.state) {
            return;
        }

        io.logDebug(RequestResponseClient.logSubject, `operation ${operation.id} changing state from "${operationStateToString(operation.state)}" to "${operationStateToString(state)}"`);

        operation.state = state;
    }

    private applyRequestResponsePublish(operation: RequestResponseOperation) {
        let publishOptions = {
            topic: operation.options.publishTopic,
            payload: operation.options.payload,
            timeoutInSeconds: this.operationTimeoutInSeconds,
            completionData: operation.id
        };

        try {
            io.logDebug(RequestResponseClient.logSubject, `submitting publish for request-response operation ${operation.id}`);
            this.protocolClientAdapter.publish(publishOptions);
            this.changeOperationState(operation, OperationState.PendingResponse);
        } catch (err) {
            let errorStringified = JSON.stringify(err);
            this.completeRequestResponseOperationWithError(operation.id, new CrtError(`Publish error: "${errorStringified}"`));
            io.logError(RequestResponseClient.logSubject, `request-response operation ${operation.id} synchronously failed publish step due to error: ${errorStringified}`);
        }
    }
}

function validateResponsePath(responsePath: mqtt_request_response.ResponsePath) {
    if (!mqtt_shared.isValidTopic(responsePath.topic)) {
        throw new CrtError(`"${JSON.stringify(responsePath.topic)})" is not a valid topic`);
    }

    if (responsePath.correlationTokenJsonPath) {
        if (typeof(responsePath.correlationTokenJsonPath) !== 'string') {
            throw new CrtError(`"${JSON.stringify(responsePath.correlationTokenJsonPath)})" is not a valid correlation token path`);
        }
    }
}

function validateRequestOptions(requestOptions: mqtt_request_response.RequestResponseOperationOptions) {
    if (!requestOptions) {
        throw new CrtError("Invalid request options - null options");
    }

    if (!requestOptions.subscriptionTopicFilters) {
        throw new CrtError("Invalid request options - null subscriptionTopicFilters");
    }

    if (!Array.isArray(requestOptions.subscriptionTopicFilters)) {
        throw new CrtError("Invalid request options - subscriptionTopicFilters is not an array");
    }

    if (requestOptions.subscriptionTopicFilters.length === 0) {
        throw new CrtError("Invalid request options - subscriptionTopicFilters is empty");
    }

    for (const topicFilter of requestOptions.subscriptionTopicFilters) {
        if (!mqtt_shared.isValidTopicFilter(topicFilter)) {
            throw new CrtError(`Invalid request options - "${JSON.stringify(topicFilter)}" is not a valid topic filter`);
        }
    }

    if (!requestOptions.responsePaths) {
        throw new CrtError("Invalid request options - null responsePaths");
    }

    if (!Array.isArray(requestOptions.responsePaths)) {
        throw new CrtError("Invalid request options - responsePaths is not an array");
    }

    if (requestOptions.responsePaths.length === 0) {
        throw new CrtError("Invalid request options - responsePaths is empty");
    }

    for (const responsePath of requestOptions.responsePaths) {
        try {
            validateResponsePath(responsePath);
        } catch (err) {
            throw new CrtError(`Invalid request options - invalid response path: ${JSON.stringify(err)}`);
        }
    }

    if (!requestOptions.publishTopic) {
        throw new CrtError("Invalid request options - null publishTopic");
    }

    if (!mqtt_shared.isValidTopic(requestOptions.publishTopic)) {
        throw new CrtError(`Invalid request options - "${JSON.stringify(requestOptions.publishTopic)}" is not a valid topic`);
    }

    if (!requestOptions.payload) {
        throw new CrtError("Invalid request options - null payload");
    }

    if (requestOptions.payload.byteLength == 0) {
        throw new CrtError("Invalid request options - empty payload");
    }

    if (requestOptions.correlationToken) {
        if (typeof(requestOptions.correlationToken) !== 'string') {
            throw new CrtError("Invalid request options - correlationToken is not a string");
        }
    } else if (requestOptions.correlationToken === null) {
        throw new CrtError("Invalid request options - correlationToken null");
    }
}
