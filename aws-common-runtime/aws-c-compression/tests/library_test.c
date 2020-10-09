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

#include <aws/compression/compression.h>
#include <aws/testing/aws_test_harness.h>

AWS_TEST_CASE(library_init, s_test_library_init)
static int s_test_library_init(struct aws_allocator *allocator, void *ctx) {
    (void)ctx;

    aws_compression_library_init(allocator);

    /* Ensure that errors were registered */
    const char *err_name = aws_error_name(AWS_ERROR_COMPRESSION_UNKNOWN_SYMBOL);
    const char *expected = "AWS_ERROR_COMPRESSION_UNKNOWN_SYMBOL";
    ASSERT_BIN_ARRAYS_EQUALS(expected, strlen(expected), err_name, strlen(err_name));

    aws_compression_library_clean_up();
    return AWS_OP_SUCCESS;
}
