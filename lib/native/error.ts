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

import crt_native from './binding';
import { isNumber } from 'util';

/**
 * Represents an error encountered in native code. Can also be used to convert a numeric error code into
 * a human-readable string.
 *
 * @module aws-crt
 * @category System
 */
export class CrtError extends Error {
    /** The original integer error code from the CRT */
    readonly error_code?: number;
    /** The translated error name (e.g. AWS_ERROR_UNKNOWN) */
    readonly error_name?: string;

    /** @var error - The original error. Most often an error_code, but possibly some other context */
    constructor(readonly error: any) {
        super(extract_message(error));
        this.error_code = extract_code(error);
        this.error_name = extract_name(error);
    }
}

function extract_message(error: any): string {
    if (isNumber(error)) {
        return crt_native.error_code_to_string(error);
    } else if (error instanceof CrtError) {
        return error.message;
    }
    return error.toString();
}

function extract_code(error: any) {
    if (isNumber(error)) {
        return error;
    } else if (error instanceof CrtError) {
        return error.error_code;
    }
    return undefined;
}

function extract_name(error: any) {
    if (isNumber(error)) {
        return crt_native.error_code_to_name(error);
    } else if (error instanceof CrtError) {
        return error.error_name;
    }
    return undefined;
}
