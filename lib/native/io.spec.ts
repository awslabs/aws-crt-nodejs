/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as io from './io';
import { CrtError } from './error';

test('Error Resolve', () => {
    const err = new CrtError(0);
    expect(err.error_code).toBe(0);
    expect(err.error_name).toBe('AWS_ERROR_SUCCESS');
    expect(err.message).toBe('aws-c-common: AWS_ERROR_SUCCESS, Success.');
});

test('ALPN availability', () => {
    expect(io.is_alpn_available()).toBeDefined();
});
