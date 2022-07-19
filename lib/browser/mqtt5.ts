/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt5
 * @mergeTarget
 */

import {BufferedEventEmitter} from "../common/event";
import * as mqtt5 from "../common/mqtt5";

import {CrtError} from "./error";
import * as mqtt from "mqtt";
import * as WebsocketUtils from "./ws";
import {WebsocketOptions} from "./ws";
import * as auth from "./auth";
import * as mqtt_utils from "./mqtt_utils";
import * as mqtt5_packet from "../common/mqtt5_packet";

/**
 * Configuration interface for mqtt5 clients
 */
export interface Mqtt5ClientConfig extends mqtt5.Mqtt5ClientConfigShared {

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
export class Mqtt5Client extends BufferedEventEmitter implements mqtt5.IMqtt5Client {
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
    on(event: 'error', listener: mqtt5.ErrorEventHandler): this;

    /**
     * Emitted when an MQTT PUBLISH packet is received by the client
     *
     * @param event the type of event (messageReceived)
     * @param listener the messageReceived event listener to add
     *
     * @event
     */
    on(event: 'messageReceived', listener: mqtt5.MessageReceivedEventHandler): this;

    /**
     * Emitted when the client begins a connection attempt
     *
     * @param event the type of event (attemptingConnect)
     * @param listener the attemptingConnect event listener to add
     *
     * @event
     */
    on(event: 'attemptingConnect', listener: mqtt5.AttemptingConnectEventHandler): this;

    /**
     * Emitted when the client successfully establishes an MQTT connection
     *
     * @param event the type of event (connectionSuccess)
     * @param listener the connectionSuccess event listener to add
     *
     * @event
     */
    on(event: 'connectionSuccess', listener: mqtt5.ConnectionSuccessEventHandler): this;

    /**
     * Emitted when the client fails to establish an MQTT connection
     *
     * @param event the type of event (connectionFailure)
     * @param listener the connectionFailure event listener to add
     *
     * @event
     */
    on(event: 'connectionFailure', listener: mqtt5.ConnectionFailureEventHandler): this;

    /**
     * Emitted when the client's current MQTT connection is shut down
     *
     * @param event the type of event (disconnection)
     * @param listener the disconnection event listener to add
     *
     * @event
     */
    on(event: 'disconnection', listener: mqtt5.DisconnectionEventHandler): this;

    /**
     * Emitted when the client reaches the 'Stopped' state as a result of the user invoking .stop()
     *
     * @param event the type of event (stopped)
     * @param listener the stopped event listener to add
     *
     * @event
     */
    on(event: 'stopped', listener: mqtt5.StoppedEventHandler): this;

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
            let mqtt_js_options : mqtt.IClientOptions = mqtt_utils.create_mqtt_js_client_config_from_crt_client_config(this.config);
            this.browserClient = new mqtt.MqttClient(create_websocket_stream, mqtt_js_options);

            // hook up events
            this.browserClient.on('end', () => {this._on_stopped_internal();});
            this.browserClient.on('reconnect', () => {this.on_attempting_connect();});
            this.browserClient.on('connect', (connack: mqtt.IConnackPacket) => {this.on_connection_success(connack);});
            this.browserClient.on('message', this.on_message);

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
        let crt_connack : mqtt5_packet.ConnackPacket = mqtt_utils.transform_mqtt_js_connack_to_crt_connack(connack);
        let settings : mqtt5.NegotiatedSettings = mqtt_utils.create_negotiated_settings(this.config, crt_connack);

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
    stop(disconnectPacket?: mqtt5_packet.DisconnectPacket) {
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
    async subscribe(packet: mqtt5_packet.SubscribePacket) : Promise<mqtt5_packet.SubackPacket> {
        return new Promise<mqtt5_packet.SubackPacket>((resolve, reject) => {

            let rejectAndEmit = (error: Error) => {
                let crtError : CrtError = new CrtError(error);
                reject(crtError);
                this.on_error(crtError);
            };

            if (this.browserClient === undefined) {
                rejectAndEmit(new Error("Client is stopped and cannot subscribe"));
                return;
            }

            let subMap : mqtt.ISubscriptionMap = mqtt_utils.transform_crt_subscribe_to_mqtt_js_subscription_map(packet);
            let subOptions : mqtt.IClientSubscribeOptions = mqtt_utils.transform_crt_subscribe_to_mqtt_js_subscribe_options(packet);

            this.browserClient.subscribe(subMap, subOptions, (error, grants) => {
                if (error) {
                    rejectAndEmit(error);
                    return;
                }

                const suback : mqtt5_packet.SubackPacket = mqtt_utils.transform_mqtt_js_subscription_grants_to_crt_suback(grants);
                resolve(suback);
            });
        });
    }

    /**
     * Tells the client to attempt to unsubscribe from one or more topic filters.
     *
     * @param packet UNSUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the UNSUBACK response
     */
    async unsubscribe(packet: mqtt5_packet.UnsubscribePacket) : Promise<mqtt5_packet.UnsubackPacket> {
        let topicFilters : string[] = packet.topicFilters;

        return new Promise<mqtt5_packet.UnsubackPacket>((resolve, reject) => {
            let rejectAndEmit = (error: Error) => {
                let crtError : CrtError = new CrtError(error);
                reject(crtError);
                this.on_error(crtError);
            };

            if (this.browserClient === undefined) {
                rejectAndEmit(new Error("Client is stopped and cannot unsubscribe"));
                return;
            }

            let topicFilters : string[] = packet.topicFilters;
            let unsubOptions : Object = mqtt_utils.transform_crt_unsubscribe_to_mqtt_js_unsubscribe_options(packet);

            this.browserClient.unsubscribe(topicFilters, unsubOptions, (error, packet) => {
                if (error) {
                    rejectAndEmit(error);
                    return;
                }

                /*
                 * sigh, mqtt-js doesn't emit the unsuback packet, we have to make something up that won't reflect
                 * reality.
                 */
                if (packet === undefined) {
                    /* this is a complete lie */
                    let unsuback : mqtt5_packet.UnsubackPacket = {
                        reasonCodes: topicFilters.map((filter: string, index: number, array : string[]) : mqtt5_packet.UnsubackReasonCode => { return mqtt5_packet.UnsubackReasonCode.Success; });
                    };
                    resolve(unsuback);
                } else {
                    const unsuback: mqtt5_packet.UnsubackPacket = mqtt_utils.transform_mqtt_js_unsuback_to_crt_unsuback(packet as mqtt.IUnsubackPacket);
                    resolve(unsuback);
                }
            });
        });
    }

    /**
     * Tells the client to attempt to send a PUBLISH packet
     *
     * @param packet PUBLISH packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the PUBACK response
     */
    async publish(packet: mqtt5_packet.PublishPacket) : Promise<mqtt5_packet.PubackPacket> {
        return new Promise<mqtt5_packet.PubackPacket>((resolve, reject) => {
            let rejectAndEmit = (error: Error) => {
                let crtError : CrtError = new CrtError(error);
                reject(crtError);
                this.on_error(crtError);
            };

            if (this.browserClient === undefined) {
                rejectAndEmit(new Error("Client is stopped and cannot publish"));
                return;
            }

            let publishOptions : mqtt.IClientPublishOptions = mqtt_utils.transform_crt_publish_to_mqtt_js_publish_options(packet);

            this.browserClient.publish(packet.topicName, mqtt_utils.normalize_payload(packet.payload), publishOptions, (error, packet) => {
                if (error) {
                    rejectAndEmit(error);
                    return;
                }

                if (packet === undefined) {
                    rejectAndEmit(new Error("Undefined puback packet from mqtt-js"));
                    return;
                }

                const puback : mqtt5_packet.PubackPacket = mqtt_utils.transform_mqtt_js_puback_to_crt_puback(packet as mqtt.IPubackPacket);
                resolve(puback);
            });
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

    private on_error = (error: CrtError) => {
        this.emit('error', error);
    }

    private on_message = (topic: string, payload: Buffer, packet: mqtt.IPublishPacket) => {
        let crtPublish : mqtt5_packet.PublishPacket = mqtt_utils.transform_mqtt_js_publish_to_crt_publish(packet);

        this.emit('messageReceived', crtPublish);
    }
}