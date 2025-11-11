/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt_shared from "./mqtt_shared";

test('MQTT topic properties - valid topic filter', async () => {
    expect(mqtt_shared.computeTopicProperties("a/b/c", true).isValid).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("#", true).isValid).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("/#", true).isValid).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("sports/basketball/#", true).isValid).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("+", true).isValid).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("/+", true).isValid).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("+/a", true).isValid).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("+/basketball/#", true).isValid).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("washington/+/player1", true).isValid).toEqual(true);
});

test('MQTT topic properties - invalid topic filter', async () => {
    expect(mqtt_shared.computeTopicProperties("", true).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("derp+", true).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("derp+/", true).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("derp#/", true).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("#/a", true).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("sport/basketball#", true).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("sport/basketball/#/ranking", true).isValid).toEqual(false);
});

test('MQTT topic properties - shared filter', async () => {
    expect(mqtt_shared.computeTopicProperties("$share/b//", true).isShared).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("$share/a/b", true).isShared).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("$share/a/b/c", true).isShared).toEqual(true);
});

test('MQTT topic properties - not shared filter', async () => {
    expect(mqtt_shared.computeTopicProperties("a/b/c", true).isShared).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("$share//c", true).isShared).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("$share/a", true).isShared).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("$share/+/a", true).isShared).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("$share/#/a", true).isShared).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("$share/b/", true).isShared).toEqual(false);
});

test('MQTT topic properties - has wildcard', async () => {
    expect(mqtt_shared.computeTopicProperties("#", true).hasWildcard).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("+", true).hasWildcard).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("a/+/+", true).hasWildcard).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("a/b/#", true).hasWildcard).toEqual(true);
});

test('MQTT topic properties - does not have wildcard', async () => {
    expect(mqtt_shared.computeTopicProperties("a/b/c", true).hasWildcard).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("/", true).hasWildcard).toEqual(false);
});

test('MQTT topic properties - valid topic', async () => {
    expect(mqtt_shared.computeTopicProperties("a/b/c", false).isValid).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("/", false).isValid).toEqual(true);
    expect(mqtt_shared.computeTopicProperties("///a", false).isValid).toEqual(true);
});

test('MQTT topic properties - invalid topic', async () => {
    expect(mqtt_shared.computeTopicProperties("", false).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("#", false).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("/#", false).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("sports/basketball/#", false).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("+", false).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("/+", false).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("+/a", false).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("+/basketball/#", false).isValid).toEqual(false);
    expect(mqtt_shared.computeTopicProperties("washington/+/player1", false).isValid).toEqual(false);
});