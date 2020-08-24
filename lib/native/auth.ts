/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import crt_native from './binding';
import { HttpRequest } from './http';
import { ClientBootstrap } from './io';

/** @category System */
type StringLike = string | ArrayBuffer | DataView;

/**
 * AWS signing algorithm enumeration.
 *
 * @module aws-crt
 * @category Auth
 */
export enum AwsSigningAlgorithm {
    /** Use the Aws signature version 4 signing process to sign the request */
    SigV4,
    /** Use the Aws signature version 4 Asymmetric signing process to sign the request */
    SigV4Asymmetric
}

/**
 * AWS signature type enumeration.
 *
 * @category Auth
 */
export enum AwsSignatureType {
    /** Sign an http request and apply the signing results as headers */
    HttpRequestViaHeaders,

    /** Sign an http request and apply the signing results as query params */
    HttpRequestViaQueryParams,

    /** Sign an http request payload chunk */
    HttpRequestChunk,

    /** Sign an event stream event */
    HttpRequestEvent
}

/**
 * Values for use with {@link AwsSigningConfig.signed_body_value}.
 *
 * Some services use special values (e.g. 'UNSIGNED-PAYLOAD') when the body
 * is not being signed in the usual way.
 *
 * @category Auth
 */
export enum AwsSignedBodyValue {
    /** Use the SHA-256 of the empty string as the canonical request payload value */
    EmptySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",

    /** Use the literal string 'UNSIGNED-PAYLOAD' as the canonical request payload value  */
    UnsignedPayload = "UNSIGNED-PAYLOAD",

    /** Use the literal string 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD' as the canonical request payload value  */
    StreamingAws4HmacSha256Payload = "STREAMING-AWS4-HMAC-SHA256-PAYLOAD",

    /** Use the literal string 'STREAMING-AWS4-HMAC-SHA256-EVENTS' as the canonical request payload value  */
    StreamingAws4HmacSha256Events = "STREAMING-AWS4-HMAC-SHA256-EVENTS",
}

/**
 * AWS signed body header enumeration.
 *
 * @category Auth
 */
export enum AwsSignedBodyHeaderType {
    /** Do not add a header containing the canonical request payload value */
    None,

    /** Add the X-Amz-Content-Sha256 header with the canonical request payload value */
    XAmzContentSha256
}

/**
 * Credentials providers source the AwsCredentials needed to sign an authenticated AWS request.
 *
 * @module aws-crt
 * @category Auth
 */
/* Subclass for the purpose of exposing a non-NativeHandle based API */
export class AwsCredentialsProvider extends crt_native.AwsCredentialsProvider {
    static newDefault(bootstrap: ClientBootstrap): AwsCredentialsProvider {
        return super.newDefault(bootstrap.native_handle());
    }
}

/**
 * Configuration for use in AWS-related signing.
 * AwsSigningConfig is immutable.
 * It is good practice to use a new config for each signature, or the date might get too old.
 *
 * @module aws-crt
 * @category Auth
 */
export type AwsSigningConfig = crt_native.AwsSigningConfig;

/**
 * Perform AWS HTTP request signing.
 *
 * The {@link HttpRequest} is transformed asynchronously,
 * according to the {@link AwsSigningConfig}.
 *
 * When signing:
 *  1.  It is good practice to use a new config for each signature,
 *      or the date might get too old.
 *
 *  2.  Do not add the following headers to requests before signing, they may be added by the signer:
 *      x-amz-content-sha256,
 *      X-Amz-Date,
 *      Authorization
 *
 *  3.  Do not add the following query params to requests before signing, they may be added by the signer:
 *      X-Amz-Signature,
 *      X-Amz-Date,
 *      X-Amz-Credential,
 *      X-Amz-Algorithm,
 *      X-Amz-SignedHeaders
 * @param request The HTTP request to sign.
 * @param config Configuration for signing.
 * @returns A Future whose result will be the signed
 *       {@link HttpRequest}. The future will contain an exception
 *       if the signing process fails.
 *
 * @module aws-crt
 * @category Auth
 */
export async function aws_sign_request(request: HttpRequest, config: AwsSigningConfig): Promise<HttpRequest> {
    return new Promise((resolve, reject) => {
        try {
            crt_native.aws_sign_request(request, config, (error_code) => {
                if (error_code == 0) {
                    resolve(request);
                } else {
                    reject(error_code);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Test only.
 * Verifies:
 *  (1) The canonical request generated during sigv4a signing of the request matches what is passed in
 *  (2) The signature passed in is a valid ECDSA signature of the hashed string-to-sign derived from the
 *  canonical request
 * 
 * @param request The HTTP request to sign.
 * @param config Configuration for signing.
 * @param expected_canonical_request String type of expected canonical request. Refer to XXX(link to doc?)
 * @param signature The generated signature string from {@link aws_sign_request}, which is verified here.
 * @returns True, if the verification succeed. Otherwise, false.
 */
export function aws_verify_sigv4a_signing(request: HttpRequest, config: AwsSigningConfig, expected_canonical_request: StringLike,
    signature: StringLike): boolean {
    return crt_native.aws_verify_sigv4a_signing(request, config, expected_canonical_request, signature);
}
