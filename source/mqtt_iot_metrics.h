/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#ifndef AWS_CRT_NODEJS_MQTT_IOT_METRICS_H
#define AWS_CRT_NODEJS_MQTT_IOT_METRICS_H

#include "module.h"

#include <aws/mqtt/mqtt.h>

/**
 * Storage for parsed metrics data. Must be cleaned up with aws_napi_metrics_clean_up().
 */
struct aws_napi_metrics_storage {
    /* Metrics view populated by aws_napi_metrics_parse; cursors point into the buffers below */
    struct aws_mqtt_iot_metrics metrics;
    /* Buffer holding the library name string */
    struct aws_byte_buf library_name_buf;
    /* Single buffer holding all metadata key/value strings contiguously */
    struct aws_byte_buf metadata_storage;
    /* Dynamic array of metadata entries pointing into metadata_storage */
    struct aws_array_list metadata_entries;
};

/**
 * Parse an AwsIoTMetrics JS object into aws_mqtt_iot_metrics struct.
 *
 * `out_storage` MUST be zero-initialized or already cleaned up via
 * aws_napi_metrics_clean_up() before being passed in. Passing in a storage
 * struct that still owns memory will leak it.
 *
 * Returns AWS_OP_SUCCESS on success (including the null-metrics),
 * AWS_OP_ERR with aws_last_error set on malformed input.
 */
int aws_napi_metrics_parse(
    napi_env env,
    napi_value node_metrics,
    struct aws_mqtt_iot_metrics **out_metrics,
    struct aws_napi_metrics_storage *out_storage);

/**
 * Clean up resources allocated by aws_napi_metrics_parse.
 */
void aws_napi_metrics_clean_up(struct aws_napi_metrics_storage *storage);

#endif /* AWS_CRT_NODEJS_MQTT_IOT_METRICS_H */
