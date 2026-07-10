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
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics());
    expect(username.startsWith(`?SDK=${mqtt_shared.SDK_NAME}&Platform=Browser&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - empty username', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "");
    expect(username.startsWith(`?SDK=${mqtt_shared.SDK_NAME}&Platform=Browser&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - non-query username', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello");
    expect(username.startsWith(`hello?SDK=${mqtt_shared.SDK_NAME}&Platform=Browser&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - query username with no overlap 1', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?");
    expect(username.startsWith(`hello?SDK=${mqtt_shared.SDK_NAME}&Platform=Browser&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - query username with no overlap 2', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?a=");
    expect(username.startsWith(`hello?a=&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - query username with no overlap 3', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?a=b&c=d&e=f");
    expect(username.startsWith(`hello?a=b&c=d&e=f&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - query username with sdk overlap 1', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?a=b&SDK");
    expect(username.startsWith(`hello?a=b&SDK=&Platform=Browser&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - query username with sdk overlap 2', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?a=b&SDK=wut&c=d");
    expect(username.startsWith(`hello?a=b&SDK=wut&c=d&Platform=Browser&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - query username with platform overlap', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?Platform=oof&c=d&e=f");
    expect(username.startsWith(`hello?Platform=oof&c=d&e=f&SDK=${mqtt_shared.SDK_NAME}&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - query username with sdk and platform overlap', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?Platform=oof&c=d&SDK=squidward");
    expect(username.startsWith("hello?Platform=oof&c=d&SDK=squidward&Metadata=(Browser=")).toBeTruthy();
});

test('metrics username construction - query username no key', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?=b&c=d&e=f");
    expect(username.startsWith(`hello?=b&c=d&e=f&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - query username empty value', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?a=&c=d&e=f");
    expect(username.startsWith(`hello?a=&c=d&e=f&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - query username deduped', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?a=b&c=d&a=x&c=");
    expect(username.startsWith(`hello?a=b&c=d&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser&Metadata=(Browser=`)).toBeTruthy();
});

test('metrics username construction - invalid metadata', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?a=b&Metadata=invalid&c=d");
    expect(username.startsWith(`hello?a=b&Metadata=invalid&c=d`)).toBeTruthy();
    expect(username.indexOf("Browser=")).toEqual(-1);
});

test('metrics username construction - empty metadata', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?a=b&Metadata=()&c=d");
    expect(username.startsWith(`hello?a=b&Metadata=(Browser=`)).toBeTruthy();

    // c=d... exists and comes after metadata
    let metadataIndex = username.indexOf(`Metadata=`);
    let cIndex = username.indexOf(`c=d&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`);
    expect(metadataIndex).toBeGreaterThan(0);
    expect(cIndex).toBeGreaterThan(0);
    expect(cIndex).toBeGreaterThan(metadataIndex);
});

test('metrics username construction - existing metadata single', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?a=b&Metadata=(x=y)&c=d");
    expect(username.startsWith(`hello?a=b&Metadata=(x=y;Browser=`)).toBeTruthy();

    // c=d... exists and comes after metadata
    let metadataIndex = username.indexOf(`Metadata=`);
    let cIndex = username.indexOf(`c=d&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`);
    expect(metadataIndex).toBeGreaterThan(0);
    expect(cIndex).toBeGreaterThan(0);
    expect(cIndex).toBeGreaterThan(metadataIndex);
});

test('metrics username construction - existing metadata multi', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?a=b&Metadata=(x=y;foo=bar)&c=d");
    expect(username.startsWith(`hello?a=b&Metadata=(x=y;foo=bar;Browser=`)).toBeTruthy();

    // c=d... exists and comes after metadata
    let metadataIndex = username.indexOf(`Metadata=`);
    let cIndex = username.indexOf(`c=d&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`);
    expect(metadataIndex).toBeGreaterThan(0);
    expect(cIndex).toBeGreaterThan(0);
    expect(cIndex).toBeGreaterThan(metadataIndex);
});

test('metrics username construction - metadata overlap', async () => {
    let username = mqtt_shared_browser.buildFinalUsernameFromMetrics(new mqtt_shared.AWSIoTMetrics(), "hello?a=b&Metadata=(Browser=gopher;foo=bar)&c=d");
    expect(username ===`hello?a=b&Metadata=(Browser=gopher;foo=bar)&c=d&SDK=${mqtt_shared.SDK_NAME}&Platform=Browser`).toBeTruthy();
});

// ---- Phase 3: metrics.metadata folded into the Metadata block ----
// Prior to Phase 3, buildFinalUsernameFromMetrics only read metrics.libraryName.
// Now it also folds every [key, value] entry from metrics.metadata into the
// Metadata=(...) block, before appending Browser=<userAgent>. These tests
// exercise the new loop directly with a populated AWSIoTMetrics.

function makeMetrics(metadataPairs: [string, string][]): mqtt_shared.AWSIoTMetrics {
    const m = new mqtt_shared.AWSIoTMetrics();
    m.metadata = metadataPairs;
    return m;
}

test('metrics.metadata - single entry folded into Metadata block, followed by Browser', async () => {
    const metrics = makeMetrics([["CRTVersion", "1.2.3"]]);
    const username = mqtt_shared_browser.buildFinalUsernameFromMetrics(metrics);
    // CRTVersion must appear inside Metadata=(...), before Browser=
    expect(username).toMatch(/Metadata=\(CRTVersion=1\.2\.3;Browser=/);
});

test('metrics.metadata - full CRT-generated set folded in order (before Browser)', async () => {
    const metrics = makeMetrics([
        ["CRTVersion", "1.2.3"],
        ["IoTSDKMetricsVersion", "1"],
        ["IoTSDKFeature", "A/B,F/5"],
        ["IoTSDKVersion", "2.0.0"],
    ]);
    const username = mqtt_shared_browser.buildFinalUsernameFromMetrics(metrics);
    // Order preserved from the metadata array; Browser= appended last.
    expect(username).toMatch(
        /Metadata=\(CRTVersion=1\.2\.3;IoTSDKMetricsVersion=1;IoTSDKFeature=A\/B,F\/5;IoTSDKVersion=2\.0\.0;Browser=/
    );
});

test('metrics.metadata - first-wins with existing URL metadata (URL takes precedence)', async () => {
    const metrics = makeMetrics([["CRTVersion", "new-value"]]);
    const username = mqtt_shared_browser.buildFinalUsernameFromMetrics(
        metrics,
        "hello?a=b&Metadata=(CRTVersion=pre-existing)&c=d"
    );
    // Pre-existing URL metadata wins (first-value-wins semantic).
    expect(username).toContain("CRTVersion=pre-existing");
    expect(username).not.toContain("CRTVersion=new-value");
});

test('metrics.metadata - coexists with pre-existing URL metadata for a different key', async () => {
    const metrics = makeMetrics([["CRTVersion", "1.2.3"]]);
    const username = mqtt_shared_browser.buildFinalUsernameFromMetrics(
        metrics,
        "hello?a=b&Metadata=(foo=bar)&c=d"
    );
    // Pre-existing "foo=bar" preserved, new CRTVersion appended, Browser last.
    expect(username).toMatch(/Metadata=\(foo=bar;CRTVersion=1\.2\.3;Browser=/);
});

test('metrics.metadata - empty array behaves like before Phase 3 (no metadata entries except Browser)', async () => {
    const metrics = makeMetrics([]);
    const username = mqtt_shared_browser.buildFinalUsernameFromMetrics(metrics);
    // Only Browser= should be in the Metadata block.
    expect(username).toMatch(/Metadata=\(Browser=/);
    // And no other metadata keys should sneak in.
    expect(username).not.toMatch(/Metadata=\([^)]*CRTVersion/);
    expect(username).not.toMatch(/Metadata=\([^)]*IoTSDKFeature/);
});

test('metrics.metadata - Browser key from metrics is deduped against auto-appended Browser', async () => {
    // If the caller (or a mis-configured user metadata) somehow puts Browser=
    // in metrics.metadata, first-wins means their value survives and the
    // auto-appended navigator.userAgent one is dropped.
    const metrics = makeMetrics([["Browser", "supplied-by-caller"]]);
    const username = mqtt_shared_browser.buildFinalUsernameFromMetrics(metrics);
    expect(username).toContain("Browser=supplied-by-caller");
    // Assert there is exactly one Browser= entry.
    const browserMatches = username.match(/Browser=/g) ?? [];
    expect(browserMatches.length).toBe(1);
});
