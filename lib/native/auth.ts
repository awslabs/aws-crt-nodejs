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

export enum AwsSigningAlgorithm {
    SigV4
}

export enum AwsSigningTransform {
    Header,
    QueryParam
}

/* Subclass for the purpose of exposing a non-NativeHandle based API */
export class AwsCredentialsProvider extends crt_native.AwsCredentialsProvider {
    static newDefault(bootstrap: ClientBootstrap): AwsCredentialsProvider {
        return super.newDefault(bootstrap.native_handle());
    }
}

export type AwsSigningConfig = crt_native.AwsSigningConfig;

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
