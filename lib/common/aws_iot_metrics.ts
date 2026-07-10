/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Shared metrics encoding logic for IoT SDK metrics.
 *
 * Platform-agnostic pieces used by both native and browser metrics modules:
 *  - Feature ID registry (single source of truth for all platforms)
 *  - Value mappers for platform-independent enums (retry, session, queue,
 *    topic aliasing, protocol version)
 *  - Feature list merging
 *  - Final AwsIoTMetrics object assembly
 *  - Upstream device-SDK factory hook (_setSdkMetricsFactory)
 *
 * Platform-specific mappers (socket implementation, HTTP proxy, certificate
 * source, TLS options, websocket transport, browser auth method, etc.) live
 * in the per-platform module (lib/native/aws_iot_metrics.ts or
 * lib/browser/aws_iot_metrics.ts).
 *
 * @internal
 * @packageDocumentation
 */

import * as mqtt5 from "./mqtt5";
import * as mqtt_shared from "./mqtt_shared";
import { crt_version } from "./platform";

/**
 * Current version of the IoT SDK metrics feature-encoding scheme.
 * Bump when the meaning of any feature ID or its value mapping changes
 * in a backwards-incompatible way.
 * @internal
 */
export const IOT_SDK_METRICS_FEATURE_VERSION = 1;

/**
 * Feature IDs for IoT SDK metrics tracking.
 *
 * Each ID is a single character used to encode feature usage in the metrics
 * string with the format "ID/Value". IDs are assigned sequentially and never
 * reused to ensure historical data consistency across SDK versions.
 *
 * Not every ID is emitted on every platform. Browser and native modules each
 * emit the subset of IDs that make sense in their environment (e.g., TLS
 * cipher preference is native-only). New IDs added for a single platform
 * should still be registered here to keep the ID space unified.
 * @internal
 */
export enum MetricsFeatureId {
    RETRY_JITTER_MODE = "A",
    SESSION_BEHAVIOR = "B",
    OFFLINE_QUEUE_BEHAVIOR = "C",
    OUTBOUND_TOPIC_ALIAS_BEHAVIOR = "D",
    INBOUND_TOPIC_ALIAS_BEHAVIOR = "E",
    PROTOCOL_VERSION = "F",
    SOCKET_IMPLEMENTATION = "G",
    HTTP_PROXY_TYPE = "H",
    CERTIFICATE_SOURCE = "I",
    TLS_CIPHER_PREFERENCE = "J",
    MINIMUM_TLS_VERSION = "K",
}

// ---- Feature value mappers ----

/**
 * Map RetryJitterType to its single-character metrics value.
 *
 * Mapping: None->A, Full->B, Decorrelated->C.
 * Returns undefined for unset or unrecognized values.
 * @internal
 */
export function retry_jitter_metrics_value(mode?: mqtt5.RetryJitterType): string | undefined {
    switch (mode) {
        case mqtt5.RetryJitterType.None: return "A";
        case mqtt5.RetryJitterType.Full: return "B";
        case mqtt5.RetryJitterType.Decorrelated: return "C";
        default: return undefined;
    }
}

/**
 * Map ClientSessionBehavior to its single-character metrics value.
 *
 * Mapping: Clean->A, RejoinPostSuccess->B, RejoinAlways->C.
 * Returns undefined for unset or unrecognized values.
 * @internal
 */
export function session_behavior_metrics_value(behavior?: mqtt5.ClientSessionBehavior): string | undefined {
    switch (behavior) {
        case mqtt5.ClientSessionBehavior.Clean: return "A";
        case mqtt5.ClientSessionBehavior.RejoinPostSuccess: return "B";
        case mqtt5.ClientSessionBehavior.RejoinAlways: return "C";
        default: return undefined;
    }
}

/**
 * Map OutboundTopicAliasBehaviorType to its single-character metrics value.
 *
 * Mapping: Manual->A, LRU->B, Disabled->C.
 * Returns undefined for unset or unrecognized values.
 * @internal
 */
export function outbound_topic_alias_metrics_value(behavior?: mqtt5.OutboundTopicAliasBehaviorType): string | undefined {
    switch (behavior) {
        case mqtt5.OutboundTopicAliasBehaviorType.Manual: return "A";
        case mqtt5.OutboundTopicAliasBehaviorType.LRU: return "B";
        case mqtt5.OutboundTopicAliasBehaviorType.Disabled: return "C";
        default: return undefined;
    }
}

/**
 * Map InboundTopicAliasBehaviorType to its single-character metrics value.
 *
 * Mapping: Enabled->A, Disabled->B.
 * Returns undefined for unset or unrecognized values.
 * @internal
 */
export function inbound_topic_alias_metrics_value(behavior?: mqtt5.InboundTopicAliasBehaviorType): string | undefined {
    switch (behavior) {
        case mqtt5.InboundTopicAliasBehaviorType.Enabled: return "A";
        case mqtt5.InboundTopicAliasBehaviorType.Disabled: return "B";
        default: return undefined;
    }
}

/**
 * Map protocol version to its single-character metrics value.
 *
 * Mapping: Mqtt311->3, Mqtt5->5.
 * Always emitted because every connection has a known protocol version.
 * @internal
 */
export function protocol_version_metrics_value(protocol: mqtt_shared.ProtocolMode): string {
    return protocol === mqtt_shared.ProtocolMode.Mqtt5 ? "5" : "3";
}

// ---- Merge + Create ----

/**
 * Merge CRT-generated features with user-provided (IoT SDK) features.
 *
 * When both lists contain the same feature ID, the user-provided value
 * takes precedence.
 *
 * @param crtFeatures - CRT-generated feature list.
 * @param userFeatures - User-provided feature list from the IoT SDK.
 *   May be an empty string if no SDK features are provided.
 * @returns The merged feature list string.
 * @internal
 */
export function merge_feature_lists(crtFeatures: string, userFeatures: string): string {
    const merged: Map<string, string> = new Map();

    for (const pair of crtFeatures.split(",")) {
        const idx = pair.indexOf("/");
        if (idx > 0) merged.set(pair.substring(0, idx), pair.substring(idx + 1));
    }

    if (userFeatures) {
        for (const pair of userFeatures.split(",")) {
            const idx = pair.indexOf("/");
            if (idx > 0) merged.set(pair.substring(0, idx), pair.substring(idx + 1));
        }
    }

    return Array.from(merged.entries()).map(([k, v]) => `${k}/${v}`).join(",");
}

/**
 * Create the final AwsIoTMetrics object by merging CRT and user-provided data.
 *
 * Applies the following rules to produce the final metrics:
 *  1. libraryName: Uses the value from userMetrics if provided,
 *     otherwise defaults to "IoTDeviceSDK/JS".
 *  2. CRTVersion: Automatically set to the current aws-crt-nodejs
 *     package version. Cannot be overridden by user input.
 *  3. IoTSDKMetricsVersion: Always set to the current
 *     IOT_SDK_METRICS_FEATURE_VERSION constant.
 *  4. IoTSDKFeature: If the user-provided metrics version
 *     matches IOT_SDK_METRICS_FEATURE_VERSION, the CRT feature list is
 *     merged with the user's IoTSDKFeature (user values take precedence
 *     for duplicate feature IDs). Otherwise, only CRT features are used.
 *  5. Any additional user metadata entries (other than CRTVersion,
 *     IoTSDKMetricsVersion, IoTSDKFeature) are passed through unchanged.
 *
 * @param userMetrics - Metrics configuration from the IoT SDK. May be
 *   undefined if no SDK-level metrics are provided.
 * @param crtFeatureList - Encoded CRT feature list string produced by a
 *   per-platform get_encoded_feature_list_mqtt5/mqtt3 function.
 * @returns The final metrics object ready to be embedded in the
 *   MQTT CONNECT packet username field.
 * @internal
 */
export function create_metrics(
    userMetrics: mqtt_shared.AwsIoTMetrics | undefined,
    crtFeatureList: string
): mqtt_shared.AwsIoTMetrics {
    const finalMetrics = new mqtt_shared.AwsIoTMetrics();
    finalMetrics.libraryName = userMetrics?.libraryName ?? mqtt_shared.SDK_NAME;

    const metadata: Map<string, string> = new Map();
    metadata.set("CRTVersion", crt_version());

    let userMetricsVersion: string | undefined;
    let userFeature = "";

    if (userMetrics?.metadata) {
        for (const [key, value] of userMetrics.metadata) {
            if (key === "IoTSDKMetricsVersion") {
                userMetricsVersion = value;
            } else if (key === "IoTSDKFeature") {
                userFeature = value;
            } else if (key !== "CRTVersion") {
                metadata.set(key, value);
            }
        }
    }

    // Merge features: if version matches, merge CRT + SDK; otherwise CRT only
    if (userMetricsVersion !== undefined &&
        Number(userMetricsVersion) === IOT_SDK_METRICS_FEATURE_VERSION) {
        metadata.set("IoTSDKFeature", merge_feature_lists(crtFeatureList, userFeature));
    } else {
        metadata.set("IoTSDKFeature", merge_feature_lists(crtFeatureList, ""));
    }

    metadata.set("IoTSDKMetricsVersion", String(IOT_SDK_METRICS_FEATURE_VERSION));

    finalMetrics.metadata = Array.from(metadata.entries());

    return finalMetrics;
}

// ---- SDK metrics factory hook ----

/**
 * Factory function that returns a fresh AwsIoTMetrics instance
 * populated with upstream IoT device SDK identity (libraryName + metadata).
 *
 * Returning a fresh object on each call avoids cross-client mutation when
 * the encoder appends transport features to metadata.
 *
 * @internal
 */
export type SdkMetricsFactory = () => mqtt_shared.AwsIoTMetrics;

let _sdkMetricsFactory: SdkMetricsFactory | undefined;

/**
 * Registers a factory that supplies the upstream IoT device SDK's metrics
 * (libraryName + IoTSDKVersion + IoTSDKMetricsVersion metadata).
 *
 * Called once by the device SDK at module load time (e.g. aws-iot-device-sdk-v2).
 * Not part of the public API and must not be used by customer code.
 *
 * If no factory is registered, the CRT falls back to an empty
 * AwsIoTMetrics (CRT-only feature metrics, no SDK identity).
 *
 * @param factory function returning a fresh AwsIoTMetrics on each call
 * @internal
 */
export function _setSdkMetricsFactory(factory: SdkMetricsFactory): void {
    _sdkMetricsFactory = factory;
}

/**
 * Returns a fresh metrics object from the registered SDK factory if any,
 * otherwise undefined. Used by the IoT builders' build() methods to populate
 * config.metrics with SDK identity before client construction.
 *
 * @internal
 */
export function _buildSdkMetrics(): mqtt_shared.AwsIoTMetrics | undefined {
    return _sdkMetricsFactory ? _sdkMetricsFactory() : undefined;
}
