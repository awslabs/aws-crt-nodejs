/*
 * Copyright 2010-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

export enum QoS {
    AtMostOnce = 0,
    AtLeastOnce = 1,
    ExactlyOnce = 2,
}

/** Possible types of data to send via publish or receive via subscription */
export type Payload = String | Object | DataView;

/** Every request sent returns an MqttRequest */
export interface MqttRequest {
    packet_id?: number;
}

/** Subscription request metadata */
export interface MqttSubscribeRequest extends MqttRequest {
    topic: string;
    qos: QoS;
    error_code?: number;
}

/** Represents the message sent when a client is found to be offline by the broker */
export class MqttWill {
    constructor(
        readonly topic: string,
        readonly qos: QoS,
        readonly payload: Payload,
        readonly retain = false) {

    }
}


