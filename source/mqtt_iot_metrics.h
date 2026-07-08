/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#ifndef AWS_CRT_NODEJS_MQTT_IOT_METRICS_H
#define AWS_CRT_NODEJS_MQTT_IOT_METRICS_H

#include "module.h"

struct aws_mqtt_iot_metrics;

/**
 * Storage for parsed metrics data. Must be cleaned up with aws_napi_metrics_clean_up().
 */
struct aws_napi_metrics_storage {
    /* Buffer holding the library name string */
    struct aws_byte_buf library_name_buf;
    /* Single buffer holding all metadata key/value strings contiguously */
    struct aws_byte_buf metadata_storage;
    /* Dynamic array of metadata entries pointing into metadata_storage */
    struct aws_array_list metadata_entries;
};

/**
 * Parse an AwsIoTDeviceSDKMetrics JS object into aws_mqtt_iot_metrics struct.
 * Returns AWS_OP_SUCCESS on success, AWS_OP_ERR on failure.
 */
int aws_napi_metrics_parse(
    napi_env env,
    napi_value node_metrics,
    struct aws_mqtt_iot_metrics *out_metrics,
    struct aws_napi_metrics_storage *storage);

/**
 * Clean up resources allocated by aws_napi_metrics_parse.
 */
void aws_napi_metrics_clean_up(struct aws_napi_metrics_storage *storage);

#endif /* AWS_CRT_NODEJS_MQTT_IOT_METRICS_H */
