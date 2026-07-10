/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Browser metrics encoding logic for IoT SDK metrics.
 *
 * @internal
 * @packageDocumentation
 */

import * as mqtt_shared from "../common/mqtt_shared";
import * as common_metrics from "../common/aws_iot_metrics";
import { MetricsFeatureId } from "../common/aws_iot_metrics";
import type { Mqtt5ClientConfig } from "./mqtt5";
import type { MqttConnectionConfig } from "./mqtt";
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

// ---- Encoding functions ----

/**
 * Generates the encoded feature list string for metrics from a browser
 * MQTT5 client config.
 *
 * Format: "ID/Value,ID/Value,..."
 * Example: "A/B,F/5" means retryJitterMode=Full, protocol=MQTT5.
 *
 * Browser MQTT5 emissions:
 *
 * Always:
 *  - F (protocolVersion): set to Mqtt5
 *
 * Conditionally (only when the option is explicitly set and not default):
 *  - A (retryJitterMode) from config.retryJitterMode
 *  - B (sessionBehavior) from config.sessionBehavior
 *  - D (outboundTopicAliasBehavior) from config.topicAliasingOptions.outboundBehavior
 *  - E (inboundTopicAliasBehavior) from config.topicAliasingOptions.inboundBehavior
 *
 * Not emitted on browser (either not observable or config field is native-only):
 *  - C (offlineQueueBehavior): field only exists on native Mqtt5ClientConfig
 *  - G (socketImplementation): browser is always WebSocket, no OS distinction
 *  - H (httpProxyType): no configurable HTTP proxy in browser
 *  - I/J/K (TLS certificate source / cipher preference / min version):
 *    TLS is browser-managed, no programmatic surface
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

    const topicAliasing = config.topicAliasingOptions;
    if (topicAliasing) {
        const outbound = common_metrics.outbound_topic_alias_metrics_value(topicAliasing.outboundBehavior);
        if (outbound) features.push(`${MetricsFeatureId.OUTBOUND_TOPIC_ALIAS_BEHAVIOR}/${outbound}`);
        const inbound = common_metrics.inbound_topic_alias_metrics_value(topicAliasing.inboundBehavior);
        if (inbound) features.push(`${MetricsFeatureId.INBOUND_TOPIC_ALIAS_BEHAVIOR}/${inbound}`);
    }

    // Always included
    features.push(`${MetricsFeatureId.PROTOCOL_VERSION}/${common_metrics.protocol_version_metrics_value(mqtt_shared.ProtocolMode.Mqtt5)}`);

    return features.join(",");
}

/**
 * Generates the encoded feature list string for metrics from a browser
 * MQTT3 connection config.
 *
 * Format: "ID/Value,ID/Value..."
 *
 * Browser MQTT3 emissions:
 *
 * Always:
 *  - F (protocolVersion): set to Mqtt311
 *
 * Not emitted on browser MQTT3:
 *  - A/B/D/E (jitter, session, topic alias): these are MQTT5-only concepts;
 *    the MQTT3 MqttConnectionConfigBase does not surface them.
 *  - G/H/I/J/K: same reasons as MQTT5 browser (native-only or not observable).
 *
 * The MQTT3 encoded feature list is intentionally minimal today. Additional
 * feature IDs may be introduced later for browser-specific concerns
 * (websocket URL factory type, auth method).
 *
 * @param config - MQTT3 connection config. Currently unused, but accepted
 *   for API symmetry with native and to allow future feature detection.
 * @returns The encoded feature list string.
 * @internal
 */
export function get_encoded_feature_list_mqtt3(_config: MqttConnectionConfig): string {
    const features: string[] = [];

    features.push(`${MetricsFeatureId.PROTOCOL_VERSION}/${common_metrics.protocol_version_metrics_value(mqtt_shared.ProtocolMode.Mqtt311)}`);

    return features.join(",");
}

/**
 * Create the final AWSIoTMetrics object for an MQTT5 client on browser.
 *
 * Generates the browser-scoped CRT feature list from the MQTT5 client config,
 * then delegates to the shared create_metrics for merging with user-supplied
 * SDK metrics.
 *
 * @param config - MQTT5 client configuration containing all connection
 *   configuration and optional user (AWSIoTMetrics) metrics.
 * @returns The final metrics object with merged CRT and SDK features.
 * @internal
 */
export function create_metrics_mqtt5(config: Mqtt5ClientConfig): mqtt_shared.AWSIoTMetrics {
    const crtFeatureList = get_encoded_feature_list_mqtt5(config);
    return common_metrics.create_metrics(config.metrics, crtFeatureList);
}

/**
 * Create the final AWSIoTMetrics object for an MQTT3 connection on browser.
 *
 * @param config - MQTT3 connection configuration containing optional user
 *   (AWSIoTMetrics) metrics.
 * @returns The final metrics object with merged CRT and SDK features.
 * @internal
 */
export function create_metrics_mqtt3(config: MqttConnectionConfig): mqtt_shared.AWSIoTMetrics {
    const crtFeatureList = get_encoded_feature_list_mqtt3(config);
    return common_metrics.create_metrics(config.metrics, crtFeatureList);
}
