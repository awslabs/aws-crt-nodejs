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

import crt_native from './binding';
import { HttpRequest } from './http';
import { ClientBootstrap } from './io';

/**
 * AWS signing algorithm enumeration.
 *
 * @module aws-crt
 * @category Auth
 */
export enum AwsSigningAlgorithm {
    /** Use Signature Version 4 to sign headers. */
    SigV4Header,
    /** Use Signature Version 4 to sign query parameters. */
    SigV4QueryParam,
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
