/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

#include <aws/compression/huffman.h>

#include <aws/testing/compression/huffman.h>

struct aws_huffman_symbol_coder *test_get_coder(void);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {

    if (!size) {
        return 0;
    }

    struct aws_huffman_decoder decoder;
    aws_huffman_decoder_init(&decoder, test_get_coder());

    size_t output_buffer_size = size * 2;
    char output_buffer[output_buffer_size];

    struct aws_byte_cursor to_decode = aws_byte_cursor_from_array(data, size);
    struct aws_byte_buf output_buf = aws_byte_buf_from_empty_array(output_buffer, AWS_ARRAY_SIZE(output_buffer));

    /* Don't really care about result, just make sure there's no crash */
    aws_huffman_decode(&decoder, &to_decode, &output_buf);

    return 0; // Non-zero return values are reserved for future use.
}
