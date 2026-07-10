/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/*
 * Tests for the platform-agnostic pieces of lib/common/aws_iot_metrics.ts:
 *  - shared value mappers (retry jitter, session behavior, topic aliasing, protocol version)
 *  - merge_feature_lists
 *  - create_metrics
 *  - _setSdkMetricsFactory / _buildSdkMetrics basics (no factory / factory registered)
 *
 * Runs in BOTH jest configs (test/native/jest.config.js and test/browser/jest.config.js
 * both include lib/common/*.spec.ts), so shared logic is validated under each platform's
 * TypeScript configuration.
 *
 * Ordering note: "_buildSdkMetrics returns undefined when no factory is registered"
 * MUST run before any test that calls _setSdkMetricsFactory. 
 */

import * as mqtt5 from "../common/mqtt5";
import * as mqtt_shared from "../common/mqtt_shared";
import * as metrics from "../common/aws_iot_metrics";

// ---- Feature value mapper tests ----

test('retry_jitter_metrics_value', () => {
    expect(metrics.retry_jitter_metrics_value(mqtt5.RetryJitterType.None)).toBe("A");
    expect(metrics.retry_jitter_metrics_value(mqtt5.RetryJitterType.Full)).toBe("B");
    expect(metrics.retry_jitter_metrics_value(mqtt5.RetryJitterType.Decorrelated)).toBe("C");
    expect(metrics.retry_jitter_metrics_value(mqtt5.RetryJitterType.Default)).toBeUndefined();
    expect(metrics.retry_jitter_metrics_value(undefined)).toBeUndefined();
});

test('session_behavior_metrics_value', () => {
    expect(metrics.session_behavior_metrics_value(mqtt5.ClientSessionBehavior.Clean)).toBe("A");
    expect(metrics.session_behavior_metrics_value(mqtt5.ClientSessionBehavior.RejoinPostSuccess)).toBe("B");
    expect(metrics.session_behavior_metrics_value(mqtt5.ClientSessionBehavior.RejoinAlways)).toBe("C");
    expect(metrics.session_behavior_metrics_value(mqtt5.ClientSessionBehavior.Default)).toBeUndefined();
    expect(metrics.session_behavior_metrics_value(undefined)).toBeUndefined();
});

test('outbound_topic_alias_metrics_value', () => {
    expect(metrics.outbound_topic_alias_metrics_value(mqtt5.OutboundTopicAliasBehaviorType.Manual)).toBe("A");
    expect(metrics.outbound_topic_alias_metrics_value(mqtt5.OutboundTopicAliasBehaviorType.LRU)).toBe("B");
    expect(metrics.outbound_topic_alias_metrics_value(mqtt5.OutboundTopicAliasBehaviorType.Disabled)).toBe("C");
    expect(metrics.outbound_topic_alias_metrics_value(mqtt5.OutboundTopicAliasBehaviorType.Default)).toBeUndefined();
    expect(metrics.outbound_topic_alias_metrics_value(undefined)).toBeUndefined();
});

test('inbound_topic_alias_metrics_value', () => {
    expect(metrics.inbound_topic_alias_metrics_value(mqtt5.InboundTopicAliasBehaviorType.Enabled)).toBe("A");
    expect(metrics.inbound_topic_alias_metrics_value(mqtt5.InboundTopicAliasBehaviorType.Disabled)).toBe("B");
    expect(metrics.inbound_topic_alias_metrics_value(mqtt5.InboundTopicAliasBehaviorType.Default)).toBeUndefined();
    expect(metrics.inbound_topic_alias_metrics_value(undefined)).toBeUndefined();
});

test('protocol_version_metrics_value', () => {
    expect(metrics.protocol_version_metrics_value(mqtt_shared.ProtocolMode.Mqtt5)).toBe("5");
    expect(metrics.protocol_version_metrics_value(mqtt_shared.ProtocolMode.Mqtt311)).toBe("3");
});

// ---- Merge tests ----

test('merge_feature_lists - CRT only', () => {
    const result = metrics.merge_feature_lists("F/5,G/A", "");
    expect(result).toBe("F/5,G/A");
});

test('merge_feature_lists - user overrides CRT', () => {
    const result = metrics.merge_feature_lists("F/5,G/A,I/A", "I/B");
    expect(result).toContain("I/B"); // user overrides CRT
    expect(result).toContain("F/5");
    expect(result).toContain("G/A");
});

// ---- create_metrics tests ----

test('create_metrics - no user metrics', () => {
    const result = metrics.create_metrics(undefined, "F/5,G/A");
    expect(result.libraryName).toBe(mqtt_shared.SDK_NAME);
    const metadataMap = new Map(result.metadata);
    expect(metadataMap.get("CRTVersion")).toBeDefined();
    expect(metadataMap.get("IoTSDKMetricsVersion")).toBe(String(metrics.IOT_SDK_METRICS_FEATURE_VERSION));
    expect(metadataMap.get("IoTSDKFeature")).toBe("F/5,G/A");
});

test('create_metrics - with user metrics matching version', () => {
    const userMetrics = new mqtt_shared.AWSIoTMetrics();
    userMetrics.libraryName = "IoTDeviceSDK/Custom";
    userMetrics.metadata = [
        ["IoTSDKMetricsVersion", "1"],
        ["IoTSDKFeature", "I/B"],
        ["IoTSDKVersion", "2.0.0"]
    ];
    const result = metrics.create_metrics(userMetrics, "F/5,G/A");
    expect(result.libraryName).toBe("IoTDeviceSDK/Custom");
    const metadataMap = new Map(result.metadata);
    expect(metadataMap.get("IoTSDKVersion")).toBe("2.0.0");
    // User feature I/B merged with CRT features
    expect(metadataMap.get("IoTSDKFeature")).toContain("F/5");
    expect(metadataMap.get("IoTSDKFeature")).toContain("G/A");
    expect(metadataMap.get("IoTSDKFeature")).toContain("I/B");
});

test('create_metrics - user metrics version mismatch ignores user features', () => {
    const userMetrics = new mqtt_shared.AWSIoTMetrics();
    userMetrics.metadata = [
        ["IoTSDKMetricsVersion", "5"],
        ["IoTSDKFeature", "I/B"]
    ];
    const result = metrics.create_metrics(userMetrics, "F/5,G/A");
    const metadataMap = new Map(result.metadata);
    // User features ignored, only CRT features
    expect(metadataMap.get("IoTSDKFeature")).toBe("F/5,G/A");
    expect(metadataMap.get("IoTSDKFeature")).not.toContain("I/B");
});

test('create_metrics - CRTVersion cannot be overridden by user', () => {
    const userMetrics = new mqtt_shared.AWSIoTMetrics();
    userMetrics.metadata = [
        ["CRTVersion", "fake-version"]
    ];
    const result = metrics.create_metrics(userMetrics, "F/5");
    const metadataMap = new Map(result.metadata);
    expect(metadataMap.get("CRTVersion")).not.toBe("fake-version");
});

// ---- SDK metrics factory hook basics ----
// IMPORTANT: the "no factory registered" test MUST run first, before any test in
// this file calls _setSdkMetricsFactory (module-level state).

test('_buildSdkMetrics returns undefined when no factory is registered', () => {
    expect(metrics._buildSdkMetrics()).toBeUndefined();
});

test('_buildSdkMetrics returns factory output after registration', () => {
    metrics._setSdkMetricsFactory(() => {
        const m = new mqtt_shared.AWSIoTMetrics();
        m.libraryName = "IoTDeviceSDK/JS";
        m.metadata = [
            ["IoTSDKVersion", "2.0.0"],
            ["IoTSDKMetricsVersion", "1"],
        ];
        return m;
    });

    const result = metrics._buildSdkMetrics()!;
    expect(result.libraryName).toBe("IoTDeviceSDK/JS");
    const metadataMap = new Map(result.metadata);
    expect(metadataMap.get("IoTSDKVersion")).toBe("2.0.0");
    expect(metadataMap.get("IoTSDKMetricsVersion")).toBe("1");
});
