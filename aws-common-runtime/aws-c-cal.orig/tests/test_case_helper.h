/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
#include <aws/cal/hash.h>
#include <aws/cal/hmac.h>

static inline int s_verify_hmac_test_case(
    struct aws_allocator *allocator,
    struct aws_byte_cursor *input,
    struct aws_byte_cursor *secret,
    struct aws_byte_cursor *expected,
    aws_hmac_new_fn *new_fn) {

    /* test all possible segmentation lengths from 1 byte at a time to the entire
     * input. */
    for (size_t i = 1; i < input->len; ++i) {
        uint8_t output[128] = {0};
        struct aws_byte_buf output_buf = aws_byte_buf_from_array(output, expected->len);
        output_buf.len = 0;

        struct aws_hmac *hmac = new_fn(allocator, secret);
        ASSERT_NOT_NULL(hmac);

        struct aws_byte_cursor input_cpy = *input;

        while (input_cpy.len) {
            size_t max_advance = input_cpy.len > i ? i : input_cpy.len;
            struct aws_byte_cursor segment = aws_byte_cursor_from_array(input_cpy.ptr, max_advance);
            ASSERT_SUCCESS(aws_hmac_update(hmac, &segment));
            aws_byte_cursor_advance(&input_cpy, max_advance);
        }

        size_t truncation_size = hmac->digest_size - expected->len;

        ASSERT_SUCCESS(aws_hmac_finalize(hmac, &output_buf, truncation_size));
        ASSERT_BIN_ARRAYS_EQUALS(expected->ptr, expected->len, output_buf.buffer, output_buf.len);

        aws_hmac_destroy(hmac);
    }

    return AWS_OP_SUCCESS;
}

static inline int s_verify_hash_test_case(
    struct aws_allocator *allocator,
    struct aws_byte_cursor *input,
    struct aws_byte_cursor *expected,
    aws_hash_new_fn *new_fn) {

    /* test all possible segmentation lengths from 1 byte at a time to the entire
     * input. */
    for (size_t i = 1; i < input->len; ++i) {
        uint8_t output[128] = {0};
        struct aws_byte_buf output_buf = aws_byte_buf_from_array(output, expected->len);
        output_buf.len = 0;

        struct aws_hash *hash = new_fn(allocator);
        ASSERT_NOT_NULL(hash);

        struct aws_byte_cursor input_cpy = *input;

        while (input_cpy.len) {
            size_t max_advance = input_cpy.len > i ? i : input_cpy.len;
            struct aws_byte_cursor segment = aws_byte_cursor_from_array(input_cpy.ptr, max_advance);
            ASSERT_SUCCESS(aws_hash_update(hash, &segment));
            aws_byte_cursor_advance(&input_cpy, max_advance);
        }

        size_t truncation_size = hash->digest_size - expected->len;

        ASSERT_SUCCESS(aws_hash_finalize(hash, &output_buf, truncation_size));
        ASSERT_BIN_ARRAYS_EQUALS(expected->ptr, expected->len, output_buf.buffer, output_buf.len);

        aws_hash_destroy(hash);
    }

    return AWS_OP_SUCCESS;
}
