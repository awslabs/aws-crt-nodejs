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

import { auth as native } from '../lib/index';

test('AwsSigningConfig properties', () => {
    const now = new Date();
    let config = new native.AwsSigningConfig(
        native.SigningAlgorithm.SigV4QueryParam,
        undefined,
        'us-east-1',
        'iotcore',
        now,
        ["abc"],
        true,
        true,
        true,
    );

    expect(config.algorithm).toBe(native.SigningAlgorithm.SigV4QueryParam);

    expect(config.region).toBe('us-east-1');

    expect(config.service).toBe('iotcore');

    expect(config.date).toBe(now);

    expect(config.param_blacklist.length).toBe(1);
    expect(config.param_blacklist).toContain("abc");
    config.param_blacklist.push("def");
    expect(config.param_blacklist.length).toBe(2);
    expect(config.param_blacklist).toContain("abc");
    expect(config.param_blacklist).toContain("def");

    expect(config.use_double_uri_encode).toBe(true);

    expect(config.should_normalize_uri_path).toBe(true);

    expect(config.sign_body).toBe(true);
});
