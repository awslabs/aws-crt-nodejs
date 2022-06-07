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

import { AwsSigningConfigBase } from '../common/auth';

 
/**
 * Standard AWS Credentials
 *
 * @category Auth
 */
export interface AWSCredentials{
    /** Optional region */
    aws_region?: string,
    /** AWS access id */
    aws_access_id: string,
    /** AWS secret access key */
    aws_secret_key: string,
    /** Session token for session credentials */
    aws_sts_token?: string,
}

/**
 * StaticCredentialOptions. The credentials options for CredentialsProvider.
 *
 * @category Auth
 */
export class StaticCredentialOptions 
{
    /** region */
    aws_region: string;
    /** AWS access id */
    aws_access_id: string;
    /** AWS secret access key */
    aws_secret_key: string;
    /** Session token for session credentials */
    aws_sts_token?: string;

    constructor(aws_region: string, aws_access_id: string, aws_secret_key: string, aws_sts_token?: string)
    {
        this.aws_region = aws_region;
        this.aws_access_id = aws_access_id;
        this.aws_secret_key = aws_secret_key;
        this.aws_sts_token = aws_sts_token;
    }
}

/**
 * CredentialsProvider Base Class. The base class of credentials providers.
 *
 * @category Auth
 */
export class CredentialsProvider{
    /** Return a valid credentials. Please note mqtt.js does not support promises, meaning that credentials 
     * provider implementation should handle application-level authentication refreshing so that the websocket 
     * connection could simply grab the latest valid tokens when getCredentials() get called. 
     * 
     * @Returns AWSCredentials
     * 
     * */
    getCredentials() : AWSCredentials | undefined
    { 
        return undefined;
    }
}


/**
 * StaticCredentialProvider. The provider will always return the static AWSCredential.
 *
 * @category Auth
 */
export class StaticCredentialProvider extends CredentialsProvider{
    options : StaticCredentialOptions;
    constructor(options: StaticCredentialOptions)
    {
        super();
        this.options = options;
    }

    getCredentials = () : AWSCredentials | undefined =>
    {
        return {
            aws_region: this.options.aws_region,
            aws_access_id : this.options.aws_access_id,
            aws_secret_key: this.options.aws_secret_key,
            aws_sts_token: this.options.aws_sts_token
        }
    }
}

/**
 * Configuration for use in browser credentials
 *
 * @category Auth
 */
export interface AwsSigningConfig extends AwsSigningConfigBase{
    credentials: AWSCredentials;
}
