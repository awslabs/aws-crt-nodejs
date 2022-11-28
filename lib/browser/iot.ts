/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Module for AWS IoT configuration and connection establishment. Unifies the MQTT-311 client module (aws_iot.ts) and
 * the MQTT-5 module (aws_iot_mqtt5.ts)
 *
 * @packageDocumentation
 * @module iot
 * @mergeTarget
 */

export * from './aws_iot';
export * from './aws_iot_mqtt5';
