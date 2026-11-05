/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as resubscribe from "./resubscribe";
import * as mqtt5_packet from "../../common/mqtt5_packet"

test('resubscribe - no subscribes on empty', () => {
    let manager = new resubscribe.ResubscribeManager();

    let subscribes = manager.buildResubscribePacketList();

    expect(subscribes.length).toBe(0);
});

interface SubscribeCase {
    topicFilter: string,
    qos: mqtt5_packet.QoS
}

function containsSubscribe(subscribes: Array<mqtt5_packet.SubscribePacket>, caseItem: SubscribeCase) : boolean {
    for (let subscribe of subscribes) {
        for (let subscription of subscribe.subscriptions) {
            if (subscription.topicFilter === caseItem.topicFilter && subscription.qos === caseItem.qos) {
                return true;
            }
        }
    }

    return false;
}

test('resubscribe - add subscribes, single packet', () => {
    let manager = new resubscribe.ResubscribeManager();

    let subscribeCases : SubscribeCase[] = [
        { topicFilter: "a/b", qos: mqtt5_packet.QoS.AtMostOnce},
        { topicFilter: "+/c", qos: mqtt5_packet.QoS.AtLeastOnce},
        { topicFilter: "foo/#", qos: mqtt5_packet.QoS.ExactlyOnce},
    ];

    subscribeCases.forEach(caseItem => {
        manager.onSubscribeRequest(caseItem.topicFilter, caseItem.qos);
    });

    let subscribes = manager.buildResubscribePacketList();
    expect(subscribes.length ).toBe(1);

    subscribeCases.forEach(caseItem => {
        expect(containsSubscribe(subscribes, caseItem)).toBeTruthy();
    });
});

test('resubscribe - add subscribes, multiple packets', () => {
    let manager = new resubscribe.ResubscribeManager();

    let subscribeCases : SubscribeCase[] = [
        { topicFilter: "a/b", qos: mqtt5_packet.QoS.AtMostOnce},
        { topicFilter: "+/c", qos: mqtt5_packet.QoS.AtLeastOnce},
        { topicFilter: "c/#", qos: mqtt5_packet.QoS.ExactlyOnce},
        { topicFilter: "d/#", qos: mqtt5_packet.QoS.AtLeastOnce},
        { topicFilter: "e/#", qos: mqtt5_packet.QoS.AtLeastOnce},
        { topicFilter: "f/#", qos: mqtt5_packet.QoS.ExactlyOnce},
        { topicFilter: "g/#", qos: mqtt5_packet.QoS.AtMostOnce},
        { topicFilter: "h/#", qos: mqtt5_packet.QoS.AtLeastOnce},

        { topicFilter: "sponge/bob/1", qos: mqtt5_packet.QoS.AtMostOnce},
        { topicFilter: "sponge/bob/2", qos: mqtt5_packet.QoS.AtLeastOnce},
        { topicFilter: "sponge/bob/3", qos: mqtt5_packet.QoS.ExactlyOnce},
        { topicFilter: "sponge/bob/4", qos: mqtt5_packet.QoS.AtLeastOnce},
        { topicFilter: "sponge/bob/5", qos: mqtt5_packet.QoS.AtMostOnce},
        { topicFilter: "sponge/bob/6", qos: mqtt5_packet.QoS.AtMostOnce},
        { topicFilter: "sponge/bob/7", qos: mqtt5_packet.QoS.AtLeastOnce},
        { topicFilter: "sponge/bob/8", qos: mqtt5_packet.QoS.ExactlyOnce},

        { topicFilter: "mr/krabs", qos: mqtt5_packet.QoS.AtMostOnce},
    ];

    subscribeCases.forEach(caseItem => {
        manager.onSubscribeRequest(caseItem.topicFilter, caseItem.qos);
    });

    let subscribes = manager.buildResubscribePacketList();
    expect(subscribes.length ).toBe(3);

    subscribeCases.forEach(caseItem => {
        expect(containsSubscribe(subscribes, caseItem)).toBeTruthy();
    });
});

test('resubscribe - add subscribes, update qos', () => {
    let manager = new resubscribe.ResubscribeManager();

    let subscribeCases : SubscribeCase[] = [
        { topicFilter: "a/b", qos: mqtt5_packet.QoS.AtMostOnce},
        { topicFilter: "+/c", qos: mqtt5_packet.QoS.AtLeastOnce},
        { topicFilter: "foo/#", qos: mqtt5_packet.QoS.ExactlyOnce},
    ];

    subscribeCases.forEach(caseItem => {
        manager.onSubscribeRequest(caseItem.topicFilter, caseItem.qos);
    });

    let subscribes1 = manager.buildResubscribePacketList();
    expect(subscribes1.length ).toBe(1);

    subscribeCases.forEach(caseItem => {
        expect(containsSubscribe(subscribes1, caseItem)).toBeTruthy();
    });

    subscribeCases[0].qos = mqtt5_packet.QoS.ExactlyOnce;
    subscribeCases[1].qos = mqtt5_packet.QoS.AtMostOnce;
    subscribeCases[2].qos = mqtt5_packet.QoS.AtLeastOnce;

    subscribeCases.forEach(caseItem => {
        manager.onSubscribeRequest(caseItem.topicFilter, caseItem.qos);
    });

    let subscribes2 = manager.buildResubscribePacketList();
    expect(subscribes2.length ).toBe(1);

    subscribeCases.forEach(caseItem => {
        expect(containsSubscribe(subscribes2, caseItem)).toBeTruthy();
    });
});

test('resubscribe - reset', () => {
    let manager = new resubscribe.ResubscribeManager();

    let subscribeCases : SubscribeCase[] = [
        { topicFilter: "a/b", qos: mqtt5_packet.QoS.AtMostOnce},
        { topicFilter: "+/c", qos: mqtt5_packet.QoS.AtLeastOnce},
        { topicFilter: "foo/#", qos: mqtt5_packet.QoS.ExactlyOnce},
    ];

    subscribeCases.forEach(caseItem => {
        manager.onSubscribeRequest(caseItem.topicFilter, caseItem.qos);
    });

    manager.reset();

    let subscribes = manager.buildResubscribePacketList();

    expect(subscribes.length).toBe(0);
});

test('resubscribe - remove subscriptions', () => {
    let manager = new resubscribe.ResubscribeManager();

    let subscribeCases : SubscribeCase[] = [
        { topicFilter: "a/b", qos: mqtt5_packet.QoS.AtMostOnce},
        { topicFilter: "+/c", qos: mqtt5_packet.QoS.AtLeastOnce},
        { topicFilter: "foo/#", qos: mqtt5_packet.QoS.ExactlyOnce},
    ];

    subscribeCases.forEach(caseItem => {
        manager.onSubscribeRequest(caseItem.topicFilter, caseItem.qos);
    });

    let subscribes = manager.buildResubscribePacketList();
    expect(subscribes.length ).toBe(1);

    subscribeCases.forEach(caseItem => {
        expect(containsSubscribe(subscribes, caseItem)).toBeTruthy();
    });

    // remove first
    manager.onUnsubscribeRequest("a/b");

    let subscribes2 = manager.buildResubscribePacketList();
    expect(subscribes2.length ).toBe(1);

    expect(containsSubscribe(subscribes2, subscribeCases[0])).toBeFalsy();
    expect(containsSubscribe(subscribes2, subscribeCases[1])).toBeTruthy();
    expect(containsSubscribe(subscribes2, subscribeCases[2])).toBeTruthy();

    // remove second
    manager.onUnsubscribeRequest("+/c");

    let subscribes3 = manager.buildResubscribePacketList();
    expect(subscribes3.length ).toBe(1);

    expect(containsSubscribe(subscribes3, subscribeCases[0])).toBeFalsy();
    expect(containsSubscribe(subscribes3, subscribeCases[1])).toBeFalsy();
    expect(containsSubscribe(subscribes3, subscribeCases[2])).toBeTruthy();

    // remove third
    manager.onUnsubscribeRequest("foo/#");

    let subscribes4 = manager.buildResubscribePacketList();
    expect(subscribes4.length ).toBe(0);
});