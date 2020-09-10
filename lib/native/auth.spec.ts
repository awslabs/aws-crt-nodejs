/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { auth as native, http as native_http } from '../index';
import { aws_sign_request } from './auth';
import { InputStream } from './io';
import { PassThrough } from "stream";

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
    ['Authorization', 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31'],
    ['X-Amz-Date', DATE_STR.replace(/[-:]/g, '')],
];

test('AWS Signer SigV4 Headers', async () => {

    const credentials_provider = native.AwsCredentialsProvider.newStatic(
        SIGV4TEST_ACCESS_KEY_ID,
        SIGV4TEST_SECRET_ACCESS_KEY,
    );

    const signing_config: native.AwsSigningConfig = {
        algorithm: native.AwsSigningAlgorithm.SigV4,
        signature_type: native.AwsSignatureType.HttpRequestViaHeaders,
        provider: credentials_provider,
        region: SIGV4TEST_REGION,
        service: SIGV4TEST_SERVICE,
        date: new Date(DATE_STR),
        signed_body_value: native.AwsSignedBodyValue.EmptySha256,
        signed_body_header: native.AwsSignedBodyHeaderType.None,
    };

    let http_request = new native_http.HttpRequest(
        SIGV4TEST_METHOD,
        SIGV4TEST_PATH,
        new native_http.HttpHeaders(SIGV4TEST_UNSIGNED_HEADERS));

    const signing_result = await aws_sign_request(http_request, signing_config);

    expect(http_request).toBe(signing_result); // should be same object

    // everything should be the same EXCEPT the addition of the Authorization header
    expect(http_request.method).toBe(SIGV4TEST_METHOD);
    expect(http_request.path).toBe(SIGV4TEST_PATH);

    expect(http_request.headers._flatten()).toEqual(SIGV4TEST_SIGNED_HEADERS);
});

test('AWS Signer SigV4 Request with body', async () => {

    const credentials_provider = native.AwsCredentialsProvider.newStatic(
        SIGV4TEST_ACCESS_KEY_ID,
        SIGV4TEST_SECRET_ACCESS_KEY,
    );

    const signing_config: native.AwsSigningConfig = {
        algorithm: native.AwsSigningAlgorithm.SigV4,
        signature_type: native.AwsSignatureType.HttpRequestViaHeaders,
        provider: credentials_provider,
        region: SIGV4TEST_REGION,
        service: SIGV4TEST_SERVICE,
        date: new Date(DATE_STR),
        // signed_body_value: native.AwsSignedBodyValue.UnsignedPayload,
        signed_body_header: native.AwsSignedBodyHeaderType.None,
    };
    let stream = new PassThrough();
    let body_stream;
    stream.write("test");
    stream.end(()=> {
        body_stream = new InputStream(stream);
    });
    let http_request = new native_http.HttpRequest(
        SIGV4TEST_METHOD,
        SIGV4TEST_PATH,
        new native_http.HttpHeaders(SIGV4TEST_UNSIGNED_HEADERS),
        body_stream);

    const signing_result = await aws_sign_request(http_request, signing_config);

    expect(http_request).toBe(signing_result); // should be same object

    // everything should be the same EXCEPT the addition of the Authorization header
    expect(http_request.method).toBe(SIGV4TEST_METHOD);
    expect(http_request.path).toBe(SIGV4TEST_PATH);
    /* signature will be different since the payload is different */
    //expect(http_request.headers._flatten()).toEqual(SIGV4TEST_SIGNED_HEADERS);
});
