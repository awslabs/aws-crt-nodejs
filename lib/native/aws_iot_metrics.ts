/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Internal metrics encoding logic for IoT SDK metrics.
 *
 * @internal
 * @packageDocumentation
 */

import * as mqtt5 from "../common/mqtt5";
import * as mqtt_shared from "../common/mqtt_shared";
import type { Mqtt5ClientConfig } from "./mqtt5";
import type { MqttConnectionConfig } from "./mqtt";
import { TlsCipherPreference, CertificateSource } from "./io";
import { TlsVersion } from "../common/io";
import { HttpProxyOptions } from "./http";
import { crt_version } from "../common/platform";

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
 * Map ClientOperationQueueBehavior to its single-character metrics value.
 *
 * Mapping: FailNonQos1PublishOnDisconnect->A, FailQos0PublishOnDisconnect->B,
 * FailAllOnDisconnect->C.
 * Returns undefined for the default behavior or any unrecognized value.
 * @internal
 */
export function offline_queue_behavior_metrics_value(behavior?: mqtt5.ClientOperationQueueBehavior): string | undefined {
    switch (behavior) {
        case mqtt5.ClientOperationQueueBehavior.FailNonQos1PublishOnDisconnect: return "A";
        case mqtt5.ClientOperationQueueBehavior.FailQos0PublishOnDisconnect: return "B";
        case mqtt5.ClientOperationQueueBehavior.FailAllOnDisconnect: return "C";
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
 * Mapping: MQTT311->3, MQTT5->5.
 * Always emitted because every connection has a known protocol version.
 * @internal
 */
export function protocol_version_metrics_value(protocol: "MQTT311" | "MQTT5"): string {
    return protocol === "MQTT5" ? "5" : "3";
}

/**
 * Detect the socket implementation and return its single-character metrics value.
 *
 * Mapping: Windows (IOCP)->B, all other platforms (POSIX)->A.
 * @internal
 */
export function socket_implementation_metrics_value(): string {
    return process.platform === "win32" ? "B" : "A";
}

/**
 * Map proxy options to the single-character metrics value for proxy type.
 *
 * Mapping: HTTPS (has tls_opts)->B, HTTP->A.
 * @internal
 */
export function http_proxy_type_metrics_value(proxyOptions: HttpProxyOptions): string {
    if (proxyOptions?.tls_opts) {
        return "B"; // HTTPS
    }
    return "A"; // HTTP
}

/**
 * Map CertificateSource to its single-character metrics value.
 *
 * Mapping: CERTIFICATE_FILES->A, PKCS11->B, WINDOWS_CERT_STORE->C, PKCS12_FILE->E.
 * Letter "D" is reserved for Java KeyStore.
 * Returns undefined for unset or unrecognized values.
 * @internal
 */
export function certificate_source_metrics_value(source?: CertificateSource): string | undefined {
    switch (source) {
        case CertificateSource.CERTIFICATE_FILES: return "A";
        case CertificateSource.PKCS11: return "B";
        case CertificateSource.WINDOWS_CERT_STORE: return "C";
        case CertificateSource.PKCS12_FILE: return "E";
        default: return undefined;
    }
}

/**
 * Map TlsCipherPreference to its single-character metrics value.
 *
 * Mapping: PQ_TLSv1_0_2021_05->F, PQ_Default->H, TLSv1_2_2025_07->I.
 * Letters A-E, G, J, K are reserved for cipher preferences exposed by
 * other language SDKs but not by Node.js.
 * Returns undefined for the default or any unrecognized value.
 * @internal
 */
export function tls_cipher_preference_metrics_value(pref?: TlsCipherPreference): string | undefined {
    switch (pref) {
        case TlsCipherPreference.PQ_TLSv1_0_2021_05: return "F";
        case TlsCipherPreference.PQ_Default: return "H";
        case TlsCipherPreference.TLSv1_2_2025_07: return "I";
        default: return undefined;
    }
}

/**
 * Map TlsVersion to its single-character metrics value.
 *
 * Mapping: SSLv3->A, TLSv1->B, TLSv1_1->C, TLSv1_2->D, TLSv1_3->E.
 * Returns undefined for TlsVersion.Default so the feature is omitted
 * when no minimum was configured.
 * @internal
 */
export function minimum_tls_version_metrics_value(version?: TlsVersion): string | undefined {
    switch (version) {
        case TlsVersion.SSLv3: return "A";
        case TlsVersion.TLSv1: return "B";
        case TlsVersion.TLSv1_1: return "C";
        case TlsVersion.TLSv1_2: return "D";
        case TlsVersion.TLSv1_3: return "E";
        default: return undefined;
    }
}

// ---- Encoding functions ----

/**
 * Generates the encoded feature list string for metrics from MQTT5 client config.
 *
 * Format: "ID/Value,ID/Value,..."
 * Example: "A/B,C/A,F/5,G/A" means retryJitterMode=Full,
 * offlineQueueBehavior=FailNonQos1PublishOnDisconnect, protocol=MQTT5, socket=POSIX.
 *
 * MQTT5 connections always include:
 *  - F (protocolVersion): set to MQTT5
 *  - G (socketImplementation): detected from platform (POSIX or IOCP)
 *
 * Conditionally includes (only when the option is explicitly set and not default):
 *  - A (retryJitterMode): from config.retryJitterMode
 *  - B (sessionBehavior): from config.sessionBehavior
 *  - C (offlineQueueBehavior): from offlineQueueBehavior parameter
 *  - D (outboundTopicAliasBehavior): from topicAliasingOptions.outboundBehavior
 *  - E (inboundTopicAliasBehavior): from topicAliasingOptions.inboundBehavior
 *  - H (httpProxyType): HTTP or HTTPS based on proxy TLS settings
 *  - I (certificate_source): detected from TlsContextOptions
 *  - J (tls_cipher_preference): mapped from TlsCipherPreference on the TLS context
 *  - K (min_tls_version): mapped from TlsVersion on the TLS context
 *
 * @param config - MQTT5 client configuration.
 * @returns The encoded feature list string.
 * @internal
 */
export function get_encoded_feature_list_mqtt5(config: Mqtt5ClientConfig): string {
    const features: string[] = [];

    const jitter = retry_jitter_metrics_value(config.retryJitterMode);
    if (jitter) features.push(`${MetricsFeatureId.RETRY_JITTER_MODE}/${jitter}`);

    const session = session_behavior_metrics_value(config.sessionBehavior);
    if (session) features.push(`${MetricsFeatureId.SESSION_BEHAVIOR}/${session}`);

    const queue = offline_queue_behavior_metrics_value(config.offlineQueueBehavior);
    if (queue) features.push(`${MetricsFeatureId.OFFLINE_QUEUE_BEHAVIOR}/${queue}`);

    const topicAliasing = config.topicAliasingOptions;
    if (topicAliasing) {
        const outbound = outbound_topic_alias_metrics_value(topicAliasing.outboundBehavior);
        if (outbound) features.push(`${MetricsFeatureId.OUTBOUND_TOPIC_ALIAS_BEHAVIOR}/${outbound}`);
        const inbound = inbound_topic_alias_metrics_value(topicAliasing.inboundBehavior);
        if (inbound) features.push(`${MetricsFeatureId.INBOUND_TOPIC_ALIAS_BEHAVIOR}/${inbound}`);
    }

    // Always included
    features.push(`${MetricsFeatureId.PROTOCOL_VERSION}/${protocol_version_metrics_value("MQTT5")}`);
    features.push(`${MetricsFeatureId.SOCKET_IMPLEMENTATION}/${socket_implementation_metrics_value()}`);

    if (config.httpProxyOptions) {
        features.push(`${MetricsFeatureId.HTTP_PROXY_TYPE}/${http_proxy_type_metrics_value(config.httpProxyOptions)}`);
    }

    const certSrc = certificate_source_metrics_value(config.tlsCtx?.certificate_source);
    if (certSrc) features.push(`${MetricsFeatureId.CERTIFICATE_SOURCE}/${certSrc}`);

    const cipher = tls_cipher_preference_metrics_value(config.tlsCtx?.tls_cipher_preference);
    if (cipher) features.push(`${MetricsFeatureId.TLS_CIPHER_PREFERENCE}/${cipher}`);

    const tlsVer = minimum_tls_version_metrics_value(config.tlsCtx?.min_tls_version);
    if (tlsVer) features.push(`${MetricsFeatureId.MINIMUM_TLS_VERSION}/${tlsVer}`);

    return features.join(",");
}

/**
 * Generates the encoded feature list string for metrics from MQTT3 connection options.
 *
 * Format: "ID/Value,ID/Value..."
 *
 * MQTT3 connections always include:
 *  - F (protocolVersion): set to MQTT311
 *  - G (socketImplementation): detected from platform (POSIX or IOCP)
 *
 * Conditionally includes:
 *  - H (httpProxyType): HTTP or HTTPS based on proxy TLS settings
 *  - I (certificate_source): detected from TlsContextOptions
 *  - J (tls_cipher_preference): mapped from TlsCipherPreference on the TLS context
 *  - K (min_tls_version): mapped from TlsVersion on the TLS context
 *
 * @param config: MQTT Connection Config
 * @returns The encoded feature list string.
 * @internal
 */
export function get_encoded_feature_list_mqtt3(config: MqttConnectionConfig): string {
    const features: string[] = [];

    features.push(`${MetricsFeatureId.PROTOCOL_VERSION}/${protocol_version_metrics_value("MQTT311")}`);
    features.push(`${MetricsFeatureId.SOCKET_IMPLEMENTATION}/${socket_implementation_metrics_value()}`);

    if (config.proxy_options) {
        features.push(`${MetricsFeatureId.HTTP_PROXY_TYPE}/${http_proxy_type_metrics_value(config.proxy_options)}`);
    }

    const certSrc = certificate_source_metrics_value(config.tls_ctx?.certificate_source);
    if (certSrc) features.push(`${MetricsFeatureId.CERTIFICATE_SOURCE}/${certSrc}`);

    const cipher = tls_cipher_preference_metrics_value(config.tls_ctx?.tls_cipher_preference);
    if (cipher) features.push(`${MetricsFeatureId.TLS_CIPHER_PREFERENCE}/${cipher}`);

    const tlsVer = minimum_tls_version_metrics_value(config.tls_ctx?.min_tls_version);
    if (tlsVer) features.push(`${MetricsFeatureId.MINIMUM_TLS_VERSION}/${tlsVer}`);

    return features.join(",");
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
 * Create the final AwsIoTDeviceSDKMetrics object by merging CRT and user-provided data.
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
 * @param crtFeatureList - Encoded CRT feature list string generated by
 *   get_encoded_feature_list_mqtt5 or get_encoded_feature_list_mqtt3.
 * @returns The final metrics object ready to be embedded in the
 *   MQTT CONNECT packet username field.
 * @internal
 */
export function create_metrics(
    userMetrics: mqtt_shared.AwsIoTDeviceSDKMetrics | undefined,
    crtFeatureList: string
): mqtt_shared.AwsIoTDeviceSDKMetrics {
    const finalMetrics = new mqtt_shared.AwsIoTDeviceSDKMetrics();
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

/**
 * Create the final AwsIoTDeviceSDKMetrics object for an MQTT5 client.
 *
 * Generates the CRT feature list from the full set of MQTT5 client config,
 * including detected certificate source from the TLS context.
 *
 * @param config - MQTT5 client configuration containing all connection
 *   configuration and optional user (AwsIoTDeviceSDKMetrics) metrics.
 * @returns The final metrics object with merged CRT and SDK features.
 * @internal
 */
export function create_metrics_mqtt5(config: Mqtt5ClientConfig): mqtt_shared.AwsIoTDeviceSDKMetrics {
    const crtFeatureList = get_encoded_feature_list_mqtt5(config);
    return create_metrics(config.metrics, crtFeatureList);
}

/**
 * Create the final AwsIoTDeviceSDKMetrics object for an MQTT3 connection.
 *
 * Generates the CRT feature list from the MQTT3 connection parameters,
 * including detected certificate source from the TLS context.
 *
 * @param config - MQTT3 connection configuration containing proxy options,
 *   TLS context, and optional user (AwsIoTDeviceSDKMetrics) metrics.
 * @returns The final metrics object with merged CRT and SDK features.
 * @internal
 */
export function create_metrics_mqtt3(config: MqttConnectionConfig): mqtt_shared.AwsIoTDeviceSDKMetrics {
    const crtFeatureList = get_encoded_feature_list_mqtt3(config);
    return create_metrics(config.metrics, crtFeatureList);
}

// ---- SDK metrics factory hook ----

/**
 * Factory function that returns a fresh AwsIoTDeviceSDKMetrics instance
 * populated with upstream IoT device SDK identity (libraryName + metadata).
 *
 * Returning a fresh object on each call avoids cross-client mutation when
 * the encoder appends transport features to metadata.
 *
 * @internal
 */
export type SdkMetricsFactory = () => mqtt_shared.AwsIoTDeviceSDKMetrics;

let _sdkMetricsFactory: SdkMetricsFactory | undefined;

/**
 * Registers a factory that supplies the upstream IoT device SDK's metrics
 * (libraryName + IoTSDKVersion + IoTSDKMetricsVersion metadata).
 *
 * Called once by the device SDK at module load time (e.g. aws-iot-device-sdk-v2).
 * Not part of the public API and must not be used by customer code.
 *
 * If no factory is registered, the CRT falls back to an empty
 * AwsIoTDeviceSDKMetrics (CRT-only feature metrics, no SDK identity).
 *
 * @param factory function returning a fresh AwsIoTDeviceSDKMetrics on each call
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
export function _buildSdkMetrics(): mqtt_shared.AwsIoTDeviceSDKMetrics | undefined {
    return _sdkMetricsFactory ? _sdkMetricsFactory() : undefined;
}
