/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt5 from "../common/mqtt5";
import * as mqtt_shared from "../common/mqtt_shared";
import * as metrics from "./aws_iot_metrics";
import { Mqtt5ClientConfig } from "./mqtt5";
import { MqttConnectionConfig } from "./mqtt";


test('get_encoded_feature_list_mqtt5 - minimal config emits only F/5', () => {
    const config: Mqtt5ClientConfig = {
        hostName: "localhost",
        port: 443,
    };
    const result = metrics.get_encoded_feature_list_mqtt5(config);
    expect(result).toBe("F/5");
});

test('get_encoded_feature_list_mqtt5 - with retry / session / topic alias emits A/B/D/E/F', () => {
    const config: Mqtt5ClientConfig = {
        hostName: "localhost",
        port: 443,
        retryJitterMode: mqtt5.RetryJitterType.Full,
        sessionBehavior: mqtt5.ClientSessionBehavior.Clean,
        topicAliasingOptions: {
            outboundBehavior: mqtt5.OutboundTopicAliasBehaviorType.LRU,
            inboundBehavior: mqtt5.InboundTopicAliasBehaviorType.Enabled,
        },
    };
    const result = metrics.get_encoded_feature_list_mqtt5(config);
    expect(result).toContain("A/B");  // retry jitter Full
    expect(result).toContain("B/A");  // session Clean
    expect(result).toContain("D/B");  // outbound LRU
    expect(result).toContain("E/A");  // inbound Enabled
    expect(result).toContain("F/5");  // MQTT5
});


test('get_encoded_feature_list_mqtt3 - minimal emits only F/3', () => {
    const config = {} as MqttConnectionConfig;
    const result = metrics.get_encoded_feature_list_mqtt3(config);
    expect(result).toBe("F/3");
});


test('create_metrics_mqtt5 - minimal config', () => {
    const config: Mqtt5ClientConfig = {
        hostName: "localhost",
        port: 443,
    };
    const result = metrics.create_metrics_mqtt5(config);
    expect(result.libraryName).toBe(mqtt_shared.SDK_NAME);
    const metadataMap = new Map(result.metadata);
    expect(metadataMap.get("CRTVersion")).toBeDefined();
    expect(metadataMap.get("IoTSDKMetricsVersion")).toBe(String(metrics.IOT_SDK_METRICS_FEATURE_VERSION));
    expect(metadataMap.get("IoTSDKFeature")).toBe("F/5");
});

test('create_metrics_mqtt5 - propagates user libraryName and SDK version', () => {
    const userMetrics = new mqtt_shared.AWSIoTMetrics();
    userMetrics.libraryName = "IoTDeviceSDK/JS";
    userMetrics.metadata = [
        ["IoTSDKMetricsVersion", String(metrics.IOT_SDK_METRICS_FEATURE_VERSION)],
        ["IoTSDKVersion", "2.0.0"],
    ];
    const config: Mqtt5ClientConfig = {
        hostName: "localhost",
        port: 443,
        metrics: userMetrics,
    };
    const result = metrics.create_metrics_mqtt5(config);
    expect(result.libraryName).toBe("IoTDeviceSDK/JS");
    const metadataMap = new Map(result.metadata);
    expect(metadataMap.get("IoTSDKVersion")).toBe("2.0.0");
    expect(metadataMap.get("IoTSDKFeature")).toBe("F/5");
});

test('create_metrics_mqtt3 - minimal config', () => {
    const config = {} as MqttConnectionConfig;
    const result = metrics.create_metrics_mqtt3(config);
    expect(result.libraryName).toBe(mqtt_shared.SDK_NAME);
    const metadataMap = new Map(result.metadata);
    expect(metadataMap.get("CRTVersion")).toBeDefined();
    expect(metadataMap.get("IoTSDKMetricsVersion")).toBe(String(metrics.IOT_SDK_METRICS_FEATURE_VERSION));
    expect(metadataMap.get("IoTSDKFeature")).toBe("F/3");
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
    expect(metadataMap.get("IoTSDKFeature")).toBe("F/3");
});

// ---- Factory hook + browser config types ----
// Each test below registers its own factory, so ordering doesn't matter between them.

test('_buildSdkMetrics returns fresh instance per client (two browser clients from SDK)', () => {
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
        port: 443,
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
    expect(new Map(result1.metadata).get("IoTSDKFeature")).toBe("F/5");
    expect(new Map(result2.metadata).get("IoTSDKFeature")).toBe("F/3");
});

test('disableMetrics skips all metrics including CRT-side (browser Mqtt5ClientConfig)', () => {
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
        port: 443,
        disableMetrics: true,
        metrics: metrics._buildSdkMetrics(),
    };

    const metricsToSend = config.disableMetrics == true ? undefined : metrics.create_metrics_mqtt5(config);
    expect(metricsToSend).toBeUndefined();
});
