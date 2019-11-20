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

import { auth as native, http as native_http } from '../lib/index';
import { AwsCredentialsProvider } from '../lib/native/auth';

test('AwsSigningConfig properties', () => {
    const now = new Date();
    const provider = AwsCredentialsProvider.newStatic("key", "secret");
    let config = new native.AwsSigningConfig(
        native.AwsSigningAlgorithm.SigV4QueryParam,
        provider,
        'us-east-1',
        'iotcore',
        now,
        ["abc"],
        true,
        true,
        true,
    );

    expect(config.algorithm).toBe(native.AwsSigningAlgorithm.SigV4QueryParam);

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

const DATE_STR = '2015-08-30T12:36:00Z';

// Test values copied from aws-c-auth/tests/aws-sig-v4-test-suite/get-vanilla"
const SIGV4TEST_ACCESS_KEY_ID = 'AKIDEXAMPLE';
const SIGV4TEST_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
const SIGV4TEST_SERVICE = 'service';
const SIGV4TEST_REGION = 'us-east-1';
const SIGV4TEST_METHOD = 'GET';
const SIGV4TEST_PATH = '/';
const SIGV4TEST_UNSIGNED_HEADERS: [string, string][] = [
    ['Host', 'example.amazonaws.com']
];
const SIGV4TEST_SIGNED_HEADERS: [string, string][] = [
    ['Host', 'example.amazonaws.com'],
    ["x-amz-content-sha256", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ['Authorization', 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31'],
    ['X-Amz-Date', DATE_STR.replace(/[-:]/g, '')],
]

test('AWS Signer Constructor', () => {

    new native.AwsSigner();
});

test('AWS Signer SigV4 Headers', async () => {
    const signer = new native.AwsSigner();

    const credentials_provider = native.AwsCredentialsProvider.newStatic(
        SIGV4TEST_ACCESS_KEY_ID,
        SIGV4TEST_SECRET_ACCESS_KEY,
    );

    const signing_config = new native.AwsSigningConfig(
        native.AwsSigningAlgorithm.SigV4Header,
        credentials_provider,
        SIGV4TEST_REGION,
        SIGV4TEST_SERVICE,
        new Date(DATE_STR),
        undefined,
        false,
        true,
        false);

    let http_request = new native_http.HttpRequest(
        SIGV4TEST_METHOD,
        SIGV4TEST_PATH,
        new native_http.HttpHeaders(SIGV4TEST_UNSIGNED_HEADERS));

    const signing_result = await signer.sign_request(http_request, signing_config);

    expect(http_request).toBe(signing_result); // should be same object

    // everything should be the same EXCEPT the addition of the Authorization header
    expect(http_request.method).toBe(SIGV4TEST_METHOD);
    expect(http_request.path).toBe(SIGV4TEST_PATH);

    expect(http_request.headers._flatten()).toEqual(SIGV4TEST_SIGNED_HEADERS);
});
