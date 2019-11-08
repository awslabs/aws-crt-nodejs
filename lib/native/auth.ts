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
    SigV4Header,
    SigV4QueryParam,
}

/* Subclass for the purpose of exposing a non-NativeHandle based API */
export class AwsCredentialsProvider extends crt_native.AwsCredentialsProvider {
    constructor(bootstrap: ClientBootstrap) {
        super(bootstrap.native_handle());
    }
    static newDefault(bootstrap: ClientBootstrap): AwsCredentialsProvider {
        return super.newDefault(bootstrap.native_handle());
    }
}

export class AwsSigningConfig extends crt_native.AwsSigningConfig {
    constructor(
        algorithm = AwsSigningAlgorithm.SigV4Header,
        provider?: AwsCredentialsProvider,
        region?: string,
        service?: string,
        date = new Date(),
        param_blacklist?: string[],
        use_double_uri_encode = false,
        should_normalize_uri_path = true,
        sign_body = true,
    ) {
        super(
            algorithm,
            provider,
            region,
            service,
            date,
            param_blacklist,
            use_double_uri_encode,
            should_normalize_uri_path,
            sign_body,
        );
    }
}

export class AwsSigner extends crt_native.AwsSigner {

    public async sign_request(request: HttpRequest, config: AwsSigningConfig): Promise<HttpRequest> {
        return new Promise((resolve, reject) => {
            super.sign_request(request, config, (error_code) => {
                if (error_code == 0) {
                    resolve(request);
                } else {
                    reject(error_code);
                }
            });
        });
    }
}
