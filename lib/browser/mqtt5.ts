/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt5
 * @mergeTarget
 */


import {
    ConnackPacket,
    DisconnectPacket,
    PubackPacket,
    PublishPacket,
    SubackPacket,
    SubscribePacket,
    UnsubackPacket,
    UnsubscribePacket
} from "../common/mqtt5_packet";
import {BufferedEventEmitter} from "../common/event";
import {
    AttemptingConnectEventHandler,
    ClientSessionBehavior,
    ConnectionFailureEventHandler,
    ConnectionSuccessEventHandler,
    DisconnectionEventHandler,
    ErrorEventHandler,
    IMqtt5Client,
    MessageReceivedEventHandler,
    Mqtt5ClientConfigShared, NegotiatedSettings,
    StoppedEventHandler
} from "../common/mqtt5";

import {CrtError} from "./error";
import * as mqtt from "mqtt";
import * as WebsocketUtils from "./ws";
import {WebsocketOptions} from "./ws";
import * as auth from "./auth";
import * as mqtt_utils from "./mqtt_utils";


/**
 * Configuration interface for mqtt5 clients
 */
export interface Mqtt5ClientConfig extends Mqtt5ClientConfigShared {

    /** Options for the underlying websocket connection */
    websocket?: WebsocketOptions;

    /** Options for the underlying credentianls provider */
    credentials_provider?: auth.CredentialsProvider;
}

enum Mqtt5ClientState {
    Stopped = 0,
    Running = 1,
    Stopping = 2,
    Restarting = 3,
}

/**
 * Browser-specific MQTT5 client.
 *
 * <TODO> Long-form client documentation
 */
export class Mqtt5Client extends BufferedEventEmitter implements IMqtt5Client {
    private browserClient?: mqtt.MqttClient;
    private state : Mqtt5ClientState;

    /**
     * Client constructor
     *
     * @param config The configuration for this client
     */
    constructor(private config: Mqtt5ClientConfig) {
        super();

        this.state = Mqtt5ClientState.Stopped;

        this.on('stopped', () => { this._on_stopped_internal(); });
    }

    /**
     * Emitted when a client method invocation results in an error
     *
     * @param event the type of event (error)
     * @param listener the error event listener to add
     *
     * @event
     */
    on(event: 'error', listener: ErrorEventHandler): this;

    /**
     * Emitted when an MQTT PUBLISH packet is received by the client
     *
     * @param event the type of event (messageReceived)
     * @param listener the messageReceived event listener to add
     *
     * @event
     */
    on(event: 'messageReceived', listener: MessageReceivedEventHandler): this;

    /**
     * Emitted when the client begins a connection attempt
     *
     * @param event the type of event (attemptingConnect)
     * @param listener the attemptingConnect event listener to add
     *
     * @event
     */
    on(event: 'attemptingConnect', listener: AttemptingConnectEventHandler): this;

    /**
     * Emitted when the client successfully establishes an MQTT connection
     *
     * @param event the type of event (connectionSuccess)
     * @param listener the connectionSuccess event listener to add
     *
     * @event
     */
    on(event: 'connectionSuccess', listener: ConnectionSuccessEventHandler): this;

    /**
     * Emitted when the client fails to establish an MQTT connection
     *
     * @param event the type of event (connectionFailure)
     * @param listener the connectionFailure event listener to add
     *
     * @event
     */
    on(event: 'connectionFailure', listener: ConnectionFailureEventHandler): this;

    /**
     * Emitted when the client's current MQTT connection is shut down
     *
     * @param event the type of event (disconnection)
     * @param listener the disconnection event listener to add
     *
     * @event
     */
    on(event: 'disconnection', listener: DisconnectionEventHandler): this;

    /**
     * Emitted when the client reaches the 'Stopped' state as a result of the user invoking .stop()
     *
     * @param event the type of event (stopped)
     * @param listener the stopped event listener to add
     *
     * @event
     */
    on(event: 'stopped', listener: StoppedEventHandler): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    /**
     * Notifies the MQTT5 client that you want it maintain connectivity to the configured endpoint.
     * The client will attempt to stay connected using the properties of the reconnect-related parameters
     * in the mqtt5 client configuration.
     *
     * This is an asynchronous operation.
     */
    start() {
        if (this.state == Mqtt5ClientState.Stopped) {

            this.cork();
            this.emit('attemptingConnect');

            const create_websocket_stream = (client: mqtt.MqttClient) => WebsocketUtils.create_mqtt5_websocket_stream(this.config);
            const websocketXform = undefined;

            let will = mqtt_utils.create_mqtt_js_will_from_config(this.config.connectProperties);

            let mqtt_js_options : mqtt.IClientOptions = {
                keepalive: this.config.connectProperties?.keepAliveIntervalSeconds ?? 1200,
                clientId: this.config.connectProperties?.clientId ?? '',
                connectTimeout: this.config.connackTimeoutMs ?? 30 * 1000,
                clean: this.config.sessionBehavior == ClientSessionBehavior.Clean,
                reconnectPeriod: this.config.maxReconnectDelayMs ?? 120000,
                username: this.config.connectProperties?.username,
                // password: this.config.connectProperties?.password ?? undefined,
                queueQoSZero : false,
                // @ts-ignore
                autoUseTopicAlias : false,
                autoAssignTopicAlias : false,
                properties : {
                    sessionExpiryInterval : this.config.connectProperties?.sessionExpiryIntervalSeconds,
                    receiveMaximum : this.config.connectProperties?.receiveMaximum,
                    maximumPacketSize : this.config.connectProperties?.maximumPacketSizeBytes,
                    requestResponseInformation : this.config.connectProperties?.requestResponseInformation?.valueOf() ?? undefined,
                    requestProblemInformation : this.config.connectProperties?.requestProblemInformation?.valueOf() ?? undefined,
                    userProperties : ??
                },
                will: will,
                transformWsUrl: websocketXform,
                resubscribe : false
            };

            this.browserClient = new mqtt.MqttClient(create_websocket_stream, mqtt_js_options);

            // hook up events
            this.browserClient.on('end', () => {this._on_stopped_internal();});
            this.browserClient.on('reconnect', () => {this.on_attempting_connect();});
            this.browserClient.on('connect', (connack: mqtt.IConnackPacket) => {this.on_connection_success(connack);});
            this.browserClient.on('close', () => {console.log('Close event received!');});
            this.browserClient.on('offline', () => {console.log('Offline event received!');});
            this.browserClient.on('disconnect', (packet: mqtt.IDisconnectPacket) => {console.log('Disconnect event received!');});

            // uncork
            this.uncork();
        } else if (this.state == Mqtt5ClientState.Stopping) {
            this.state = Mqtt5ClientState.Restarting;
        }
    }

    private on_attempting_connect = () => {
        this.emit('attemptingConnect');
    }

    private on_connection_success = (connack: mqtt.IConnackPacket) => {
        let crt_connack : ConnackPacket = mqtt_utils.transform_mqtt_js_connack_to_crt_connack(connack);
        let settings : NegotiatedSettings = mqtt_utils.create_negotiated_settings(this.config, crt_connack);

        this.emit('connectionSuccess', crt_connack, settings);
    }

    /**
     * Notifies the MQTT5 client that you want it to end connectivity to the configured endpoint, disconnecting any
     * existing connection and halting any reconnect attempts.
     *
     * This is an asynchronous operation.
     *
     * @param disconnectPacket (optional) properties of a DISCONNECT packet to send as part of the shutdown process
     */
    stop(disconnectPacket?: DisconnectPacket) {
        if (this.state == Mqtt5ClientState.Running) {
            this.state = Mqtt5ClientState.Stopping;
            this.browserClient?.end(true);
        } else if (this.state == Mqtt5ClientState.Restarting) {
            this.state = Mqtt5ClientState.Stopping;
        }
    }

    /**
     * Tells the client to attempt to subscribe to one or more topic filters.
     *
     * @param packet SUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the SUBACK response
     */
    async subscribe(packet: SubscribePacket) : Promise<SubackPacket> {
        return new Promise<SubackPacket>((resolve, reject) => {
            reject(new CrtError("Unimplemented"));
        });
    }

    /**
     * Tells the client to attempt to unsubscribe from one or more topic filters.
     *
     * @param packet UNSUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the UNSUBACK response
     */
    async unsubscribe(packet: UnsubscribePacket) : Promise<UnsubackPacket> {
        return new Promise<UnsubackPacket>((resolve, reject) => {
            reject(new CrtError("Unimplemented"));
        });
    }

    /**
     * Tells the client to attempt to send a PUBLISH packet
     *
     * @param packet PUBLISH packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the PUBACK response
     */
    async publish(packet: PublishPacket) : Promise<PubackPacket> {
        return new Promise<PubackPacket>((resolve, reject) => {
            reject(new CrtError("Unimplemented"));
        });
    }

    private _on_stopped_internal() {
        this.browserClient = undefined;

        if (this.state == Mqtt5ClientState.Restarting) {
            this.state = Mqtt5ClientState.Stopped;
            this.start();
        } else {
            this.state = Mqtt5ClientState.Stopped;
        }
    }
}