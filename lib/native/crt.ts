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

/**
 * Memory reporting is controlled by the AWS_CRT_MEMORY_TRACING environment
 * variable. Possible values are:
 * * 0 - No tracing
 * * 1 - Track active memory usage. Incurs a small performance penalty.
 * * 2 - Track active memory usage, and also track callstacks for every allocation.
 *   This incurs a performance penalty, depending on the cost of the platform's
 *   stack unwinding/backtrace API.
 * @packageDocumentation
 * @category System
 */

import crt_native from './binding';

/**
 * If the ```AWS_CRT_MEMORY_TRACING``` is environment variable is set to 1 or 2, 
 * will return the native memory usage in bytes. Otherwise, returns 0.
 * @returns The total allocated native memory, in bytes.
 * 
 * @category System
 */
export function native_memory() {
    return crt_native.native_memory();
}

/**
 * Dumps outstanding native memory allocations. If the ```AWS_CRT_MEMORY_TRACING```
 * environment variable is set to 1 or 2, will dump all active native memory to
 * the console log.
 * 
 * @category System
 */
export function native_memory_dump() {
    return crt_native.native_memory_dump();
}
