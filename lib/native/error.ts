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

import crt_native = require('./binding');
import { isNumber } from 'util';

/** 
 * Represents an error encountered in native code. Can also be used to convert an error code(Number) into
 * a human-readable string.
 */
export class CrtError extends Error {
    /** The original integer error code from the CRT */
    public readonly error_code?: number;
    /** The translated error name (e.g. AWS_ERROR_UNKNOWN) */
    public readonly error_name?: string;

    /** @var error - The original error. Most often an error_code, but possibly some other context */
    constructor(readonly error: any) {
        super((isNumber(error)) ? crt_native.error_code_to_string(error) : error.toString());
        if (isNumber(error)) {
            this.error_code = error;
            this.error_name = crt_native.error_code_to_name(error);
        }
    }
}
