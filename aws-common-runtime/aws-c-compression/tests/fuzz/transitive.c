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

    const char *error_message = NULL;
    int result = huffman_test_transitive(test_get_coder(), (const char *)data, size, 0, &error_message);
    ASSERT_SUCCESS(result, error_message);

    return 0; // Non-zero return values are reserved for future use.
}
