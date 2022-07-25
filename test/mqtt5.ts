/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {Mqtt5ClientConfig} from "@awscrt/mqtt5";

export enum SuccessfulConnectionTestType {
    DIRECT_MQTT = 0,
    DIRECT_MQTT_WITH_BASIC_AUTH = 1,
    DIRECT_MQTT_WITH_TLS = 2,
    DIRECT_MQTT_WITH_TLS_VIA_PROXY = 3,
    WS_MQTT = 4,
    WS_MQTT_WITH_BASIC_AUTH = 5,
    WS_MQTT_WITH_TLS = 6,
    WS_MQTT_WITH_TLS_VIA_PROXY = 7
}

export type ApplyCustomMqtt5ClientConfig = (config: Mqtt5ClientConfig, testType: SuccessfulConnectionTestType) => Mqtt5ClientConfig;

export class ClientEnvironmentalConfig {

    public static DIRECT_MQTT_HOST = process.env.AWS_MQTT5_TEST_DIRECT_MQTT_HOST ?? "";
    public static DIRECT_MQTT_PORT = parseInt(process.env.AWS_MQTT5_TEST_DIRECT_MQTT_PORT ?? "0");
    public static DIRECT_MQTT_BASIC_AUTH_HOST = process.env.AWS_MQTT5_TEST_DIRECT_MQTT_BASIC_AUTH_HOST ?? "";
    public static DIRECT_MQTT_BASIC_AUTH_PORT = parseInt(process.env.AWS_MQTT5_TEST_DIRECT_MQTT_BASIC_AUTH_PORT ?? "0");
    public static DIRECT_MQTT_TLS_HOST = process.env.AWS_MQTT5_TEST_DIRECT_MQTT_TLS_HOST ?? "";
    public static DIRECT_MQTT_TLS_PORT = parseInt(process.env.AWS_MQTT5_TEST_DIRECT_MQTT_TLS_PORT ?? "0");
    public static WS_MQTT_HOST = process.env.AWS_MQTT5_TEST_WS_MQTT_HOST ?? "";
    public static WS_MQTT_PORT = parseInt(process.env.AWS_MQTT5_TEST_WS_MQTT_PORT ?? "0");
    public static WS_MQTT_BASIC_AUTH_HOST = process.env.AWS_MQTT5_TEST_WS_MQTT_BASIC_AUTH_HOST ?? "";
    public static WS_MQTT_BASIC_AUTH_PORT = parseInt(process.env.AWS_MQTT5_TEST_WS_MQTT_BASIC_AUTH_PORT ?? "0");
    public static WS_MQTT_TLS_HOST = process.env.AWS_MQTT5_TEST_WS_MQTT_TLS_HOST ?? "";
    public static WS_MQTT_TLS_PORT = parseInt(process.env.AWS_MQTT5_TEST_WS_MQTT_TLS_PORT ?? "0");

    public static BASIC_AUTH_USERNAME = process.env.AWS_MQTT5_TEST_BASIC_AUTH_USERNAME ?? "";
    public static BASIC_AUTH_PASSWORD = Buffer.from(process.env.AWS_MQTT5_TEST_BASIC_AUTH_USERNAME ?? "", "utf-8");

    public static PROXY_HOST = process.env.AWS_MQTT5_TEST_PROXY_HOST ?? "";
    public static PROXY_PORT = parseInt(process.env.AWS_MQTT5_TEST_PROXY_PORT ?? "0");

    private static getSuccessfulConnectionTestHost(testType : SuccessfulConnectionTestType) : string {
        if (testType == SuccessfulConnectionTestType.DIRECT_MQTT) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_HOST;
        } else if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_BASIC_AUTH_HOST;
        } else if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_TLS_HOST;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT) {
            return ClientEnvironmentalConfig.WS_MQTT_HOST;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH) {
            return ClientEnvironmentalConfig.WS_MQTT_BASIC_AUTH_HOST;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return ClientEnvironmentalConfig.WS_MQTT_TLS_HOST;
        }

        return "";
    }

    private static getSuccessfulConnectionTestPort(testType : SuccessfulConnectionTestType) : number {
        if (testType == SuccessfulConnectionTestType.DIRECT_MQTT) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_PORT;
        } else if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_BASIC_AUTH_PORT;
        } else if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY) {
            return ClientEnvironmentalConfig.DIRECT_MQTT_TLS_PORT;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT) {
            return ClientEnvironmentalConfig.WS_MQTT_PORT;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH) {
            return ClientEnvironmentalConfig.WS_MQTT_BASIC_AUTH_PORT;
        } else if (testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return ClientEnvironmentalConfig.WS_MQTT_TLS_PORT;
        }

        return 0;
    }

    private static isTestBasicAuth(testType: SuccessfulConnectionTestType) : boolean {
        if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_BASIC_AUTH ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH) {
            return true;
        }

        return false;
    }

    public static doesTestUseTls(testType: SuccessfulConnectionTestType) : boolean {
        if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return true;
        }

        return false;
    }

    public static doesTestUseWebsockets(testType: SuccessfulConnectionTestType) : boolean {
        if (testType == SuccessfulConnectionTestType.WS_MQTT ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_BASIC_AUTH ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return true;
        }

        return false;
    }

    public static doesTestUseProxy(testType: SuccessfulConnectionTestType) : boolean {
        if (testType == SuccessfulConnectionTestType.DIRECT_MQTT_WITH_TLS_VIA_PROXY ||
            testType == SuccessfulConnectionTestType.WS_MQTT_WITH_TLS_VIA_PROXY) {
            return true;
        }

        return false;
    }

    public static hasValidSuccessfulConnectionTestConfig(testType : SuccessfulConnectionTestType) : boolean {
        return ClientEnvironmentalConfig.getSuccessfulConnectionTestHost(testType) !== "" &&
            ClientEnvironmentalConfig.getSuccessfulConnectionTestPort(testType) != 0;
    }

    public static getSuccessfulConnectionTestConfig(testType : SuccessfulConnectionTestType, customConfigCallback: ApplyCustomMqtt5ClientConfig) : Mqtt5ClientConfig {
        let config : Mqtt5ClientConfig = {
            hostName : ClientEnvironmentalConfig.getSuccessfulConnectionTestHost(testType),
            port : ClientEnvironmentalConfig.getSuccessfulConnectionTestPort(testType),
        }

        if (ClientEnvironmentalConfig.isTestBasicAuth(testType)) {
            config.connectProperties = {
                keepAliveIntervalSeconds : 1200,
                username : ClientEnvironmentalConfig.BASIC_AUTH_USERNAME,
                password : ClientEnvironmentalConfig.BASIC_AUTH_PASSWORD
            }
        }

        return customConfigCallback(config, testType);
    }
}

