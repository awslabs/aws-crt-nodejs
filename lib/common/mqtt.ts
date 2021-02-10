/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * MQTT Quality of Service
 * [MQTT-4.3]
 *
 * @module aws-crt
* @category MQTT
 */
export enum QoS {
    /**
     * QoS 0 - At most once delivery
     * The message is delivered according to the capabilities of the underlying network.
     * No response is sent by the receiver and no retry is performed by the sender.
     * The message arrives at the receiver either once or not at all.
     */
    AtMostOnce = 0,

    /**
     * QoS 1 - At least once delivery
     * This quality of service ensures that the message arrives at the receiver at least once.
     */
    AtLeastOnce = 1,
    /**
     * QoS 2 - Exactly once delivery

     * This is the highest quality of service, for use when neither loss nor
     * duplication of messages are acceptable. There is an increased overhead
     * associated with this quality of service.

     * Note that, while this client supports QoS 2, the AWS IoT Core service
     * does not support QoS 2 at time of writing (May 2020).
     */
    ExactlyOnce = 2,
}

/**
 * Possible types of data to send via publish
 *
 * @module aws-crt
 * @category MQTT
 */
export type Payload = String | Object | DataView;

/**
 * Function called upon receipt of a Publish message on a subscribed topic.
 *
 * @param topic The topic to which the message was published.
 * @param payload The payload data.
 * @param dup DUP flag. If true, this might be re-delivery of an earlier
 *            attempt to send the message.
 * @param qos Quality of Service used to deliver the message.
 * @param retain Retain flag. If true, the message was sent as a result of
 *               a new subscription being made by the client. *
 *
 * @module aws-crt
 * @category MQTT
 */
export type OnMessageCallback = (topic: string, payload: Buffer, dup: boolean, qos: QoS, retain: boolean) => void;

/**
 * Every request sent returns an MqttRequest
 *
 * @module aws-crt
 * @category MQTT
 */
export interface MqttRequest {
    /** Packet ID being acknowledged when the request completes */
    packet_id?: number;
}

/**
 * Subscription SUBACK result
 *
 * @module aws-crt
 * @category MQTT
 */
export interface MqttSubscribeRequest extends MqttRequest {
    /** Topic filter of the SUBSCRIBE packet being acknowledged */
    topic: string;
    /** Maximum QoS granted by the server. This may be lower than the requested QoS. */
    qos: QoS;
    /** If an error occurred, the error code */
    error_code?: number;
}

/**
 * A Will message is published by the server if a client is lost unexpectedly.
 *
 * The Will message is stored on the server when a client connects.
 * It is published if the client connection is lost without the server
 * receiving a DISCONNECT packet.
 *
 * [MQTT - 3.1.2 - 8]
 *
 * @module aws-crt
 * @category MQTT
 */
export class MqttWill {
    constructor(
        /** Topic to publish Will message on. */
        readonly topic: string,
        /** QoS used when publishing the Will message. */
        readonly qos: QoS,
        /** Content of Will message. */
        readonly payload: Payload,
        /** Whether the Will message is to be retained when it is published. */
        readonly retain = false) {
    }
}


