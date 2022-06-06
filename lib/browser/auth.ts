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
 * CredentialsProviderOptions Base Class. The base class of the options used for credentials providers.
 *
 * @category Auth
 */
export class CredentialsProviderOptions {};


/**
 * StaticCredentialOptions. The credentials options for CredentialsProvider.
 *
 * @category Auth
 */
export class StaticCredentialOptions implements CredentialsProviderOptions 
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
    expire_interval_in_ms : number;
    
    constructor(expire_interval_in_ms? : number)
    {
        /** Default expiration interval is 1 hour */
        this.expire_interval_in_ms = expire_interval_in_ms? expire_interval_in_ms:3600000;
    }

    /** Return a valid credentials. Please note mqtt.js does not support promises, meaning that
     * you must use the refreshCredential function to handles application-level authentication refreshing
     * so that the websocket connection could simply grab the latest valid tokens when getCredentials() get
     * called. 
     * 
     * @Returns AWSCredentials
     * 
     * */
    getCredentials() : AWSCredentials | undefined
    { 
        return undefined;
    }

    /** Used to validate the token. */
    isExpired() : boolean {return false;}

    /** The function will get called every {expire_interval_in_ms} ms to refresh the credential session token. */
    refreshCredential() : void {};
}


/**
 * StaticCredentialProvider. The provider will always return the static AWSCredential.
 *
 * @category Auth
 */
export class StaticCredentialProvider extends CredentialsProvider{
    options : StaticCredentialOptions;
    constructor(options: StaticCredentialOptions, expire_interval_in_ms? : number)
    {
        super(expire_interval_in_ms);
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

    isExpired = () : boolean =>
    {
        return false;
    }

    /** do nothing on refreshing static credentials */
    refreshCredential = () : void => {}
}

/**
 * Configuration for use in browser credentials
 *
 * @category Auth
 */
export interface AwsSigningConfig extends AwsSigningConfigBase{
    credentials: AWSCredentials;
}
