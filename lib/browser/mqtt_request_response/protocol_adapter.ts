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

import {CrtError, ICrtError} from "../error";
import * as mqtt311 from "../mqtt";
import * as mqtt5 from "../mqtt5";
import * as mqtt_request_response from "../../common/mqtt_request_response";
import {BufferedEventEmitter} from "../../common/event";
import {QoS} from "../mqtt";


const MS_PER_SECOND : number = 1000;

export interface PublishOptions {
    topic: string,
    payload: mqtt_request_response.RequestPayload,
    timeoutInSeconds: number,
    completionData: any
}

export interface PublishCompletionEvent {
    completionData: any,
    err?: ICrtError
}

export type PublishCompletionEventListener = (event: PublishCompletionEvent) => void;

export interface SubscribeOptions {
    topicFilter: string,
    timeoutInSeconds: number,
}

export interface SubscribeCompletionEvent {
    topicFilter: string,
    err?: ICrtError,
    retryable?: boolean,
}

export type SubscribeCompletionEventListener = (event: SubscribeCompletionEvent) => void;

export interface UnsubscribeOptions {
    topicFilter: string,
    timeoutInSeconds: number,
}

export interface UnsubscribeCompletionEvent {
    topicFilter: string,
    err?: ICrtError,
    retryable?: boolean
}

export type UnsubscribeCompletionEventListener = (event: UnsubscribeCompletionEvent) => void;

export enum ConnectionState {
    Connected = 0,
    Disconnected = 1,
}

export interface ConnectionStatusEvent {
    status: ConnectionState,
    joinedSession?: boolean,
}

export type ConnectionStatusEventListener = (event: ConnectionStatusEvent) => void;

export interface IncomingPublishEvent {
    topic: string,
    payload?: ArrayBuffer
}

export type IncomingPublishEventListener = (event: IncomingPublishEvent) => void;

/*
 * Provides a client-agnostic wrapper around the MQTT functionality needed by the browser request-response client.
 *
 * This is a direct port of aws-c-mqtt's aws_mqtt_protocol_adapter implementation.
 *
 * We use events and not promises for all of these operations because it's critical that the request-response
 * client never awaits on async promises directly.  All promise waits are done on scheduled tasks instead.
 */
export class ProtocolClientAdapter extends BufferedEventEmitter {

    private closed: boolean;
    private client5?: mqtt5.Mqtt5Client;
    private client311?: mqtt311.MqttClientConnection;
    private connectionState: ConnectionState;

    private connectionSuccessListener5 : mqtt5.ConnectionSuccessEventListener = (event : mqtt5.ConnectionSuccessEvent) => {
        this.connectionState = ConnectionState.Connected;
        setImmediate(() => { this.emit(ProtocolClientAdapter.CONNECTION_STATUS, {
            status: ConnectionState.Connected,
            joinedSession: event.connack.sessionPresent,
        })});
    };

    private disconnectionListener5 : mqtt5.DisconnectionEventListener = (event : mqtt5.DisconnectionEvent) => {
        this.connectionState = ConnectionState.Disconnected;
        setImmediate(() => { this.emit(ProtocolClientAdapter.CONNECTION_STATUS, {
            status: ConnectionState.Disconnected,
        })});
    };

    private incomingPublishListener5 : mqtt5.MessageReceivedEventListener = (event: mqtt5.MessageReceivedEvent) => {
        setImmediate(() => { this.emit(ProtocolClientAdapter.INCOMING_PUBLISH, {
            topic: event.message.topicName,
            payload: event.message.payload
        })});
    };

    private connectionSuccessListener311 : mqtt311.MqttConnectionSuccess = (event : mqtt311.OnConnectionSuccessResult) => {
        this.connectionState = ConnectionState.Connected;
        setImmediate(() => { this.emit(ProtocolClientAdapter.CONNECTION_STATUS, {
            status: ConnectionState.Connected,
            joinedSession: event.session_present,
        })});
    };

    private disconnectionListener311 : mqtt311.MqttConnectionDisconnected = () => {
        this.connectionState = ConnectionState.Disconnected;
        setImmediate(() => { this.emit(ProtocolClientAdapter.CONNECTION_STATUS, {
            status: ConnectionState.Disconnected,
        })});
    };

    private incomingPublishListener311 : mqtt311.OnMessageCallback = (topic: string, payload: ArrayBuffer, dup: boolean, qos: QoS, retain: boolean) => {
        setImmediate(() => { this.emit(ProtocolClientAdapter.INCOMING_PUBLISH, {
            topic: topic,
            payload: payload
        })});
    };

    private constructor() {
        super();

        this.connectionState = ConnectionState.Disconnected;
        this.closed = false;
    }

    public static newFrom5(client: mqtt5.Mqtt5Client) : ProtocolClientAdapter {
        let adapter = new ProtocolClientAdapter();

        adapter.client5 = client;

        client.addListener(mqtt5.Mqtt5Client.CONNECTION_SUCCESS, adapter.connectionSuccessListener5);
        client.addListener(mqtt5.Mqtt5Client.DISCONNECTION, adapter.disconnectionListener5);
        client.addListener(mqtt5.Mqtt5Client.MESSAGE_RECEIVED, adapter.incomingPublishListener5);

        adapter.connectionState = client.isConnected() ? ConnectionState.Connected : ConnectionState.Disconnected;

        return adapter;
    }

    public static newFrom311(client: mqtt311.MqttClientConnection) : ProtocolClientAdapter {
        let adapter = new ProtocolClientAdapter();

        adapter.client311 = client;

        client.addListener(mqtt311.MqttClientConnection.CONNECTION_SUCCESS, adapter.connectionSuccessListener311);
        client.addListener(mqtt311.MqttClientConnection.DISCONNECT, adapter.disconnectionListener311);
        client.addListener(mqtt311.MqttClientConnection.MESSAGE, adapter.incomingPublishListener311);

        adapter.connectionState = client.is_connected() ? ConnectionState.Connected : ConnectionState.Disconnected;

        return adapter;
    }

    public close() : void {
        if (this.closed) {
            return;
        }

        this.closed = true;

        if (this.client5) {
            this.client5.removeListener(mqtt5.Mqtt5Client.CONNECTION_SUCCESS, this.connectionSuccessListener5);
            this.client5.removeListener(mqtt5.Mqtt5Client.DISCONNECTION, this.disconnectionListener5);
            this.client5.removeListener(mqtt5.Mqtt5Client.MESSAGE_RECEIVED, this.incomingPublishListener5);
            this.client5 = undefined;
        }

        if (this.client311) {
            this.client311.removeListener(mqtt311.MqttClientConnection.CONNECTION_SUCCESS, this.connectionSuccessListener311);
            this.client311.removeListener(mqtt311.MqttClientConnection.DISCONNECT, this.disconnectionListener311);
            this.client311.removeListener(mqtt311.MqttClientConnection.MESSAGE, this.incomingPublishListener311);
            this.client311 = undefined;
        }
    }

    public publish(publishOptions : PublishOptions) : void {

        if (this.closed) {
            throw new CrtError(ProtocolClientAdapter.ADAPTER_CLOSED);
        }

        var publishResult: PublishCompletionEvent | undefined = undefined;

        setImmediate(async () => {
            var publishPromise: Promise<void>;
            if (this.client5) {
                let packet: mqtt5.PublishPacket = {
                    topicName: publishOptions.topic,
                    qos: mqtt5.QoS.AtLeastOnce,
                    payload: publishOptions.payload,
                };

                publishPromise = this.client5.publish(packet).then(
                    (result) => {
                        if (!publishResult) {
                            publishResult = {
                                completionData: publishOptions.completionData
                            };

                            if (result && !mqtt5.isSuccessfulPubackReasonCode(result.reasonCode)) {
                                publishResult.err = new CrtError(ProtocolClientAdapter.FAILING_PUBACK_REASON_CODE);
                            }
                        }
                    },
                    (err) => {
                        if (!publishResult) {
                            publishResult = {
                                completionData: publishOptions.completionData,
                                err: err
                            };
                        }
                    }
                );
            } else if (this.client311) {
                publishPromise = this.client311.publish(publishOptions.topic, publishOptions.payload, mqtt311.QoS.AtLeastOnce).then(
                    (response) => {
                        if (!publishResult) {
                            publishResult = {
                                completionData: publishOptions.completionData
                            };
                        }
                    },
                    (err) => {
                        if (!publishResult) {
                            publishResult = {
                                completionData: publishOptions.completionData,
                                err: err
                            };
                        }
                    }
                );
            } else {
                throw new CrtError(ProtocolClientAdapter.ILLEGAL_ADAPTER_STATE);
            }

            let timeoutPromise: Promise<void> = new Promise(
                resolve => setTimeout(() => {
                        if (!publishResult) {
                            publishResult = {
                                completionData: publishOptions.completionData,
                                err: new CrtError(ProtocolClientAdapter.OPERATION_TIMEOUT)
                            };
                        }
                    },
                    publishOptions.timeoutInSeconds * MS_PER_SECOND));

            await Promise.race([publishPromise, timeoutPromise]);

            this.emit(ProtocolClientAdapter.PUBLISH_COMPLETION, publishResult);
        });
    }

    public subscribe(subscribeOptions: SubscribeOptions) : void {

        if (this.closed) {
            throw new CrtError(ProtocolClientAdapter.ADAPTER_CLOSED);
        }

        var subscribeResult: SubscribeCompletionEvent | undefined = undefined;

        setImmediate(async () => {
            var subscribePromise: Promise<void>;
            if (this.client5) {
                let packet: mqtt5.SubscribePacket = {
                    subscriptions: [
                        {
                            topicFilter: subscribeOptions.topicFilter,
                            qos: mqtt5.QoS.AtLeastOnce,
                        }
                    ]
                };

                subscribePromise = this.client5.subscribe(packet).then(
                    (suback) => {
                        if (!subscribeResult) {
                            subscribeResult = {
                                topicFilter: subscribeOptions.topicFilter,
                            };

                            let reasonCode = suback.reasonCodes[0];
                            if (!mqtt5.isSuccessfulSubackReasonCode(reasonCode)) {
                                subscribeResult.err = new CrtError(ProtocolClientAdapter.FAILING_SUBACK_REASON_CODE);
                                subscribeResult.retryable = ProtocolClientAdapter.isSubackReasonCodeRetryable(reasonCode);
                            }
                        }
                    },
                    (err) => {
                        if (!subscribeResult) {
                            subscribeResult = {
                                topicFilter: subscribeOptions.topicFilter,
                                err: err,
                                retryable: false
                            };
                        }
                    }
                );
            } else if (this.client311) {
                subscribePromise = this.client311.subscribe(subscribeOptions.topicFilter, mqtt311.QoS.AtLeastOnce).then(
                    (response) => {
                        if (!subscribeResult) {
                            subscribeResult = {
                                topicFilter: subscribeOptions.topicFilter
                            };

                            if (response.qos >= 128) {
                                subscribeResult.err = new CrtError(ProtocolClientAdapter.FAILING_SUBACK_REASON_CODE);
                                subscribeResult.retryable = true;
                            } else if (response.error_code) {
                                subscribeResult.err = new CrtError("Internal Error");
                                subscribeResult.retryable = true;
                            }
                        }
                    },
                    (err) => {
                        if (!subscribeResult) {
                            subscribeResult = {
                                topicFilter: subscribeOptions.topicFilter,
                                err: err,
                                retryable: false,
                            };
                        }
                    }
                );
            } else {
                throw new CrtError(ProtocolClientAdapter.ILLEGAL_ADAPTER_STATE);
            }

            let timeoutPromise: Promise<void> = new Promise(
                resolve => setTimeout(() => {
                        if (!subscribeResult) {
                            subscribeResult = {
                                topicFilter: subscribeOptions.topicFilter,
                                err: new CrtError(ProtocolClientAdapter.OPERATION_TIMEOUT),
                                retryable: true,
                            };
                        }
                    },
                    subscribeOptions.timeoutInSeconds * MS_PER_SECOND));

            await Promise.race([subscribePromise, timeoutPromise]);

            this.emit(ProtocolClientAdapter.SUBSCRIBE_COMPLETION, subscribeResult);
        });
    }

    public unsubscribe(unsubscribeOptions: UnsubscribeOptions) : void {

        if (this.closed) {
            throw new CrtError(ProtocolClientAdapter.ADAPTER_CLOSED);
        }

        var unsubscribeResult: UnsubscribeCompletionEvent | undefined = undefined;

        setImmediate(async () => {
            var unsubscribePromise: Promise<void>;

            if (this.client5) {
                let packet : mqtt5.UnsubscribePacket = {
                    topicFilters: [ unsubscribeOptions.topicFilter ]
                };

                unsubscribePromise = this.client5.unsubscribe(packet).then(
                    (unsuback) => {
                        if (!unsubscribeResult) {
                            unsubscribeResult = {
                                topicFilter: unsubscribeOptions.topicFilter
                            };

                            let reasonCode = unsuback.reasonCodes[0];
                            if (!mqtt5.isSuccessfulUnsubackReasonCode(unsuback.reasonCodes[0])) {
                                unsubscribeResult.err = new CrtError(ProtocolClientAdapter.FAILING_UNSUBACK_REASON_CODE);
                                unsubscribeResult.retryable = ProtocolClientAdapter.isUnsubackReasonCodeRetryable(reasonCode);
                            }
                        }
                    },
                    (err) => {
                        if (!unsubscribeResult) {
                            unsubscribeResult = {
                                topicFilter: unsubscribeOptions.topicFilter,
                                err: err,
                                retryable: false,
                            }
                        }
                    }
                );
            } else if (this.client311) {
                unsubscribePromise = this.client311.unsubscribe(unsubscribeOptions.topicFilter).then(
                    (_) => {
                        if (!unsubscribeResult) {
                            unsubscribeResult = {
                                topicFilter: unsubscribeOptions.topicFilter
                            };
                        }
                    },
                    (err) => {
                        if (!unsubscribeResult) {
                            unsubscribeResult = {
                                topicFilter: unsubscribeOptions.topicFilter,
                                err: err,
                                retryable: false,
                            };
                        }
                    }
                );
            } else {
                throw new CrtError(ProtocolClientAdapter.ILLEGAL_ADAPTER_STATE);
            }

            let timeoutPromise: Promise<void> = new Promise(
                resolve => setTimeout(() => {
                        if (!unsubscribeResult) {
                            unsubscribeResult = {
                                topicFilter: unsubscribeOptions.topicFilter,
                                err: new CrtError(ProtocolClientAdapter.OPERATION_TIMEOUT),
                                retryable: true,
                            };
                        }
                    },
            unsubscribeOptions.timeoutInSeconds * MS_PER_SECOND));

            await Promise.race([unsubscribePromise, timeoutPromise]);

            this.emit(ProtocolClientAdapter.UNSUBSCRIBE_COMPLETION, unsubscribeResult);
        });
    }

    public getConnectionState() : ConnectionState {
        if (this.closed) {
            throw new CrtError(ProtocolClientAdapter.ADAPTER_CLOSED);
        }

        return this.connectionState;
    }

    static PUBLISH_COMPLETION : string = 'publishCompletion';

    static SUBSCRIBE_COMPLETION : string = 'subscribeCompletion';

    static UNSUBSCRIBE_COMPLETION : string = 'unsubscribeCompletion';

    static CONNECTION_STATUS : string = 'connectionStatus';

    static INCOMING_PUBLISH : string = 'incomingPublish';

    on(event: 'publishCompletion', listener: PublishCompletionEventListener): this;

    on(event: 'subscribeCompletion', listener: SubscribeCompletionEventListener): this;

    on(event: 'unsubscribeCompletion', listener: UnsubscribeCompletionEventListener): this;

    on(event: 'connectionStatus', listener: ConnectionStatusEventListener): this;

    on(event: 'incomingPublish', listener: IncomingPublishEventListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    private static FAILING_PUBACK_REASON_CODE = "Failing Puback Reason Code";

    private static FAILING_SUBACK_REASON_CODE = "Failing Suback Reason Code";

    private static FAILING_UNSUBACK_REASON_CODE = "Failing Unsuback Reason Code";

    private static ILLEGAL_ADAPTER_STATE = "Illegal Adapter State";

    private static OPERATION_TIMEOUT = "Operation Timeout";

    private static ADAPTER_CLOSED = "Protocol Client Adapter Closed";

    private static isUnsubackReasonCodeRetryable(reasonCode: mqtt5.UnsubackReasonCode) : boolean {
        switch (reasonCode) {
            case mqtt5.UnsubackReasonCode.UnspecifiedError:
            case mqtt5.UnsubackReasonCode.ImplementationSpecificError:
                return true;

            default:
                return false;
        }
    }

    private static isSubackReasonCodeRetryable(reasonCode: mqtt5.SubackReasonCode) : boolean {
        switch (reasonCode) {
            case mqtt5.SubackReasonCode.UnspecifiedError:
            case mqtt5.SubackReasonCode.PacketIdentifierInUse:
            case mqtt5.SubackReasonCode.ImplementationSpecificError:
            case mqtt5.SubackReasonCode.QuotaExceeded:
                return true;

            default:
                return false;
        }
    }
}
