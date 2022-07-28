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
import * as mqtt_utils from "./mqtt5_utils";
import * as mqtt5_packet from "../common/mqtt5_packet";
import {ClientSessionBehavior, RetryJitterType} from "../common/mqtt5";
import {normalize_payload} from "../common/mqtt_shared";
import * as auth from "./auth";

export {
    NegotiatedSettings,
    StoppedEventListener,
    AttemptingConnectEventListener,
    ConnectionSuccessEventListener,
    ConnectionFailureEventListener,
    DisconnectionEventListener,
    MessageReceivedEventListener,
    IMqtt5Client,
    ClientSessionBehavior,
    RetryJitterType
} from "../common/mqtt5";


/**
 * Factory function that allows the user to completely control the url used to form the websocket handshake
 * request.
 */
export type Mqtt5WebsocketUrlFactory = () => string;

/**
 * Type of url to construct when establishing an MQTT5 connection over websockets
 */
export enum Mqtt5WebsocketUrlFactoryType {

    /**
     * Websocket connection over plain-text with no additional handshake transformation
     */
    Ws = 1,

    /**
     * Websocket connection over TLS with no additional handshake transformation
     */
    Wss = 2,

    /**
     * Websocket connection over TLS with a handshake signed by the Aws Sigv4 signing process
     */
    Sigv4 = 3,

    /**
     * Websocket connection whose url is formed by a user-supplied callback function
     */
    Custom = 4
}

/**
 * Websocket factory options discriminated union variant for untransformed connections over plain-text
 */
export interface Mqtt5WebsocketUrlFactoryWsOptions {
    urlFactory: Mqtt5WebsocketUrlFactoryType.Ws;
};

/**
 * Websocket factory options discriminated union variant for untransformed connections over TLS
 */
export interface Mqtt5WebsocketUrlFactoryWssOptions {
    urlFactory: Mqtt5WebsocketUrlFactoryType.Wss;
};

/**
 * Websocket factory options discriminated union variant for untransformed connections over TLS signed by
 * the AWS Sigv4 signing process.
 */
export interface Mqtt5WebsocketUrlFactorySigv4Options {
    urlFactory : Mqtt5WebsocketUrlFactoryType.Sigv4;

    /**
     * AWS Region to sign against.
     */
    region: string;

    /**
     * Provider to source AWS credentials from
     */
    credentials_provider: auth.CredentialsProvider;
}

/**
 * Websocket factory options discriminated union variant for arbitrarily transformed handshake urls.
 */
export interface Mqtt5WebsocketUrlFactoryCustomOptions {
    urlFactory: Mqtt5WebsocketUrlFactoryType.Custom;

    customUrlFactory: Mqtt5WebsocketUrlFactory;
};

/**
 * Union of all websocket factory option possibilities.
 */
export type Mqtt5WebsocketUrlFactoryOptions = Mqtt5WebsocketUrlFactoryWsOptions | Mqtt5WebsocketUrlFactoryWssOptions | Mqtt5WebsocketUrlFactorySigv4Options | Mqtt5WebsocketUrlFactoryCustomOptions;

/**
 * Browser-specific websocket configuration options for connection establishment
 */
export interface Mqtt5WebsocketConfig {

    /**
     * Options determining how the websocket url is created.
     */
    urlFactoryOptions : Mqtt5WebsocketUrlFactoryOptions;

    /**
     * Unchecked options set passed through to the underlying websocket implementation regardless of url factory.
     * Use this to control proxy settings amongst other things.
     */
    wsOptions?: any;
}

/**
 * Configuration options for mqtt5 client creation.
 */
export interface Mqtt5ClientConfig {

    /**
     * Host name of the MQTT server to connect to.
     */
    hostName: string;

    /**
     * Network port of the MQTT server to connect to.
     */
    port: number;

    /**
     * Controls how the MQTT5 client should behave with respect to MQTT sessions.
     */
    sessionBehavior? : ClientSessionBehavior;

    /**
     * Controls how the reconnect delay is modified in order to smooth out the distribution of reconnection attempt
     * timepoints for a large set of reconnecting clients.
     */
    retryJitterMode? : RetryJitterType;

    /**
     * Minimum amount of time to wait to reconnect after a disconnect.  Exponential backoff is performed with jitter
     * after each connection failure.
     */
    minReconnectDelayMs? : number;

    /**
     * Maximum amount of time to wait to reconnect after a disconnect.  Exponential backoff is performed with jitter
     * after each connection failure.
     */
    maxReconnectDelayMs? : number;

    /**
     * Amount of time that must elapse with an established connection before the reconnect delay is reset to the minimum.
     * This helps alleviate bandwidth-waste in fast reconnect cycles due to permission failures on operations.
     */
    minConnectedTimeToResetReconnectDelayMs? : number;

    /**
     * Time interval to wait after sending a CONNECT request for a CONNACK to arrive.  If one does not arrive, the
     * connection will be shut down.
     */
    connackTimeoutMs? : number;

    /**
     * All configurable options with respect to the CONNECT packet sent by the client, including the will.  These
     * connect properties will be used for every connection attempt made by the client.
     */
    connectProperties?: mqtt5_packet.ConnectPacket;

    /**
     * Options for the underlying websocket connection
     *
     * @group Browser-only
     */
    websocketOptions?: Mqtt5WebsocketConfig;
}

/**
 * @internal
 *
 * Mqtt-js only supports reconnect on a fixed delay.
 *
 * This helper class allows for variable time-delay rescheduling of reconnect attempts by implementing the
 * reconnect delay options supported by the native client.  Variable-delay reconnect actually happens by configuring
 * the mqtt-js client to have a much longer reconnect delay than our configured maximum and then letting this class
 * "interrupt" that long reconnect delay with the real, shorter wait-then-connect each time.
 */
class ReconnectionScheduler {
    private connectionFailureCount: number;
    private lastReconnectDelay: number | undefined;
    private resetConnectionFailureCountTask : ReturnType<typeof setTimeout> | undefined;
    private reconnectionTask : ReturnType<typeof setTimeout> | undefined;

    constructor(private browserClient: mqtt.MqttClient, private clientConfig: Mqtt5ClientConfig) {
        this.connectionFailureCount = 0;
        this.lastReconnectDelay = 0;
        this.resetConnectionFailureCountTask = undefined;
        this.reconnectionTask = undefined;
        this.lastReconnectDelay = undefined;
    }

    /**
     * Invoked by the client when a successful connection is established.  Schedules the task that will reset the
     * delay if a configurable amount of time elapses with a good connection.
     */
    onSuccessfulConnection() : void {
        this.clearTasks();

        this.resetConnectionFailureCountTask = setTimeout(() => {
            this.connectionFailureCount = 0;
            this.lastReconnectDelay = undefined;
        }, this.clientConfig.minConnectedTimeToResetReconnectDelayMs ?? mqtt_utils.DEFAULT_MIN_CONNECTED_TIME_TO_RESET_RECONNECT_DELAY_MS);
    }

    /**
     * Invoked by the client after a disconnection or connection failure occurs.  Schedules the next reconnect
     * task.
     */
    onConnectionFailureOrDisconnection() : void {
        this.clearTasks();

        let nextDelay : number = this.calculateNextReconnectDelay();

        this.lastReconnectDelay = nextDelay;
        this.connectionFailureCount += 1;

        this.reconnectionTask = setTimeout(() => {
            this.browserClient.reconnect();
        }, nextDelay);
    }

    /**
     * Resets any reconnect/clear-delay tasks.
     */
    clearTasks() : void {
        if (this.reconnectionTask !== undefined) {
            clearTimeout(this.reconnectionTask);
        }

        if (this.resetConnectionFailureCountTask !== undefined) {
            clearTimeout(this.resetConnectionFailureCountTask);
        }
    }

    private randomInRange(min: number, max: number) : number {
        return min + (max - min) * Math.random();
    }

    /**
     * Computes the next reconnect delay based on the Jitter/Retry configuration.
     * Implements jitter calculations in https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
     * @private
     */
    private calculateNextReconnectDelay() : number {
        const jitterType : mqtt5.RetryJitterType = this.clientConfig.retryJitterMode ?? mqtt5.RetryJitterType.Default;
        const [minDelay, maxDelay] : [number, number] = mqtt_utils.getOrderedReconnectDelayBounds(this.clientConfig.minReconnectDelayMs, this.clientConfig.maxReconnectDelayMs);
        const clampedFailureCount : number = Math.min(52, this.connectionFailureCount);
        let delay : number = 0;

        if (jitterType == mqtt5.RetryJitterType.None) {
            delay = minDelay * Math.pow(2, clampedFailureCount);
        } else if (jitterType == mqtt5.RetryJitterType.Decorrelated && this.lastReconnectDelay !== undefined) {
            delay = this.randomInRange(minDelay, 3 * this.lastReconnectDelay);
        } else {
            delay = this.randomInRange(minDelay, Math.min(maxDelay, minDelay * Math.pow(2, clampedFailureCount)));
        }

        delay = Math.min(maxDelay, delay);
        this.lastReconnectDelay = delay;

        return delay;
    }
}

/**
 * Elements of a simple state machine that allows us to adapt the mqtt-js control model to our mqtt5 client
 * control model (start/stop).
 *
 * @internal
 */
enum Mqtt5ClientState {
    Stopped = 0,
    Running = 1,
    Stopping = 2,
    Restarting = 3,
}

/**
 * Elements of a simple state machine that allows us to adapt the mqtt-js event set to our mqtt5 client's
 * lifecycle event set.
 *
 * @internal
 */
enum Mqtt5ClientLifecycleEventState {
    None = 0,
    Connecting = 1,
    Connected = 2,
    Disconnected = 3,
}

/**
 * Browser-specific MQTT5 client.
 *
 * <TODO> Long-form client documentation
 */
export class Mqtt5Client extends BufferedEventEmitter implements mqtt5.IMqtt5Client {
    private browserClient?: mqtt.MqttClient;
    private state : Mqtt5ClientState;
    private lifecycleEventState : Mqtt5ClientLifecycleEventState;
    private lastDisconnect? : mqtt5_packet.DisconnectPacket;
    private reconnectionScheduler? : ReconnectionScheduler;

    /**
     * Client constructor
     *
     * @param config The configuration for this client
     */
    constructor(private config: Mqtt5ClientConfig) {
        super();

        this.state = Mqtt5ClientState.Stopped;
        this.lifecycleEventState = Mqtt5ClientLifecycleEventState.None;
    }

    /**
     * Notifies the MQTT5 client that you want it to maintain connectivity to the configured endpoint.
     * The client will attempt to stay connected using the properties of the reconnect-related parameters
     * in the mqtt5 client configuration.
     *
     * This is an asynchronous operation.
     */
    start() {
        if (this.state == Mqtt5ClientState.Stopped) {

            this.state = Mqtt5ClientState.Running;
            this.lifecycleEventState = Mqtt5ClientLifecycleEventState.Connecting;
            this.lastDisconnect = undefined;

            /* pause event emission until everything is fully-initialized */
            this.cork();
            this.emit('attemptingConnect');

            const create_websocket_stream = (client: mqtt.MqttClient) => WebsocketUtils.create_mqtt5_websocket_stream(this.config);
            let mqtt_js_options : mqtt.IClientOptions = mqtt_utils.create_mqtt_js_client_config_from_crt_client_config(this.config);
            this.browserClient = new mqtt.MqttClient(create_websocket_stream, mqtt_js_options);

            // hook up events
            this.browserClient.on('end', () => {this._on_stopped_internal();});
            this.browserClient.on('reconnect', () => {this.on_attempting_connect();});
            this.browserClient.on('connect', (connack: mqtt.IConnackPacket) => {this.on_connection_success(connack);});
            this.browserClient.on('message', (topic: string, payload: Buffer, packet: mqtt.IPublishPacket) => { this.on_message(topic, payload, packet);});
            this.browserClient.on('error', (error: Error) => { this.on_browser_client_error(error); });
            this.browserClient.on('close', () => { this.on_browser_close(); });
            this.browserClient.on('disconnect', (packet: mqtt.IDisconnectPacket) => { this.on_browser_disconnect_packet(packet); });

            this.reconnectionScheduler = new ReconnectionScheduler(this.browserClient, this.config);

            /* unpause event emission */
            this.uncork();
        } else if (this.state == Mqtt5ClientState.Stopping) {
            this.state = Mqtt5ClientState.Restarting;
        }
    }

    /**
     * Notifies the MQTT5 client that you want it to end connectivity to the configured endpoint, disconnecting any
     * existing connection and halting reconnection attempts.
     *
     * This is an asynchronous operation.  Once the process completes, no further events will be emitted until the client
     * has {@link start} invoked.
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
     * Subscribe to one or more topic filters by queuing a SUBSCRIBE packet to be sent to the server.
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

            // @ts-ignore
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
     * Unsubscribe from one or more topic filters by queuing an UNSUBSCRIBE packet to be sent to the server.
     *
     * @param packet UNSUBSCRIBE packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the UNSUBACK response
     */
    async unsubscribe(packet: mqtt5_packet.UnsubscribePacket) : Promise<mqtt5_packet.UnsubackPacket> {

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
                if (packet === undefined || packet.cmd !== 'unsuback') {
                    /* this is a complete lie */
                    let unsuback : mqtt5_packet.UnsubackPacket = {
                        type: mqtt5_packet.PacketType.Unsuback,
                        reasonCodes: topicFilters.map((filter: string, index: number, array : string[]) : mqtt5_packet.UnsubackReasonCode => { return mqtt5_packet.UnsubackReasonCode.Success; })
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
     * Send a message to subscribing clients by queuing a PUBLISH packet to be sent to the server.
     *
     * @param packet PUBLISH packet to send to the server
     * @returns a promise that will be rejected with an error or resolved with the PUBACK response (QoS 1), or
     * undefined (QoS 0)
     */
    async publish(packet: mqtt5_packet.PublishPacket) : Promise<mqtt5.PublishCompletionResult> {
        return new Promise<mqtt5.PublishCompletionResult>((resolve, reject) => {
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
            let qos : mqtt5_packet.QoS = packet.qos;

            this.browserClient.publish(packet.topicName, normalize_payload(packet.payload), publishOptions, (error, completionPacket) => {
                if (error) {
                    rejectAndEmit(error);
                    return;
                }

                switch (qos) {
                    case mqtt5_packet.QoS.AtMostOnce:
                        resolve(undefined);
                        break;

                    case mqtt5_packet.QoS.AtLeastOnce:
                        if (completionPacket === undefined) {
                            rejectAndEmit(new Error("Invalid puback packet from mqtt-js"));
                            return;
                        }

                        /*
                         * sadly, mqtt-js returns the original publish packet when the puback is a success, so we have
                         * to create a fake puback instead.  This means we won't reflect any reason string or
                         * user properties that might have been present in the real puback.
                         */
                        if (completionPacket.cmd !== "puback") {
                            resolve({
                                type : mqtt5_packet.PacketType.Puback,
                                reasonCode : mqtt5_packet.PubackReasonCode.Success
                            })
                        }

                        const puback : mqtt5_packet.PubackPacket = mqtt_utils.transform_mqtt_js_puback_to_crt_puback(completionPacket as mqtt.IPubackPacket);
                        resolve(puback);
                        break;

                    default:
                        /* Technically, mqtt-js supports QoS 2 but we don't yet model it in the CRT types */
                        rejectAndEmit(new Error("Unsupported QoS value"));
                        break;
                }
            });
        });
    }

    /**
     * Event emitted when the client encounters an error condition.
     *
     * Listener type: {@link ErrorEventListener}
     *
     * @event
     */
    static ERROR : string = 'error';

    /**
     * Event emitted when an MQTT PUBLISH packet is received by the client.
     *
     * Listener type: {@link MessageReceivedEventListener}
     *
     * @event
     */
    static MESSAGE_RECEIVED : string = 'messageReceived';

    /**
     * Event emitted when the client begins a connection attempt.
     *
     * Listener type: {@link AttemptingConnectEventListener}
     *
     * @event
     */
    static ATTEMPTING_CONNECT : string = 'attemptingConnect';

    /**
     * Event emitted when the client successfully establishes an MQTT connection.  Only emitted after
     * an {@link ATTEMPTING_CONNECT attemptingConnect} event.
     *
     * Listener type: {@link ConnectionSuccessEventListener}
     *
     * @event
     */
    static CONNECTION_SUCCESS : string = 'connectionSuccess';

    /**
     * Event emitted when the client fails to establish an MQTT connection.  Only emitted after
     * an {@link ATTEMPTING_CONNECT attemptingConnect} event.
     *
     * Listener type: {@link ConnectionFailureEventListener}
     *
     * @event
     */
    static CONNECTION_FAILURE : string = 'connectionFailure';

    /**
     * Event emitted when the client's current connection is closed for any reason.  Only emitted after
     * a {@link CONNECTION_SUCCESS connectionSuccess} event.
     *
     * Listener type: {@link DisconnectionEventListener}
     *
     * @event
     */
    static DISCONNECTION : string = 'disconnection';

    /**
     * Event emitted when the client finishes shutdown as a result of the user invoking {@link stop}.
     *
     * Listener type: {@link StoppedEventListener}
     *
     * @event
     */
    static STOPPED : string = 'stopped';

    /**
     * Registers a listener for the client's {@link ERROR error} event.  An {@link ERROR error} event is emitted when
     * the client encounters an error condition.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'error', listener: mqtt5.ErrorEventListener): this;

    /**
     * Registers a listener for the client's {@link MESSAGE_RECEIVED messageReceived} event.  A
     * {@link MESSAGE_RECEIVED messageReceived} event is emitted when an MQTT PUBLISH packet is received by the
     * client.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'messageReceived', listener: mqtt5.MessageReceivedEventListener): this;

    /**
     * Registers a listener for the client's {@link ATTEMPTING_CONNECT attemptingConnect} event.  A
     * {@link ATTEMPTING_CONNECT attemptingConnect} event is emitted every time the client begins a connection attempt.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'attemptingConnect', listener: mqtt5.AttemptingConnectEventListener): this;

    /**
     * Registers a listener for the client's {@link CONNECTION_SUCCESS connectionSuccess} event.  A
     * {@link CONNECTION_SUCCESS connectionSuccess} event is emitted every time the client successfully establishes
     * an MQTT connection.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'connectionSuccess', listener: mqtt5.ConnectionSuccessEventListener): this;

    /**
     * Registers a listener for the client's {@link CONNECTION_FAILURE connectionFailure} event.  A
     * {@link CONNECTION_FAILURE connectionFailure} event is emitted every time the client fails to establish an
     * MQTT connection.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'connectionFailure', listener: mqtt5.ConnectionFailureEventListener): this;

    /**
     * Registers a listener for the client's {@link DISCONNECTION disconnection} event.  A
     * {@link DISCONNECTION disconnection} event is emitted when the client's current MQTT connection is closed
     * for any reason.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'disconnection', listener: mqtt5.DisconnectionEventListener): this;

    /**
     * Registers a listener for the client's {@link STOPPED stopped} event.  A
     * {@link STOPPED stopped} event is emitted when the client finishes shutdown as a
     * result of the user invoking {@link stop}.
     *
     * @param event the type of event to listen to
     * @param listener the event listener to add
     */
    on(event: 'stopped', listener: mqtt5.StoppedEventListener): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    private on_browser_disconnect_packet(packet: mqtt.IDisconnectPacket) {
        this.lastDisconnect = mqtt_utils.transform_mqtt_js_disconnect_to_crt_disconnect(packet);
    }

    private on_browser_close() {
        if (this.lifecycleEventState == Mqtt5ClientLifecycleEventState.Connected) {
            this.lifecycleEventState = Mqtt5ClientLifecycleEventState.Disconnected;
            this.reconnectionScheduler?.onConnectionFailureOrDisconnection();
            this.emit('disconnection', new CrtError("disconnected"), this.lastDisconnect);
            this.lastDisconnect = undefined;
        } else if (this.lifecycleEventState == Mqtt5ClientLifecycleEventState.Connecting) {
            this.lifecycleEventState = Mqtt5ClientLifecycleEventState.Disconnected;
            this.reconnectionScheduler?.onConnectionFailureOrDisconnection();
            this.emit('connectionFailure', new CrtError("connectionFailure"), null);
        }
    }

    private on_browser_client_error(error: Error) {
        this.emit('error', new CrtError(error));
    }

    private on_attempting_connect () {
        this.lifecycleEventState = Mqtt5ClientLifecycleEventState.Connecting;
        this.emit('attemptingConnect');
    }

    private on_connection_success (connack: mqtt.IConnackPacket) {
        this.lifecycleEventState = Mqtt5ClientLifecycleEventState.Connected;

        this.reconnectionScheduler?.onSuccessfulConnection();

        let crt_connack : mqtt5_packet.ConnackPacket = mqtt_utils.transform_mqtt_js_connack_to_crt_connack(connack);
        let settings : mqtt5.NegotiatedSettings = mqtt_utils.create_negotiated_settings(this.config, crt_connack);

        this.emit('connectionSuccess', crt_connack, settings);
    }

    private _on_stopped_internal() {
        this.reconnectionScheduler?.clearTasks();
        this.reconnectionScheduler = undefined;
        this.browserClient = undefined;
        this.lifecycleEventState = Mqtt5ClientLifecycleEventState.None;

        if (this.state == Mqtt5ClientState.Restarting) {
            this.state = Mqtt5ClientState.Stopped;
            this.start();
        } else if (this.state != Mqtt5ClientState.Stopped) {
            this.state = Mqtt5ClientState.Stopped;
            this.emit('stopped');
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