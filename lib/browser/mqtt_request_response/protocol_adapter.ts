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
import {OnConnectionSuccessResult} from "../mqtt";


const MS_PER_SECOND : number = 1000;

export interface RequestResponsePublishOptions {
    topic: string,

    payload: mqtt_request_response.RequestPayload
}

export interface RequestResponseSubscribeOptions {
    topicFilter: string,

    timeoutInSeconds: number,
}

export interface SubscribeEvent {
    topicFilter: string,
    err?: ICrtError
}

export type SubscribeEventListener = (event: SubscribeEvent) => void;

export interface RequestResponseUnsubscribeOptions {
    topicFilter: string,

    timeoutInSeconds: number,
}

export interface UnsubscribeEvent {
    topicFilter: string,
    err?: ICrtError,
    retryable?: boolean
}

export type UnsubscribeEventListener = (event: UnsubscribeEvent) => void;

export enum ConnectionState {
    CONNECTED = 0,
    DISCONNECTED = 1,
};

export interface ConnectionStatusEvent {
    status: ConnectionState,
    joinedSession?: boolean,
}

export type ConnectionStatusEventListener = (event: ConnectionStatusEvent) => void;

function createPublishPromise5(client: mqtt5.Mqtt5Client, publishOptions: RequestResponsePublishOptions): Promise<void> {
    let publishPromise = client.publish({
        qos: mqtt5.QoS.AtLeastOnce,
        topicName: publishOptions.topic,
        payload: publishOptions.payload,
    });

    return publishPromise.then(
        (result) => {},
        (err) => {
            throw err;
        }
    );
}

function createPublishPromise311(client: mqtt311.MqttClientConnection, publishOptions: RequestResponsePublishOptions): Promise<void> {
    let publishPromise = client.publish(publishOptions.topic, publishOptions.payload, mqtt311.QoS.AtLeastOnce);

    return publishPromise.then((result) => {}, (err) => { throw err; });
}

function createSubscribePromise5(client: mqtt5.Mqtt5Client, subscribeOptions: RequestResponseSubscribeOptions): Promise<SubscribeEvent> {
    let packet: mqtt5.SubscribePacket = {
        subscriptions: [
            {
                topicFilter: subscribeOptions.topicFilter,
                qos: mqtt5.QoS.AtLeastOnce,
            }
        ]
    }

    return client.subscribe(packet).then(
        (_): SubscribeEvent => {
            return {
                topicFilter: subscribeOptions.topicFilter
            };
        },
        (err) => {
            return {
                topicFilter: subscribeOptions.topicFilter,
                err: err
            };
        }
    );
}

function createSubscribePromise311(client: mqtt311.MqttClientConnection, subscribeOptions: RequestResponseSubscribeOptions): Promise<SubscribeEvent> {
    return client.subscribe(subscribeOptions.topicFilter, mqtt311.QoS.AtLeastOnce).then(
        (_): SubscribeEvent => {
            return {
                topicFilter: subscribeOptions.topicFilter
            };
        },
        (err) => {
            return {
                topicFilter: subscribeOptions.topicFilter,
                err: err
            };
        }
    );
}

function createUnsubscribePromise5(client: mqtt5.Mqtt5Client, unsubscribeOptions: RequestResponseUnsubscribeOptions): Promise<UnsubscribeEvent> {
    let packet : mqtt5.UnsubscribePacket = {
        topicFilters: [ unsubscribeOptions.topicFilter ]
    };

    return client.unsubscribe(packet).then(
        (_) : SubscribeEvent => {
            return {
                topicFilter: unsubscribeOptions.topicFilter
            };
        },
        (err) => {
            return {
                topicFilter: unsubscribeOptions.topicFilter,
                err: err,
                retryable: true, // TODO: reevaluate if we can do anything here
            };
        }
    );
}

function createUnsubscribePromise311(client: mqtt311.MqttClientConnection, unsubscribeOptions: RequestResponseUnsubscribeOptions): Promise<UnsubscribeEvent> {
    return client.unsubscribe(unsubscribeOptions.topicFilter).then(
        (_): UnsubscribeEvent => {
            return {
                topicFilter: unsubscribeOptions.topicFilter
            };
        },
        (err) => {
            return {
                topicFilter: unsubscribeOptions.topicFilter,
                err: err,
                retryabkle: true, // TODO: reevaluate
            };
        }
    );
}

export class ProtocolAdapter extends BufferedEventEmitter {

    private client5?: mqtt5.Mqtt5Client;
    private client311?: mqtt311.MqttClientConnection;
    private connectionState: ConnectionState;

    private connectionSuccessListener5 : mqtt5.ConnectionSuccessEventListener = (event : mqtt5.ConnectionSuccessEvent) => {
        this.connectionState = ConnectionState.CONNECTED;
        setImmediate(() => { this.emit(ProtocolAdapter.CONNECTION_STATUS, {
            connectionState: ConnectionState.CONNECTED,
            joinedSession: event.connack.sessionPresent,
        })});
    };

    private disconnectionListener5 : mqtt5.DisconnectionEventListener = (event : mqtt5.DisconnectionEvent) => {
        this.connectionState = ConnectionState.DISCONNECTED;
        setImmediate(() => { this.emit(ProtocolAdapter.CONNECTION_STATUS, {
            connectionState: ConnectionState.DISCONNECTED,
        })});
    };

    private connectionSuccessListener311 : mqtt311.MqttConnectionSuccess = (event : OnConnectionSuccessResult) => {
        this.connectionState = ConnectionState.CONNECTED;
        setImmediate(() => { this.emit(ProtocolAdapter.CONNECTION_STATUS, {
            connectionState: ConnectionState.CONNECTED,
            joinedSession: event.session_present,
        })});
    };

    private disconnectionListener311 : mqtt311.MqttConnectionDisconnected = () => {
        this.connectionState = ConnectionState.DISCONNECTED;
        setImmediate(() => { this.emit(ProtocolAdapter.CONNECTION_STATUS, {
            connectionState: ConnectionState.DISCONNECTED,
        })});
    };

    private constructor() {
        super();

        this.connectionState = ConnectionState.DISCONNECTED;
    }

    public static newFrom5(client: mqtt5.Mqtt5Client) : ProtocolAdapter {
        let adapter = new ProtocolAdapter();

        adapter.client5 = client;

        client.addListener(mqtt5.Mqtt5Client.CONNECTION_SUCCESS, adapter.connectionSuccessListener5);
        client.addListener(mqtt5.Mqtt5Client.DISCONNECTION, adapter.disconnectionListener5);
        adapter.connectionState = client.isConnected() ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED;

        return adapter;
    }

    public static newFrom311(client: mqtt311.MqttClientConnection) : ProtocolAdapter {
        let adapter = new ProtocolAdapter();

        adapter.client311 = client;

        client.addListener(mqtt311.MqttClientConnection.CONNECTION_SUCCESS, adapter.connectionSuccessListener311);
        client.addListener(mqtt311.MqttClientConnection.DISCONNECT, adapter.disconnectionListener311);
        adapter.connectionState = client.isConnected() ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED;

        return adapter;
    }

    public close() : void {
        if (this.client5) {
            this.client5.removeListener(mqtt5.Mqtt5Client.CONNECTION_SUCCESS, this.connectionSuccessListener5);
            this.client5.removeListener(mqtt5.Mqtt5Client.DISCONNECTION, this.disconnectionListener5);
            this.client5 = undefined;
        }

        if (this.client311) {
            this.client311.removeListener(mqtt311.MqttClientConnection.CONNECTION_SUCCESS, this.connectionSuccessListener311);
            this.client311.removeListener(mqtt311.MqttClientConnection.DISCONNECT, this.disconnectionListener311);
            this.client311 = undefined;
        }
    }

    public publish(publishOptions : RequestResponsePublishOptions) : Promise<void> {
        if (this.client5) {
            return createPublishPromise5(this.client5, publishOptions);
        } else if (this.client311) {
            return createPublishPromise311(this.client311, publishOptions);
        } else {
            throw new CrtError("Illegal adapter state");
        }
    }

    public subscribe(subscribeOptions: RequestResponseSubscribeOptions) : void {

        setImmediate(async () => {
            var subscribePromise: Promise<SubscribeEvent>;

            if (this.client5) {
                subscribePromise = createSubscribePromise5(this.client5, subscribeOptions);
            } else if (this.client311) {
                subscribePromise = createSubscribePromise311(this.client311, subscribeOptions);
            } else {
                throw new CrtError("Illegal adapter state");
            }

            let timeoutPromise: Promise<SubscribeEvent> = new Promise(
                resolve => setTimeout(() => {
                        return {
                            topicFilter:subscribeOptions.topicFilter,
                            err: new CrtError("OperationTimeout")
                        };
                    },
                    subscribeOptions.timeoutInSeconds * MS_PER_SECOND));

            let subscribeEvent = await Promise.race([subscribePromise, timeoutPromise]);

            this.emit(ProtocolAdapter.SUBSCRIBE, subscribeEvent);
        });
    }

    public unsubscribe(unsubscribeOptions: RequestResponseUnsubscribeOptions) : void {
        setImmediate(async () => {
            var unsubscribePromise: Promise<UnsubscribeEvent>;

            if (this.client5) {
                unsubscribePromise = createUnsubscribePromise5(this.client5, unsubscribeOptions);
            } else if (this.client311) {
                unsubscribePromise = createUnsubscribePromise311(this.client311, unsubscribeOptions);
            } else {
                throw new CrtError("Illegal adapter state");
            }

            let timeoutPromise: Promise<UnsubscribeEvent> = new Promise(
                resolve => setTimeout(() => {
                        return {
                            topicFilter:unsubscribeOptions.topicFilter,
                            err: new CrtError("OperationTimeout"),
                            retryable: true,
                        };
                    },
                    unsubscribeOptions.timeoutInSeconds * MS_PER_SECOND));

            let unsubscribeEvent = await Promise.race([unsubscribePromise, timeoutPromise]);

            this.emit(ProtocolAdapter.UNSUBSCRIBE, unsubscribeEvent);
        });
    }

    public getConnectionState() : ConnectionState {
        return this.connectionState;
    }

    static SUBSCRIBE : string = 'subscribe';

    static UNSUBSCRIBE : string = 'unsubscribe';

    static CONNECTION_STATUS : string = 'connectionStatus';

    on(event: 'subscribe', listener: SubscribeEventListener): this;

    on(event: 'unsubscribe', listener: UnsubscribeEventListener): this;

    on(event: 'connectionStatus', listener: ConnectionStatusEventListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }
}
