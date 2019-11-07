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

 // Force memory tracing on for this suite
process.env = Object.assign(process.env, { 'AWS_SDK_MEMORY_TRACING': '2' });

import { crt } from '../lib/index';

test('Native Memory', () => {
    expect(crt.native_memory()).toBeGreaterThan(0);
});

