/* Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
