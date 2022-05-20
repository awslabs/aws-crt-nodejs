/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Module for AWS Authentication logic - signing http requests, events, chunks, etc...
 *
 * @packageDocumentation
 * @module auth
 * @preferred
 */

import crt_native from './binding';
import { CrtError } from './error';
import { HttpRequest } from './http';
import { ClientBootstrap } from './io';
import { StringLike, AwsSigningConfigBase} from '../common/auth';

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

export interface AwsSigningConfig extends AwsSigningConfigBase {
    /** Sources the AWS Credentials used to sign the websocket connection handshake */
    provider: AwsCredentialsProvider;
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
