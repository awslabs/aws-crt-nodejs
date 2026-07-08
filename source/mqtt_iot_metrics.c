/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#include "mqtt_iot_metrics.h"

#include <aws/mqtt/mqtt.h>

static const char *AWS_NAPI_KEY_LIBRARY_NAME = "libraryName";
static const char *AWS_NAPI_KEY_METADATA = "metadata";

/**
 * Parses a JS AwsIoTDeviceSDKMetrics object into a native aws_mqtt_iot_metrics struct
 * for the C MQTT layer. The JS object has the shape:
 *   { libraryName: "IoTDeviceSDK/JS", metadata: [["CRTVersion","1.0.0"], ["IoTSDKFeature","F/5,G/A"], ...] }
 *
 * Caller must call aws_napi_metrics_clean_up(storage) after the metrics are no longer needed.
 * Shared by both MQTT5 (mqtt5_client.c) and MQTT3 (mqtt_client_connection.c).
 *
 * Returns AWS_OP_SUCCESS if metrics were successfully parsed (out_metrics is usable),
 * or AWS_OP_ERR if the metrics object was null/invalid (out_metrics should not be used).
 */

int aws_napi_metrics_parse(
    napi_env env,
    napi_value node_metrics,
    struct aws_mqtt_iot_metrics *out_metrics,
    struct aws_napi_metrics_storage *storage) {

    /* Zero-initialize so all fields are safe for cleanup on any error path */
    AWS_ZERO_STRUCT(*out_metrics);
    AWS_ZERO_STRUCT(*storage);

    if (aws_napi_is_null_or_undefined(env, node_metrics)) {
        AWS_LOGF_DEBUG(AWS_LS_NODEJS_CRT_GENERAL, "aws_napi_metrics_parse - metrics object is null/undefined");
        return AWS_OP_ERR;
    }

    struct aws_allocator *allocator = aws_napi_get_allocator();

    AWS_LOGF_DEBUG(AWS_LS_NODEJS_CRT_GENERAL, "aws_napi_metrics_parse: Creating metrics from JS object");

    /*
     * Extract the library name (e.g. "IoTDeviceSDK/JS").
     * Copies the JS string into library_name_buf and sets metrics.library_name
     * as a cursor pointing into that buffer.
     */
    napi_value node_library_name = NULL;
    if (napi_get_named_property(env, node_metrics, AWS_NAPI_KEY_LIBRARY_NAME, &node_library_name) != napi_ok ||
        aws_byte_buf_init_from_napi(&storage->library_name_buf, env, node_library_name) != AWS_OP_SUCCESS) {
        AWS_LOGF_DEBUG(AWS_LS_NODEJS_CRT_GENERAL, "aws_napi_metrics_parse - failed to read libraryName");
        return AWS_OP_ERR;
    }
    out_metrics->library_name = aws_byte_cursor_from_buf(&storage->library_name_buf);

    AWS_LOGF_TRACE(
        AWS_LS_NODEJS_CRT_GENERAL,
        "aws_napi_metrics_parse - libraryName: " PRInSTR,
        AWS_BYTE_CURSOR_PRI(out_metrics->library_name));

    /* Read the JS metadata array: [[key, value], ...] */
    napi_value node_metadata = NULL;
    if (napi_get_named_property(env, node_metrics, AWS_NAPI_KEY_METADATA, &node_metadata) != napi_ok ||
        aws_napi_is_null_or_undefined(env, node_metadata)) {
        /* Null metadata is valid — return metrics with just library name */
        AWS_LOGF_DEBUG(
            AWS_LS_NODEJS_CRT_GENERAL, "aws_napi_metrics_parse: no metadata entries, using libraryName only");
        return AWS_OP_SUCCESS;
    }

    /* Get array size */
    uint32_t count = 0;
    AWS_NAPI_CALL(env, napi_get_array_length(env, node_metadata, &count), {
        AWS_LOGF_ERROR(AWS_LS_NODEJS_CRT_GENERAL, "aws_napi_metrics_parse: failed to get metadata array length");
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    });

    /* Empty array is valid — return metrics with just library name */
    if (count == 0) {
        AWS_LOGF_DEBUG(AWS_LS_NODEJS_CRT_GENERAL, "aws_napi_metrics_parse: metadata array is empty");
        return AWS_OP_SUCCESS;
    }

    AWS_LOGF_TRACE(
        AWS_LS_NODEJS_CRT_GENERAL, "aws_napi_metrics_parse - parsing %u metadata entries", (unsigned int)count);

    /*
     * First pass: measure total byte length of all key/value strings.
     * This lets us pre-allocate a single contiguous buffer for all string data.
     */
    size_t total_length = 0;
    for (uint32_t i = 0; i < count; ++i) {
        napi_value entry = NULL;
        AWS_NAPI_CALL(env, napi_get_element(env, node_metadata, i, &entry), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "aws_napi_metrics_parse - metadata array is not indexable at index %u",
                (unsigned int)i);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        });

        napi_value node_key = NULL, node_value = NULL;
        AWS_NAPI_CALL(env, napi_get_element(env, entry, 0, &node_key), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL, "aws_napi_metrics_parse - failed to get key at index %u", (unsigned int)i);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        });
        AWS_NAPI_CALL(env, napi_get_element(env, entry, 1, &node_value), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL, "aws_napi_metrics_parse - failed to get value at index %u", (unsigned int)i);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        });

        struct aws_byte_buf key_buf, value_buf;
        AWS_ZERO_STRUCT(key_buf);
        AWS_ZERO_STRUCT(value_buf);
        if (aws_byte_buf_init_from_napi(&key_buf, env, node_key) != AWS_OP_SUCCESS) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "aws_napi_metrics_parse - failed to read key string at index %u",
                (unsigned int)i);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        }
        if (aws_byte_buf_init_from_napi(&value_buf, env, node_value) != AWS_OP_SUCCESS) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "aws_napi_metrics_parse - failed to read value string at index %u",
                (unsigned int)i);
            aws_byte_buf_clean_up(&key_buf);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        }
        total_length += key_buf.len + value_buf.len;
        aws_byte_buf_clean_up(&key_buf);
        aws_byte_buf_clean_up(&value_buf);
    }

    /* Pre-allocate entries array since we know the count */
    if (aws_array_list_init_dynamic(
            &storage->metadata_entries, allocator, count, sizeof(struct aws_mqtt_metadata_entry))) {
        AWS_LOGF_ERROR(AWS_LS_NODEJS_CRT_GENERAL, "aws_napi_metrics_parse - failed to allocate metadata entries");
        return AWS_OP_ERR;
    }

    if (aws_byte_buf_init(&storage->metadata_storage, allocator, total_length) != AWS_OP_SUCCESS) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL, "aws_napi_metrics_parse - failed to allocate metadata storage buffer");
        return AWS_OP_ERR;
    }

    /*
     * Second pass: read each [key, value] tuple, copy string data into the
     * contiguous storage buffer, and build metadata entries with stable cursors.
     */
    for (uint32_t i = 0; i < count; ++i) {
        napi_value entry = NULL;
        AWS_NAPI_CALL(env, napi_get_element(env, node_metadata, i, &entry), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "aws_napi_metrics_parse - metadata array is not indexable at index %u (second pass)",
                (unsigned int)i);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        });

        napi_value node_key = NULL, node_value = NULL;
        AWS_NAPI_CALL(env, napi_get_element(env, entry, 0, &node_key), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "aws_napi_metrics_parse - failed to get key at index %u (second pass)",
                (unsigned int)i);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        });
        AWS_NAPI_CALL(env, napi_get_element(env, entry, 1, &node_value), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "aws_napi_metrics_parse - failed to get value at index %u (second pass)",
                (unsigned int)i);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        });

        struct aws_byte_buf key_buf, value_buf;
        AWS_ZERO_STRUCT(key_buf);
        AWS_ZERO_STRUCT(value_buf);
        aws_byte_buf_init_from_napi(&key_buf, env, node_key);
        aws_byte_buf_init_from_napi(&value_buf, env, node_value);

        /* Key: read JS string into temp buffer, create cursor from it */
        struct aws_mqtt_metadata_entry metadata_entry;
        AWS_ZERO_STRUCT(metadata_entry);

        metadata_entry.key = aws_byte_cursor_from_buf(&key_buf);
        metadata_entry.value = aws_byte_cursor_from_buf(&value_buf);

        /* Copy key/value bytes into contiguous storage and update cursors to point there.
         * After this, the cursors point at heap memory owned by metadata_storage. */
        aws_byte_buf_append_and_update(&storage->metadata_storage, &metadata_entry.key);
        aws_byte_buf_append_and_update(&storage->metadata_storage, &metadata_entry.value);

        /* Release temporary napi buffers — data now lives in metadata_storage */
        aws_byte_buf_clean_up(&key_buf);
        aws_byte_buf_clean_up(&value_buf);

        /* Store entry with stable cursors into the array */
        aws_array_list_push_back(&storage->metadata_entries, &metadata_entry);

        AWS_LOGF_TRACE(
            AWS_LS_NODEJS_CRT_GENERAL,
            "aws_napi_metrics_parse: metadata[%u] key=\"" PRInSTR "\" value=\"" PRInSTR "\"",
            (unsigned int)i,
            AWS_BYTE_CURSOR_PRI(metadata_entry.key),
            AWS_BYTE_CURSOR_PRI(metadata_entry.value));
    }

    /* Set the output metrics struct to point to our parsed entries */
    out_metrics->metadata_entries = storage->metadata_entries.data;
    out_metrics->metadata_count = aws_array_list_length(&storage->metadata_entries);

    AWS_LOGF_TRACE(
        AWS_LS_NODEJS_CRT_GENERAL,
        "aws_napi_metrics_parse - successfully parsed %u metadata entries",
        (unsigned int)count);

    return AWS_OP_SUCCESS;
}

void aws_napi_metrics_clean_up(struct aws_napi_metrics_storage *storage) {
    /* Release the library name buffer */
    aws_byte_buf_clean_up(&storage->library_name_buf);
    /* Release the contiguous metadata string storage */
    aws_byte_buf_clean_up(&storage->metadata_storage);
    /* Release the metadata entries array */
    aws_array_list_clean_up(&storage->metadata_entries);
}
