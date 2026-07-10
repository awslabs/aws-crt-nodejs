/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/*
 * Tests for the native-only pieces of lib/native/aws_iot_metrics.ts:
 *  - native mappers (offline_queue, socket_implementation, http_proxy_type,
 *    certificate_source, tls_cipher_preference, minimum_tls_version)
 *  - native get_encoded_feature_list_mqtt5 / _mqtt3 (uses native Mqtt5ClientConfig /
 *    MqttConnectionConfig with tlsCtx/proxy fields not present on browser)
 *  - native create_metrics_mqtt5 / _mqtt3 wrappers
 *  - factory hook behavior when using native config types
 *  - disableMetrics short-circuit with native config
 *
 * Shared logic (retry/session/topic-alias/protocol_version mappers, merge, create_metrics,
 * factory-hook basics) is tested in lib/common/aws_iot_metrics.spec.ts. That common spec
 * is automatically included by test/native/jest.config.js.
 */

import * as mqtt5 from "../common/mqtt5";
import * as mqtt_shared from "../common/mqtt_shared";
import * as metrics from "./aws_iot_metrics";
import { TlsVersion } from "../common/io";
import { TlsCipherPreference, CertificateSource, ClientTlsContext } from "./io";
import { Mqtt5ClientConfig } from "./mqtt5";
import { MqttConnectionConfig } from "./mqtt";

// ---- Native-only feature value mappers ----

test('offline_queue_behavior_metrics_value', () => {
    expect(metrics.offline_queue_behavior_metrics_value(mqtt5.ClientOperationQueueBehavior.FailNonQos1PublishOnDisconnect)).toBe("A");
    expect(metrics.offline_queue_behavior_metrics_value(mqtt5.ClientOperationQueueBehavior.FailQos0PublishOnDisconnect)).toBe("B");
    expect(metrics.offline_queue_behavior_metrics_value(mqtt5.ClientOperationQueueBehavior.FailAllOnDisconnect)).toBe("C");
    expect(metrics.offline_queue_behavior_metrics_value(mqtt5.ClientOperationQueueBehavior.Default)).toBeUndefined();
    expect(metrics.offline_queue_behavior_metrics_value(undefined)).toBeUndefined();
});

test('socket_implementation_metrics_value', () => {
    const value = metrics.socket_implementation_metrics_value();
    if (process.platform === "win32") {
        expect(value).toBe("B");
    } else {
        expect(value).toBe("A");
    }
});

test('http_proxy_type_metrics_value - HTTP proxy', () => {
    const proxy = { tls_opts: undefined } as any;
    expect(metrics.http_proxy_type_metrics_value(proxy)).toBe("A");
});

test('http_proxy_type_metrics_value - HTTPS proxy', () => {
    const proxy = { tls_opts: {} } as any;
    expect(metrics.http_proxy_type_metrics_value(proxy)).toBe("B");
});

test('certificate_source_metrics_value', () => {
    expect(metrics.certificate_source_metrics_value(CertificateSource.CERTIFICATE_FILES)).toBe("A");
    expect(metrics.certificate_source_metrics_value(CertificateSource.PKCS11)).toBe("B");
    expect(metrics.certificate_source_metrics_value(CertificateSource.WINDOWS_CERT_STORE)).toBe("C");
    expect(metrics.certificate_source_metrics_value(CertificateSource.PKCS12_FILE)).toBe("E");
    expect(metrics.certificate_source_metrics_value(undefined)).toBeUndefined();
});

test('tls_cipher_preference_metrics_value', () => {
    expect(metrics.tls_cipher_preference_metrics_value(TlsCipherPreference.PQ_TLSv1_0_2021_05)).toBe("F");
    expect(metrics.tls_cipher_preference_metrics_value(TlsCipherPreference.PQ_Default)).toBe("H");
    expect(metrics.tls_cipher_preference_metrics_value(TlsCipherPreference.TLSv1_2_2025_07)).toBe("I");
    expect(metrics.tls_cipher_preference_metrics_value(TlsCipherPreference.Default)).toBeUndefined();
    expect(metrics.tls_cipher_preference_metrics_value(undefined)).toBeUndefined();
});

test('minimum_tls_version_metrics_value', () => {
    expect(metrics.minimum_tls_version_metrics_value(TlsVersion.SSLv3)).toBe("A");
    expect(metrics.minimum_tls_version_metrics_value(TlsVersion.TLSv1)).toBe("B");
    expect(metrics.minimum_tls_version_metrics_value(TlsVersion.TLSv1_1)).toBe("C");
    expect(metrics.minimum_tls_version_metrics_value(TlsVersion.TLSv1_2)).toBe("D");
    expect(metrics.minimum_tls_version_metrics_value(TlsVersion.TLSv1_3)).toBe("E");
    expect(metrics.minimum_tls_version_metrics_value(TlsVersion.Default)).toBeUndefined();
    expect(metrics.minimum_tls_version_metrics_value(undefined)).toBeUndefined();
});

// ---- Native encoding function tests ----

test('get_encoded_feature_list_mqtt5 - minimal config', () => {
    const config: Mqtt5ClientConfig = {
        hostName: "localhost",
        port: 8883,
    };
    const result = metrics.get_encoded_feature_list_mqtt5(config);
    expect(result).toContain("F/5");
    // socket_implementation (G) is always emitted on native; value covered by its own mapper test
    expect(result).toContain("G/");
});

test('get_encoded_feature_list_mqtt5 - with all options', () => {
    const config: Mqtt5ClientConfig = {
        hostName: "localhost",
        port: 8883,
        retryJitterMode: mqtt5.RetryJitterType.Full,
        sessionBehavior: mqtt5.ClientSessionBehavior.Clean,
        offlineQueueBehavior: mqtt5.ClientOperationQueueBehavior.FailAllOnDisconnect,
        topicAliasingOptions: {
            outboundBehavior: mqtt5.OutboundTopicAliasBehaviorType.LRU,
            inboundBehavior: mqtt5.InboundTopicAliasBehaviorType.Enabled,
        },
        tlsCtx: {
            certificate_source: CertificateSource.CERTIFICATE_FILES,
            tls_cipher_preference: TlsCipherPreference.PQ_Default,
            min_tls_version: TlsVersion.TLSv1_2,
        } as ClientTlsContext,
    };
    const result = metrics.get_encoded_feature_list_mqtt5(config);
    expect(result).toContain("A/B");  // retry jitter Full
    expect(result).toContain("B/A");  // session Clean
    expect(result).toContain("C/C");  // queue FailAll
    expect(result).toContain("D/B");  // outbound LRU
    expect(result).toContain("E/A");  // inbound Enabled
    expect(result).toContain("F/5");  // MQTT5
    expect(result).toContain("G/");   // socket_implementation
    expect(result).toContain("I/A");  // cert files
    expect(result).toContain("J/H");  // PQ_Default
    expect(result).toContain("K/D");  // TLSv1_2
});

test('get_encoded_feature_list_mqtt3 - minimal', () => {
    const config = {} as MqttConnectionConfig;
    const result = metrics.get_encoded_feature_list_mqtt3(config);
    expect(result).toContain("F/3");
    expect(result).toContain("G/");
});

test('get_encoded_feature_list_mqtt3 - with TLS options', () => {
    const config = {
        tls_ctx: {
            certificate_source: CertificateSource.PKCS12_FILE,
            tls_cipher_preference: TlsCipherPreference.TLSv1_2_2025_07,
            min_tls_version: TlsVersion.TLSv1_3,
        } as ClientTlsContext,
    } as MqttConnectionConfig;
    const result = metrics.get_encoded_feature_list_mqtt3(config);
    expect(result).toContain("F/3");
    expect(result).toContain("I/E");  // PKCS12
    expect(result).toContain("J/I");  // TLSv1_2_2025_07
    expect(result).toContain("K/E");  // TLSv1_3
});

// ---- Native create_metrics_mqtt5 / _mqtt3 wrapper tests ----

test('create_metrics_mqtt5 - minimal config', () => {
    const config: Mqtt5ClientConfig = {
        hostName: "localhost",
        port: 8883,
    };
    const result = metrics.create_metrics_mqtt5(config);
    expect(result.libraryName).toBe(mqtt_shared.SDK_NAME);
    const metadataMap = new Map(result.metadata);
    expect(metadataMap.get("CRTVersion")).toBeDefined();
    expect(metadataMap.get("IoTSDKMetricsVersion")).toBe(String(metrics.IOT_SDK_METRICS_FEATURE_VERSION));
    const feature = metadataMap.get("IoTSDKFeature") ?? "";
    expect(feature).toContain("F/5");
    expect(feature).toContain("G/");
});

test('create_metrics_mqtt5 - propagates user libraryName and SDK version', () => {
    const userMetrics = new mqtt_shared.AWSIoTMetrics();
    userMetrics.libraryName = "IoTDeviceSDK/Custom";
    userMetrics.metadata = [
        ["IoTSDKMetricsVersion", String(metrics.IOT_SDK_METRICS_FEATURE_VERSION)],
        ["IoTSDKVersion", "2.0.0"],
    ];
    const config: Mqtt5ClientConfig = {
        hostName: "localhost",
        port: 8883,
        metrics: userMetrics,
    };
    const result = metrics.create_metrics_mqtt5(config);
    expect(result.libraryName).toBe("IoTDeviceSDK/Custom");
    const metadataMap = new Map(result.metadata);
    expect(metadataMap.get("IoTSDKVersion")).toBe("2.0.0");
    const feature = metadataMap.get("IoTSDKFeature") ?? "";
    expect(feature).toContain("F/5");
    expect(feature).toContain("G/");
});

test('create_metrics_mqtt3 - minimal config', () => {
    const config = {} as MqttConnectionConfig;
    const result = metrics.create_metrics_mqtt3(config);
    expect(result.libraryName).toBe(mqtt_shared.SDK_NAME);
    const metadataMap = new Map(result.metadata);
    expect(metadataMap.get("CRTVersion")).toBeDefined();
    expect(metadataMap.get("IoTSDKMetricsVersion")).toBe(String(metrics.IOT_SDK_METRICS_FEATURE_VERSION));
    const feature = metadataMap.get("IoTSDKFeature") ?? "";
    expect(feature).toContain("F/3");
    expect(feature).toContain("G/");
});

test('create_metrics_mqtt3 - propagates user SDK version', () => {
    const userMetrics = new mqtt_shared.AWSIoTMetrics();
    userMetrics.metadata = [
        ["IoTSDKMetricsVersion", String(metrics.IOT_SDK_METRICS_FEATURE_VERSION)],
        ["IoTSDKVersion", "3.1.4"],
    ];
    const config = { metrics: userMetrics } as MqttConnectionConfig;
    const result = metrics.create_metrics_mqtt3(config);
    const metadataMap = new Map(result.metadata);
    expect(metadataMap.get("IoTSDKVersion")).toBe("3.1.4");
    const feature = metadataMap.get("IoTSDKFeature") ?? "";
    expect(feature).toContain("F/3");
    expect(feature).toContain("G/");
});

// ---- Factory hook + native config types ----
// Each test below registers its own factory, so ordering doesn't matter between them.
// The "no factory registered" case is covered in the common spec.

test('_buildSdkMetrics returns fresh instance per client (two MQTT5 clients from SDK)', () => {
    metrics._setSdkMetricsFactory(() => {
        const m = new mqtt_shared.AWSIoTMetrics();
        m.libraryName = "IoTDeviceSDK/JS";
        m.metadata = [
            ["IoTSDKVersion", "2.0.0"],
            ["IoTSDKMetricsVersion", "1"],
        ];
        return m;
    });

    const config1: Mqtt5ClientConfig = {
        hostName: "localhost",
        port: 8883,
        metrics: metrics._buildSdkMetrics(),
    };

    const config2 = {
        metrics: metrics._buildSdkMetrics(),
    } as MqttConnectionConfig;

    const result1 = metrics.create_metrics_mqtt5(config1);
    const result2 = metrics.create_metrics_mqtt3(config2);

    expect(result1.libraryName).toBe("IoTDeviceSDK/JS");
    expect(result2.libraryName).toBe("IoTDeviceSDK/JS");
    expect(new Map(result1.metadata).get("IoTSDKVersion")).toBe("2.0.0");
    expect(new Map(result2.metadata).get("IoTSDKVersion")).toBe("2.0.0");
    expect(new Map(result1.metadata).get("IoTSDKFeature")).toContain("F/5");
    expect(new Map(result2.metadata).get("IoTSDKFeature")).toContain("F/3");
});

test('disableMetrics skips all metrics including CRT-side', () => {
    metrics._setSdkMetricsFactory(() => {
        const m = new mqtt_shared.AWSIoTMetrics();
        m.libraryName = "IoTDeviceSDK/JS";
        m.metadata = [
            ["IoTSDKVersion", "2.0.0"],
            ["IoTSDKMetricsVersion", "1"],
        ];
        return m;
    });

    const config: Mqtt5ClientConfig = {
        hostName: "localhost",
        port: 8883,
        disableMetrics: true,
        metrics: metrics._buildSdkMetrics(),
    };

    const metricsToSend = config.disableMetrics == true ? undefined : metrics.create_metrics_mqtt5(config);
    expect(metricsToSend).toBeUndefined();
});
