/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { auth as native, http as native_http } from '../index';
import { InputStream } from './io';
import { PassThrough } from "stream";
import { aws_sign_request, aws_verify_sigv4a_signing } from './auth';

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

const SIGV4ATEST_SIGNED_HEADERS: [string, string][] = [
    ['Host', 'example.amazonaws.com'],
    ['Authorization', 'AWS4-ECDSA-P256-SHA256 Credential=AKIDEXAMPLE/20150830/service/aws4_request, SignedHeaders=host;x-amz-date;x-amz-region-set, Signature='],
    ['X-Amz-Date', DATE_STR.replace(/[-:]/g, '')],
    ['X-Amz-Region-Set', SIGV4TEST_REGION],
];

const SIGV4ATEST_EXPECTED_CANONICAL_REQUEST: string =
    SIGV4TEST_METHOD + "\n" +
    SIGV4TEST_PATH + "\n" +
    "\n" +
    "host:example.amazonaws.com\n" +
    "x-amz-date:20150830T123600Z\n" +
    "x-amz-region-set:" + SIGV4TEST_REGION + "\n" +
    "\n" +
    "host;x-amz-date;x-amz-region-set\n" +
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const ECC_KEY_PUB = {
    X: "b6618f6a65740a99e650b33b6b4b5bd0d43b176d721a3edfea7e7d2d56d936b1",
    Y: "865ed22a7eadc9c5cb9d2cbaca1b3699139fedc5043dc6661864218330c8e518"
};

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

    const expected_headers = [...SIGV4TEST_SIGNED_HEADERS].sort()
    const signed_headers = [...http_request.headers._flatten()].sort()
    expect(signed_headers).toEqual(expected_headers)
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
        signed_body_header: native.AwsSignedBodyHeaderType.None,
    };
    let stream = new PassThrough();
    let body_stream;
    stream.write("test");
    stream.end(() => {
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
});

test('AWS Signer SigV4A Headers', async () => {

    const credentials_provider = native.AwsCredentialsProvider.newStatic(
        SIGV4TEST_ACCESS_KEY_ID,
        SIGV4TEST_SECRET_ACCESS_KEY,
    );

    const signing_config: native.AwsSigningConfig = {
        algorithm: native.AwsSigningAlgorithm.SigV4Asymmetric,
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

    // copy the request for verification
    let ori_http_request = new native_http.HttpRequest(
        SIGV4TEST_METHOD,
        SIGV4TEST_PATH,
        new native_http.HttpHeaders(SIGV4TEST_UNSIGNED_HEADERS));

    const signing_result = await aws_sign_request(http_request, signing_config);

    expect(http_request).toBe(signing_result); // should be same object

    // everything should be the same EXCEPT the addition of the Authorization header
    expect(http_request.method).toBe(SIGV4TEST_METHOD);
    expect(http_request.path).toBe(SIGV4TEST_PATH);

    // Get the signature string
    let authorization = http_request.headers.get("Authorization");
    let separator = "Signature=";
    let splits = authorization.split(separator);
    let signature = splits[splits.length - 1];

    // Add the signature to expected header
    SIGV4ATEST_SIGNED_HEADERS[1][1] += signature;
    expect(http_request.headers._flatten()).toEqual(SIGV4ATEST_SIGNED_HEADERS);

    // Verify the signature
    let verification_result = aws_verify_sigv4a_signing(
        ori_http_request, signing_config, SIGV4ATEST_EXPECTED_CANONICAL_REQUEST, signature, ECC_KEY_PUB.X, ECC_KEY_PUB.Y);
    expect(verification_result).toBe(true);
});
