/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 *
 * @packageDocumentation
 * @module mqtt_request_response
 *
 */

import {CrtError} from "../error";
import * as mqtt_request_response from "../../common/mqtt_request_response";
import * as protocol_adapter from "./protocol_adapter";
import * as mqtt5 from "../mqtt5";
import * as mqtt311 from "../mqtt";

export class RequestResponseClient implements mqtt_request_response.IRequestResponseClient {

    // @ts-ignore
    private constructor(private adapter : protocol_adapter.ProtocolAdapter, private options: mqtt_request_response.RequestResponseClientOptions) {
    }

    /**
     * Creates a new MQTT service request-response client that uses an MQTT5 client as the protocol implementation.
     *
     * @param protocolClient protocol client to use for all operations
     * @param options configuration options for the desired request-response client
     */
    static newFromMqtt5(protocolClient: mqtt5.Mqtt5Client, options: mqtt_request_response.RequestResponseClientOptions): RequestResponseClient {
        if (!protocolClient) {
            throw new CrtError("protocol client is null");
        }

        if (!options) {
            throw new CrtError("options are null");
        }

        let adapter = protocol_adapter.ProtocolAdapter.newFrom5(protocolClient);
        let client = new RequestResponseClient(adapter, options);

        return client;
    }

    /**
     * Creates a new MQTT service request-response client that uses an MQTT311 client as the protocol implementation.
     *
     * @param protocolClient protocol client to use for all operations
     * @param options configuration options for the desired request-response client
     */
    static newFromMqtt311(protocolClient: mqtt311.MqttClientConnection, options: mqtt_request_response.RequestResponseClientOptions) : RequestResponseClient {
        if (!protocolClient) {
            throw new CrtError("protocol client is null");
        }

        if (!options) {
            throw new CrtError("options are null");
        }

        let adapter = protocol_adapter.ProtocolAdapter.newFrom311(protocolClient);
        let client = new RequestResponseClient(adapter, options);

        return client;
    }

    /**
     * Shuts down the request-response client.  Closing a client will fail all incomplete requests and close all
     * outstanding streaming operations.
     *
     * It is not valid to invoke any further operations on the client after close() has been called.
     */
    close(): void {
        this.adapter.close();

        throw new CrtError("Unimplemented");
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
        throw new CrtError("Unimplemented");
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
    submitRequest(requestOptions: mqtt_request_response.RequestResponseOperationOptions): Promise<mqtt_request_response.Response> {
        throw new CrtError("Unimplemented");
    }
}