/* Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License").
* You may not use this file except in compliance with the License.
* A copy of the License is located at
*
*  http://aws.amazon.com/apache2.0
*
* or in the "license" file accompanying this file. This file is distributed
* on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
* express or implied. See the License for the specific language governing
* permissions and limitations under the License.
*/

import { MqttClient, IClientOptions, ISubscriptionGrant, IUnsubackPacket, IPublishPacket } from "mqtt";
import { AsyncClient } from "async-mqtt";
import * as WebsocketUtils from "./ws";
import * as trie from "./trie";

import { QoS, Payload, MqttRequest, MqttSubscribeRequest } from "../common/mqtt";
import { BufferedEventEmitter } from "../common/event";
import { CrtError } from "../browser";
export { QoS, Payload, MqttRequest, MqttSubscribeRequest } from "../common/mqtt";

export type WebsocketOptions = WebsocketUtils.WebsocketOptions;
export type AWSCredentials = WebsocketUtils.AWSCredentials;

export interface ConnectionConfig {
    client_id: string;
    host_name: string;
    connect_timeout: number;
    port: number;
    clean_session?: boolean;
    keep_alive?: number;
    timeout?: number;
    will?: string;
    username?: string;
    password?: string;
    websocket?: WebsocketOptions;
    credentials?: AWSCredentials;
}

export class Client {
    new_connection(config: ConnectionConfig) {
        return new Connection(this, config);
    }
}

type SubscriptionCallback = (topic: string, payload: ArrayBuffer) => void;

class TopicTrie extends trie.Trie<SubscriptionCallback> {
    constructor() {
        super('/');
    }

    protected find_node(key: string, op: trie.TrieOp) {
        const parts = this.split_key(key);
        let current = this.root;
        let parent = undefined;
        for (const part in parts) {
            let child = current.children.get(part);
            if (!child) {
                child = current.children.get('#');
                if (child) {
                    return child;
                }

                child = current.children.get('+');
            }
            if (!child) {
                if (op == trie.TrieOp.Insert) {
                    current.children.set(part, child = new trie.Node(part));
                }
                else {
                    return undefined;
                }
            }
            parent = current;
            current = child;
        }
        if (parent && op == trie.TrieOp.Delete) {
            parent.children.delete(current.key!);
        }
        return current;
    }
}

export class Connection extends BufferedEventEmitter {
    private connection: AsyncClient;
    private subscriptions = new TopicTrie();

    private create_websocket_stream = (client: MqttClient) => {
        return WebsocketUtils.create_websocket_stream(this.config);
    }

    private transform_websocket_url = (url: string, options: IClientOptions, client: MqttClient) => {
        return WebsocketUtils.transform_websocket_url(url, this.config);
    }

    constructor(
        readonly client: Client,
        private config: ConnectionConfig) {
        super();
        this.connection = new AsyncClient(new MqttClient(
            this.create_websocket_stream,
            {
                keepalive: this.config.keep_alive,
                clientId: this.config.client_id,
                connectTimeout: this.config.connect_timeout,
                clean: this.config.clean_session,
                username: this.config.username,
                password: this.config.password,
                reconnectPeriod: 0,
                will: this.config.will ? {
                    topic: "will",
                    payload: this.config.will,
                    qos: 1,
                    retain: false,
                } : undefined,
                transformWsUrl: (config.websocket || {}).protocol != 'wss-custom-auth' ? this.transform_websocket_url : undefined
            }
        ));
    }

    close() {
        if (this.connection.connected) {
            this.connection.end();
        }
    }

    /** Emitted when the connection is ready and is about to start sending response data */
    on(event: 'ready', listener: () => void): this;

    /** Emitted when connection has closed sucessfully. */
    on(event: 'end', listener: () => void): this;

    /**
     * Emitted when an error occurs
     * @param error - A CrtError containing the error that occurred
     */
    on(event: 'error', listener: (error: CrtError) => void): this;

    /**
     * Emitted when the connection is dropped unexpectedly. The error will contain the error
     * code and message.
     */
    on(event: 'interrupt', listener: (error: CrtError) => void): this;

    /**
     * Emitted when the connection reconnects. Only triggers on connections after the initial one.
     */
    on(event: 'resume', listener: (return_code: number, session_present: boolean) => void): this;


    // Override to allow uncorking on ready
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        if (event == 'ready') {
            process.nextTick(() => {
                this.uncork();
            })
        }
        return this;
    }

    private on_online = (session_present: boolean) => {
        this.emit('resume', 0, session_present);
    }

    private on_offline = () => {
        this.emit('interrupt', -1);
    }

    private on_disconnected = () => {
        this.emit('end');
    }

    private on_message = (topic: string, payload: Buffer, packet: any) => {
        const callback = this.subscriptions.find(topic);
        if (callback) {
            callback(topic, payload);
        }
    }

    private _reject(reject: (reason: any) => void) {
        return (reason: any) => {
            reject(reason);
            this.emit('error', new CrtError(reason));
        }
    }

    async connect() {
        return new Promise<boolean>((resolve, reject) => {
            reject = this._reject(reject);

            try {
                this.connection.on('connect',
                    (connack: { sessionPresent: boolean, rc: number }) => {
                        resolve(connack.sessionPresent);
                        this.on_online(connack.sessionPresent);
                    }
                );
                this.connection.on('error',
                    (error: string) => {
                        reject(`Failed to connect: error=${error}`);
                    }
                );
                this.connection.on('message', this.on_message);
                this.connection.on('offline', this.on_offline);
                this.connection.on('end', this.on_disconnected);
            } catch (e) {
                reject(e);
            }
        });
    }

    async reconnect() {
        return this.connect();
    }

    async publish(topic: string, payload: Payload, qos: QoS, retain: boolean = false): Promise<MqttRequest> {
        let payload_data: string = payload.toString();
        if (typeof payload === 'object') {
            // Convert payload to JSON string
            payload_data = JSON.stringify(payload);
        }

        return this.connection.publish(topic, payload_data, { qos: qos, retain: retain })
            .catch((reason) => {
                this.emit('error', new CrtError(reason));
            })
            .then((value) => {
                return { packet_id: (value as IPublishPacket).messageId };
            });
    }

    async subscribe(topic: string, qos: QoS, on_message: (topic: string, payload: ArrayBuffer) => void): Promise<MqttSubscribeRequest> {
        this.subscriptions.insert(topic, on_message);
        return this.connection.subscribe(topic, { qos: qos })
            .catch((reason: any) => {
                this.emit('error', new CrtError(reason));
            })
            .then((value) => {
                const sub = (value as ISubscriptionGrant[])[0];
                return { topic: sub.topic, qos: sub.qos };
            });
    }

    async unsubscribe(topic: string): Promise<MqttRequest> {
        this.subscriptions.remove(topic);
        return this.connection.unsubscribe(topic)
            .catch((reason: any) => {
                this.emit('error', new CrtError(reason));
            })
            .then((value) => {
                return { packet_id: (value as IUnsubackPacket).messageId };
            });
    }

    async disconnect() {
        return this.connection.end();
    }
}
