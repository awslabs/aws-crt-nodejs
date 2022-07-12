/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Module for AWS Authentication logic - signing http requests, events, chunks, etc...
 *
 * @packageDocumentation
 * @module auth
 * @mergeTarget
 */

import * as auth from '../common/auth';
import crt_native from './binding';
import { CrtError } from './error';
import { HttpRequest } from './http';
import { ClientBootstrap } from './io';

/**
 * @internal
 */
type StringLike = string | ArrayBuffer | DataView;

/**
 * AWS signing algorithm enumeration.
 *
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
 * We don't currently expose an interface for fetching credentials from Javascript.
 *
 * @category Auth
 */
/* Subclass for the purpose of exposing a non-NativeHandle based API */
export class AwsCredentialsProvider extends crt_native.AwsCredentialsProvider {

    /**
     * Creates a new default credentials provider to be used internally for AWS credentials resolution:
     *
     *   The CRT's default provider chain currently sources in this order:
     *
     *     1. Environment
     *     2. Profile
     *     3. (conditional, off by default) ECS
     *     4. (conditional, on by default) EC2 Instance Metadata
     *
     * @param bootstrap (optional) client bootstrap to be used to establish any required network connections
     *
     * @returns a new credentials provider using default credentials resolution rules
     */
    static newDefault(bootstrap: ClientBootstrap | undefined = undefined): AwsCredentialsProvider {
        return super.newDefault(bootstrap != null ? bootstrap.native_handle() : null);
    }
}

/**
 * Configuration for use in AWS-related signing.
 * AwsSigningConfig is immutable.
 * It is good practice to use a new config for each signature, or the date might get too old.
 *
 * @category Auth
 */
export interface AwsSigningConfig extends auth.AwsSigningConfigBase {
    /** Which signing process to invoke */
    algorithm: AwsSigningAlgorithm;

    /** What kind of signature to compute */
    signature_type: AwsSignatureType;

    /** Credentials provider to fetch signing credentials with */
    provider: AwsCredentialsProvider;

    /**
     * Headers to skip when signing.
     *
     * Skipping auth-required headers will result in an unusable signature.
     * Headers injected by the signing process are not skippable.
     * This function does not override the internal check function
     * (x-amzn-trace-id, user-agent), but rather supplements it.
     * In particular, a header will get signed if and only if it returns
     * true to both the internal check (skips x-amzn-trace-id, user-agent)
     * and is found in this list (if defined)
     */
    header_blacklist?: string[];

    /**
     * Set true to double-encode the resource path when constructing the
     * canonical request. By default, all services except S3 use double encoding.
     */
    use_double_uri_encode?: boolean;

    /**
     * Whether the resource paths are normalized when building the canonical request.
     */
    should_normalize_uri_path?: boolean;

    /**
     * Should the session token be omitted from the signing process?  This should only be
     * true when making a websocket handshake with IoT Core.
     */
    omit_session_token?: boolean;

    /**
     * Value to use as the canonical request's body value.
     *
     * Typically, this is the SHA-256 of the payload, written as lowercase hex.
     * If this has been precalculated, it can be set here.
     * Special values used by certain services can also be set (see {@link AwsSignedBodyValue}).
     * If undefined (the default), the typical value will be calculated from the payload during signing.
     */
    signed_body_value?: string;

    /** Controls what header, if any, should be added to the request, containing the body value */
    signed_body_header?: AwsSignedBodyHeaderType;

    /** Query param signing only: how long the pre-signed URL is valid for */
    expiration_in_seconds?: number;
}

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
 * @returns A promise whose result will be the signed
 *       {@link HttpRequest}. The future will contain an exception
 *       if the signing process fails.
 *
 * @category Auth
 */
export async function aws_sign_request(request: HttpRequest, config: AwsSigningConfig): Promise<HttpRequest> {
    return new Promise((resolve, reject) => {
        try {
            /* Note: if the body of request has not fully loaded, it will lead to an endless loop. 
             * User should set the signed_body_value of config to prevent this endless loop in this case */
            crt_native.aws_sign_request(request, config, (error_code) => {
                if (error_code == 0) {
                    resolve(request);
                } else {
                    reject(new CrtError(error_code));
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

/**
 *
 * @internal
 *
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
 * @param ecc_key_pub_x the x coordinate of the public part of the ecc key to verify the signature.
 * @param ecc_key_pub_y the y coordinate of the public part of the ecc key to verify the signature
 * @returns True, if the verification succeed. Otherwise, false.
 */
export function aws_verify_sigv4a_signing(request: HttpRequest, config: AwsSigningConfig, expected_canonical_request: StringLike,
    signature: StringLike, ecc_key_pub_x: StringLike, ecc_key_pub_y: StringLike): boolean {
    return crt_native.aws_verify_sigv4a_signing(request, config, expected_canonical_request, signature, ecc_key_pub_x, ecc_key_pub_y);
}
