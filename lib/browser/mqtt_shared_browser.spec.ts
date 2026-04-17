/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt_shared from "../common/mqtt_shared";
import * as mqtt_shared_browser from "./mqtt_shared_browser";

test('MQTT topic properties - valid topic filter', async () => {
    expect(mqtt_shared_browser.computeTopicProperties("a/b/c", true).isValid).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("#", true).isValid).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("/#", true).isValid).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("sports/basketball/#", true).isValid).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("+", true).isValid).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("/+", true).isValid).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("+/a", true).isValid).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("+/basketball/#", true).isValid).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("washington/+/player1", true).isValid).toEqual(true);
});

test('MQTT topic properties - invalid topic filter', async () => {
    expect(mqtt_shared_browser.computeTopicProperties("", true).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("derp+", true).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("derp+/", true).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("derp#/", true).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("#/a", true).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("sport/basketball#", true).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("sport/basketball/#/ranking", true).isValid).toEqual(false);
});

test('MQTT topic properties - shared filter', async () => {
    expect(mqtt_shared_browser.computeTopicProperties("$share/b//", true).isShared).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("$share/a/b", true).isShared).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("$share/a/b/c", true).isShared).toEqual(true);
});

test('MQTT topic properties - not shared filter', async () => {
    expect(mqtt_shared_browser.computeTopicProperties("a/b/c", true).isShared).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("$share//c", true).isShared).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("$share/a", true).isShared).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("$share/+/a", true).isShared).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("$share/#/a", true).isShared).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("$share/b/", true).isShared).toEqual(false);
});

test('MQTT topic properties - has wildcard', async () => {
    expect(mqtt_shared_browser.computeTopicProperties("#", true).hasWildcard).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("+", true).hasWildcard).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("a/+/+", true).hasWildcard).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("a/b/#", true).hasWildcard).toEqual(true);
});

test('MQTT topic properties - does not have wildcard', async () => {
    expect(mqtt_shared_browser.computeTopicProperties("a/b/c", true).hasWildcard).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("/", true).hasWildcard).toEqual(false);
});

test('MQTT topic properties - valid topic', async () => {
    expect(mqtt_shared_browser.computeTopicProperties("a/b/c", false).isValid).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("/", false).isValid).toEqual(true);
    expect(mqtt_shared_browser.computeTopicProperties("///a", false).isValid).toEqual(true);
});

test('MQTT topic properties - invalid topic', async () => {
    expect(mqtt_shared_browser.computeTopicProperties("", false).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("#", false).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("/#", false).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("sports/basketball/#", false).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("+", false).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("/+", false).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("+/a", false).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("+/basketball/#", false).isValid).toEqual(false);
    expect(mqtt_shared_browser.computeTopicProperties("washington/+/player1", false).isValid).toEqual(false);
});

test('metrics username construction - undefined username', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics());
    expect(username.startsWith(`?SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`)).toBeTruthy();
});

test('metrics username construction - empty username', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics(), "");
    expect(username.startsWith(`?SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`)).toBeTruthy();
});

test('metrics username construction - non-query username', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics(), "hello");
    expect(username.startsWith(`hello?SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`)).toBeTruthy();
});

test('metrics username construction - query username with no overlap 1', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics(), "hello?");
    expect(username.startsWith(`hello?SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`)).toBeTruthy();
});

test('metrics username construction - query username with no overlap 2', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics(), "hello?a=");
    expect(username.startsWith(`hello?a=&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`)).toBeTruthy();
});

test('metrics username construction - query username with no overlap 3', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics(), "hello?a=b&c=d&e=f");
    expect(username.startsWith(`hello?a=b&c=d&e=f&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`)).toBeTruthy();
});

test('metrics username construction - query username with sdk overlap 1', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics(), "hello?a=b&SDK=derp");
    expect(username.startsWith(`hello?a=b&SDK=derp&Platform=Browser`)).toBeTruthy();
});

test('metrics username construction - query username with sdk overlap 2', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics(), "hello?a=b&SDK=wut&c=d");
    expect(username.startsWith(`hello?a=b&SDK=wut&c=d&Platform=Browser`)).toBeTruthy();
});

test('metrics username construction - query username with platform overlap', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics(), "hello?Platform=oof&c=d&e=f");
    expect(username ===`hello?Platform=oof&c=d&e=f&SDK=${mqtt_shared.SDK_NAME}`).toBeTruthy();
});

test('metrics username construction - query username with sdk and platform overlap', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics(), "hello?Platform=oof&c=d&SDK=squidward");
    expect(username === ("hello?Platform=oof&c=d&SDK=squidward")).toBeTruthy();
});

test('metrics username construction - query username no key', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics(), "hello?=b&c=d&e=f");
    expect(username.startsWith(`hello?=b&c=d&e=f&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`)).toBeTruthy();
});

test('metrics username construction - query username empty value', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AwsIoTDeviceSDKMetrics(), "hello?a=&c=d&e=f");
    expect(username.startsWith(`hello?a=&c=d&e=f&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`)).toBeTruthy();
});
