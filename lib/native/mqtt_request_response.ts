/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Node.js specific MQTT5 client implementation
 *
 * [MQTT5 Client User Guide](https://www.github.com/awslabs/aws-crt-nodejs/blob/main/MQTT5-UserGuide.md)
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

export * from "../common/mqtt_request_response";

export class StreamingOperation extends NativeResourceMixin(BufferedEventEmitter) implements mqtt_request_response.IStreamingOperation {

    constructor() {
        super();

        this._super(null);
    }

    open() : void {

    }

    close(): void {

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

export class RequestResponseClient extends NativeResourceMixin(BufferedEventEmitter) implements mqtt_request_response.IRequestResponseClient {

    static newFromMqtt5(protocolClient: Mqtt5Client, options: mqtt_request_response.RequestResponseClientOptions) : RequestResponseClient {
        return new RequestResponseClient();
    }

    static newFromMqtt311(protocolClient: MqttClientConnection, options: mqtt_request_response.RequestResponseClientOptions) : RequestResponseClient {
        return new RequestResponseClient();
    }

    private constructor() {
        super();

        this._super(null);
    }

    close(): void {

    }

    createStream(streamOptions: mqtt_request_response.StreamingOperationOptions) : StreamingOperation {
        return new StreamingOperation();
    }

    async submitRequest(requestOptions: mqtt_request_response.RequestResponseOperationOptions): Promise<mqtt_request_response.Response> {
        return new Promise<mqtt_request_response.Response>((resolve, reject) => {
            reject(new CrtError("NYI"));
        });
    }
}
