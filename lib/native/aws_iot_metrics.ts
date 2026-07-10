/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Native (Node) metrics encoding logic for IoT SDK metrics.
 *
 * Wraps the shared common metrics core (feature IDs, common mappers, merge,
 * and SDK factory hook) with native-only pieces: socket implementation,
 * HTTP proxy type, certificate source, TLS cipher preference, minimum TLS
 * version, and the platform-specific get_encoded_feature_list_* /
 * create_metrics_* entry points that consume a native Mqtt5ClientConfig or
 * MqttConnectionConfig.
 *
 * Shared symbols are re-exported so callers importing from "./aws_iot_metrics"
 * (native path) keep working unchanged.
 *
 * @internal
 * @packageDocumentation
 */

import * as mqtt_shared from "../common/mqtt_shared";
import * as common_metrics from "../common/aws_iot_metrics";
import * as common_mqtt5 from "../common/mqtt5";
import { MetricsFeatureId } from "../common/aws_iot_metrics";
import type { Mqtt5ClientConfig } from "./mqtt5";
import type { MqttConnectionConfig } from "./mqtt";
import { TlsCipherPreference, CertificateSource } from "./io";
import { TlsVersion } from "../common/io";
import { HttpProxyOptions } from "./http";

// Re-export shared metrics API so existing callsites and specs importing
// from "./aws_iot_metrics" continue to work unchanged.
export {
    IOT_SDK_METRICS_FEATURE_VERSION,
    MetricsFeatureId,
    retry_jitter_metrics_value,
    session_behavior_metrics_value,
    outbound_topic_alias_metrics_value,
    inbound_topic_alias_metrics_value,
    protocol_version_metrics_value,
    merge_feature_lists,
    create_metrics,
    _setSdkMetricsFactory,
    _buildSdkMetrics,
} from "../common/aws_iot_metrics";
export type { SdkMetricsFactory } from "../common/aws_iot_metrics";

// ---- Native-only feature value mappers ----

/**
 * Map ClientOperationQueueBehavior to its single-character metrics value.
 *
 * Native-only: only native's Mqtt5ClientConfig exposes `offlineQueueBehavior`.
 * The enum itself lives in common/mqtt5.ts because it is shared vocabulary
 * (browser mirrors the concept internally as OfflineQueuePolicy), but the
 * mapper is native-scoped since browser cannot emit this feature.
 *
 * Mapping: FailNonQos1PublishOnDisconnect->A, FailQos0PublishOnDisconnect->B,
 * FailAllOnDisconnect->C.
 * Returns undefined for the default behavior or any unrecognized value.
 * @internal
 */
export function offline_queue_behavior_metrics_value(behavior?: common_mqtt5.ClientOperationQueueBehavior): string | undefined {
    switch (behavior) {
        case common_mqtt5.ClientOperationQueueBehavior.FailNonQos1PublishOnDisconnect: return "A";
        case common_mqtt5.ClientOperationQueueBehavior.FailQos0PublishOnDisconnect: return "B";
        case common_mqtt5.ClientOperationQueueBehavior.FailAllOnDisconnect: return "C";
        default: return undefined;
    }
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
 * Generates the encoded feature list string for metrics from a native
 * MQTT5 client config.
 *
 * Format: "ID/Value,ID/Value,..."
 * Example: "A/B,C/A,F/5,G/A" means retryJitterMode=Full,
 * offlineQueueBehavior=FailNonQos1PublishOnDisconnect, protocol=MQTT5, socket=POSIX.
 *
 * MQTT5 connections always include:
 *  - F (protocolVersion): set to Mqtt5
 *  - G (socketImplementation): detected from platform (POSIX or IOCP)
 *
 * Conditionally includes (only when the option is explicitly set and not default):
 *  - A (retryJitterMode)
 *  - B (sessionBehavior)
 *  - C (offlineQueueBehavior)
 *  - D (outboundTopicAliasBehavior)
 *  - E (inboundTopicAliasBehavior)
 *  - H (httpProxyType)
 *  - I (certificate_source)
 *  - J (tls_cipher_preference)
 *  - K (min_tls_version)
 *
 * @param config - MQTT5 client configuration.
 * @returns The encoded feature list string.
 * @internal
 */
export function get_encoded_feature_list_mqtt5(config: Mqtt5ClientConfig): string {
    const features: string[] = [];

    const jitter = common_metrics.retry_jitter_metrics_value(config.retryJitterMode);
    if (jitter) features.push(`${MetricsFeatureId.RETRY_JITTER_MODE}/${jitter}`);

    const session = common_metrics.session_behavior_metrics_value(config.sessionBehavior);
    if (session) features.push(`${MetricsFeatureId.SESSION_BEHAVIOR}/${session}`);

    const queue = offline_queue_behavior_metrics_value(config.offlineQueueBehavior);
    if (queue) features.push(`${MetricsFeatureId.OFFLINE_QUEUE_BEHAVIOR}/${queue}`);

    const topicAliasing = config.topicAliasingOptions;
    if (topicAliasing) {
        const outbound = common_metrics.outbound_topic_alias_metrics_value(topicAliasing.outboundBehavior);
        if (outbound) features.push(`${MetricsFeatureId.OUTBOUND_TOPIC_ALIAS_BEHAVIOR}/${outbound}`);
        const inbound = common_metrics.inbound_topic_alias_metrics_value(topicAliasing.inboundBehavior);
        if (inbound) features.push(`${MetricsFeatureId.INBOUND_TOPIC_ALIAS_BEHAVIOR}/${inbound}`);
    }

    // Always included
    features.push(`${MetricsFeatureId.PROTOCOL_VERSION}/${common_metrics.protocol_version_metrics_value(mqtt_shared.ProtocolMode.Mqtt5)}`);
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
 * Generates the encoded feature list string for metrics from a native
 * MQTT3 connection config.
 *
 * Format: "ID/Value,ID/Value..."
 *
 * MQTT3 connections always include:
 *  - F (protocolVersion): set to Mqtt311
 *  - G (socketImplementation): detected from platform (POSIX or IOCP)
 *
 * Conditionally includes:
 *  - H (httpProxyType)
 *  - I (certificate_source)
 *  - J (tls_cipher_preference)
 *  - K (min_tls_version)
 *
 * @param config - MQTT connection config.
 * @returns The encoded feature list string.
 * @internal
 */
export function get_encoded_feature_list_mqtt3(config: MqttConnectionConfig): string {
    const features: string[] = [];

    features.push(`${MetricsFeatureId.PROTOCOL_VERSION}/${common_metrics.protocol_version_metrics_value(mqtt_shared.ProtocolMode.Mqtt311)}`);
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

/**
 * Create the final AwsIoTMetrics object for an MQTT5 client on native.
 *
 * Generates the CRT feature list from the full set of MQTT5 client config,
 * including detected certificate source from the TLS context, then delegates
 * to the shared create_metrics for merging with user-supplied SDK metrics.
 *
 * @param config - MQTT5 client configuration containing all connection
 *   configuration and optional user (AwsIoTMetrics) metrics.
 * @returns The final metrics object with merged CRT and SDK features.
 * @internal
 */
export function create_metrics_mqtt5(config: Mqtt5ClientConfig): mqtt_shared.AwsIoTMetrics {
    const crtFeatureList = get_encoded_feature_list_mqtt5(config);
    return common_metrics.create_metrics(config.metrics, crtFeatureList);
}

/**
 * Create the final AwsIoTMetrics object for an MQTT3 connection on native.
 *
 * Generates the CRT feature list from the MQTT3 connection parameters,
 * including detected certificate source from the TLS context, then delegates
 * to the shared create_metrics for merging with user-supplied SDK metrics.
 *
 * @param config - MQTT3 connection configuration containing proxy options,
 *   TLS context, and optional user (AwsIoTMetrics) metrics.
 * @returns The final metrics object with merged CRT and SDK features.
 * @internal
 */
export function create_metrics_mqtt3(config: MqttConnectionConfig): mqtt_shared.AwsIoTMetrics {
    const crtFeatureList = get_encoded_feature_list_mqtt3(config);
    return common_metrics.create_metrics(config.metrics, crtFeatureList);
}
