#ifndef AWS_COMPRESSION_COMPRESSION_H
#define AWS_COMPRESSION_COMPRESSION_H

/*
 * Copyright 2010-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

#include <aws/compression/exports.h>

#include <aws/common/common.h>

#define AWS_C_COMPRESSION_PACKAGE_ID 3

enum aws_compression_error {
    AWS_ERROR_COMPRESSION_UNKNOWN_SYMBOL = AWS_ERROR_ENUM_BEGIN_RANGE(AWS_C_COMPRESSION_PACKAGE_ID),

    AWS_ERROR_END_COMPRESSION_RANGE = AWS_ERROR_ENUM_END_RANGE(AWS_C_COMPRESSION_PACKAGE_ID)
};

/**
 * Initializes internal datastructures used by aws-c-compression.
 * Must be called before using any functionality in aws-c-compression.
 */
AWS_COMPRESSION_API
void aws_compression_library_init(struct aws_allocator *alloc);

/**
 * Clean up internal datastructures used by aws-c-compression.
 * Must not be called until application is done using functionality in aws-c-compression.
 */
AWS_COMPRESSION_API
void aws_compression_library_clean_up(void);

#endif /* AWS_COMPRESSION_COMPRESSION_H */
