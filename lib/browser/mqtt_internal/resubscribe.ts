/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5_packet from "../../common/mqtt5_packet"

const AWS_IOT_CORE_MAX_SUBSCRIPTIONS_PER_SUBSCRIBE : number = 8;

export class ResubscribeManager {

    private subscriptions : Map<string, mqtt5_packet.QoS> = new Map<string, mqtt5_packet.QoS>();

    constructor() {

    }

    reset() {
        this.subscriptions.clear();
    }

    onSubscribeRequest(topicFilter: string, qos: mqtt5_packet.QoS) {
        this.subscriptions.set(topicFilter, qos);
    }

    onUnsubscribeRequest(topicFilter: string) {
        this.subscriptions.delete(topicFilter);
    }

    buildResubscribePacketList() : Array<mqtt5_packet.SubscribePacket> {
        let subscribes : Array<mqtt5_packet.SubscribePacket> = [];
        let currentSubscribe : mqtt5_packet.SubscribePacket | undefined = undefined;

        for (let [topicFilter, qos] of this.subscriptions.entries()) {
            if (currentSubscribe == undefined) {
                currentSubscribe = {
                    type: mqtt5_packet.PacketType.Subscribe,
                    subscriptions: []
                };

                subscribes.push(currentSubscribe);
            }

            currentSubscribe.subscriptions.push({
                topicFilter: topicFilter,
                qos: qos
            });

            if (currentSubscribe.subscriptions.length >= AWS_IOT_CORE_MAX_SUBSCRIPTIONS_PER_SUBSCRIBE) {
                currentSubscribe = undefined;
            }
        }

        return subscribes;
    }
}
