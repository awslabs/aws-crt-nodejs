
/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
#include "checksums.h"

#include <aws/checksums/crc.h>

napi_value crc32_common(napi_env env, napi_callback_info info, uint32_t (*checksum_fn)(const uint8_t *, size_t, uint32_t)) {
    napi_value node_args[2];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    struct aws_byte_buf to_hash;
    AWS_ZERO_STRUCT(to_hash);

    napi_value node_val = NULL;

    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retrieve callback information");
        goto done;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_checksums_crc needs exactly 2 arguments");
        goto done;
    }

    if (aws_byte_buf_init_from_napi(&to_hash, env, node_args[0])) {
        napi_throw_type_error(env, NULL, "to_hash argument must be a string or array");
        goto done;
    }
    uint8_t *buffer = to_hash.buffer;
    size_t length = to_hash.len;
    uint32_t previous = 0;

    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        if (napi_get_value_uint32(env, node_args[1], &previous)) {
            napi_throw_type_error(env, NULL, "previous argument must be undefined or a positive number");
            goto done;
        }
    }

    uint32_t val = checksum_fn(buffer, length, previous);
    AWS_NAPI_CALL(env, napi_create_uint32(env, val, &node_val), { goto done; });

done:
    aws_byte_buf_clean_up(&to_hash);

    return node_val;
}

napi_value aws_napi_checksums_crc32(napi_env env, napi_callback_info info) {
    return crc32_common(env, info, aws_checksums_crc32_ex);
}

napi_value aws_napi_checksums_crc32c(napi_env env, napi_callback_info info) {
    return crc32_common(env, info, aws_checksums_crc32c_ex);
}

napi_value aws_napi_checksums_crc64nvme(napi_env env, napi_callback_info info) {
    napi_value node_args[2];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    struct aws_byte_buf to_hash;
    AWS_ZERO_STRUCT(to_hash);
    struct aws_byte_buf previous_buf;
    AWS_ZERO_STRUCT(previous_buf);

    napi_value node_val = NULL;

    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retrieve callback information");
        goto done;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_checksums_crc64 needs exactly 2 arguments");
        goto done;
    }

    if (aws_byte_buf_init_from_napi(&to_hash, env, node_args[0])) {
        napi_throw_type_error(env, NULL, "to_hash argument must be a string or array");
        goto done;
    }
    uint8_t *buffer = to_hash.buffer;
    size_t length = to_hash.len;

    uint64_t previous = 0;
    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        if (aws_byte_buf_init_from_napi(&previous_buf, env, node_args[1])) {
            napi_throw_type_error(env, NULL, "previous argument must be undefined or a positive number");
            goto done;
        }
        AWS_FATAL_ASSERT(previous_buf.len == 8);
        previous = *(uint64_t *)previous_buf.buffer;
    }
    
    uint64_t val = aws_checksums_crc64nvme_ex(buffer, length, previous);
    
    napi_value arraybuffer;
    void *data = NULL;
    if (napi_create_arraybuffer(env, 8, &data, &arraybuffer)) {
        napi_throw_error(env, NULL, "Failed to create output arraybuffer");
        goto done;
    }

    struct aws_byte_buf out_buf = aws_byte_buf_from_empty_array(data, 8);
    aws_byte_buf_write_be64(&out_buf, val);

    if (napi_create_dataview(env, 8, arraybuffer, 0, &node_val)) {
        napi_throw_error(env, NULL, "Failed to create output dataview");
        goto done;
    }

done:
    aws_byte_buf_clean_up(&to_hash);
    aws_byte_buf_clean_up(&previous_buf);

    return node_val;
}

