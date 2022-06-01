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

import * as AWS from "aws-sdk";
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
 * CredentialsOptions Base Class. The base class of the options used for credentials providers.
 *
 * @category Auth
 */
export class CredentialsOptions{};

/**
 * AWSCognitoCredentialOptions. The credentials options used to create AWSCongnitoCredentialProvider.
 *
 * @category Auth
 */
export class AWSCognitoCredentialOptions implements CredentialsOptions
{
    IdentityPoolId : string;
    Region: string;

    constructor(IdentityPoolId: string, region: string)
    {
        this.IdentityPoolId = IdentityPoolId;
        this.Region = region;
    }
}

/**
 * StaticCredentialOptions. The credentials options for CredentialsProvider.
 *
 * @category Auth
 */
export class StaticCredentialOptions implements CredentialsOptions
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
    constructor(options: CredentialsOptions, expire_interval_in_ms? : number)
    {
        this.source_provider_options = options;
        /** Default expiration interval is 1 hour */
        this.expire_interval_in_ms = expire_interval_in_ms? expire_interval_in_ms:3600000;
        this.expire_time = undefined;
        this.next = null;
    }
    next : CredentialsProvider | null;
    /* reference to the source provider configrations */
    source_provider_options: CredentialsOptions; 
    expire_interval_in_ms : number;
    expire_time: Date | undefined;


    getCredentials() : AWSCredentials | undefined
    { 
        return undefined;
    }
    isExpired(){return false;}
    refreshCredential(){}
}


/**
 * StaticCredentialProvider. The provider will always return the static AWSCredential.
 *
 * @category Auth
 */
export class StaticCredentialProvider extends CredentialsProvider{
    constructor(options: CredentialsOptions, expire_interval_in_ms? : number)
    {
        super(options, expire_interval_in_ms);
        /** The provider with an "undefined" expire_time will be considered as never expired. */
        this.expire_time = undefined;
    }

    getCredentials = () =>
    {
        if (this.source_provider_options instanceof StaticCredentialOptions) {
            const options = this.source_provider_options as StaticCredentialOptions;
            return {
                aws_region: options.aws_region,
                aws_access_id : options.aws_access_id,
                aws_secret_key: options.aws_secret_key,
                aws_sts_token: options.aws_sts_token
            }
        }
        throw "Error in credentials options, failed to get Credentials."
    }

    isExpired = () =>
    {
        return false;
    }

    /** do nothing on refreshing static credentials */
    refreshCredential = () => {}
    
}

/**
 * AWSCognitoCredentialsProvider. The AWSCognitoCredentialsProvider implements AWS.CognitoIdentityCredentials.
 *
 * @category Auth
 */
export class AWSCognitoCredentialsProvider extends CredentialsProvider{
    source_provider : AWS.CognitoIdentityCredentials;
    aws_credentials : AWSCredentials;
    constructor(options: CredentialsOptions, expire_interval_in_ms? : number)
    {
        super(options, expire_interval_in_ms);
        AWS.config.region = (options as AWSCognitoCredentialOptions).Region;
        this.source_provider = new AWS.CognitoIdentityCredentials({
            IdentityPoolId: (options as AWSCognitoCredentialOptions).IdentityPoolId
        });
        this.refreshCredential();
        this.aws_credentials = 
        {
            aws_region: (options as AWSCognitoCredentialOptions).Region,
            aws_access_id : this.source_provider.accessKeyId,
            aws_secret_key: this.source_provider.secretAccessKey,
            aws_sts_token: this.source_provider.sessionToken
        }
        setInterval(()=>{this.refreshCredential();}, expire_interval_in_ms?? 3600000);
    }

    getCredentials(){
        return this.aws_credentials;
    }

    isExpired(){
        return this.source_provider.expired;
    }

    refreshCredential(){
        this.source_provider.get((err)=>
        {
            if(err)
            {
                this.source_provider.refresh((err) => {
                    if(err)
                    {
                        console.log(`Error fetching cognito credentials: ${err}`);
                    }
                    else
                    {
                        this.aws_credentials.aws_access_id = this.source_provider.accessKeyId;
                        this.aws_credentials.aws_secret_key = this.source_provider.secretAccessKey;
                        this.aws_credentials.aws_sts_token = this.source_provider.sessionToken;
                        this.aws_credentials.aws_region = (this.source_provider_options as AWSCognitoCredentialOptions).Region;
                        this.expire_time = this.source_provider.expireTime;
                    }
                });
            }
            else
            {
                this.aws_credentials.aws_access_id = this.source_provider.accessKeyId;
                this.aws_credentials.aws_secret_key = this.source_provider.secretAccessKey;
                this.aws_credentials.aws_sts_token = this.source_provider.sessionToken;
                this.aws_credentials.aws_region = (this.source_provider_options as AWSCognitoCredentialOptions).Region;
                this.expire_time = this.source_provider.expireTime;

            }
       });
    }


    async refreshCredentialAsync()
    {
        return new Promise<AWSCognitoCredentialsProvider>((resolve, reject) => {
            this.source_provider.get((err)=>{
                if(err)
                {
                    reject("Failed to get cognito credentials.")
                }
                else
                {
                    this.aws_credentials.aws_access_id = this.source_provider.accessKeyId;
                    this.aws_credentials.aws_secret_key = this.source_provider.secretAccessKey;
                    this.aws_credentials.aws_sts_token = this.source_provider.sessionToken;
                    this.aws_credentials.aws_region = (this.source_provider_options as AWSCognitoCredentialOptions).Region;
                    this.expire_time = this.source_provider.expireTime;
                    resolve(this);
                }
            });
        });
    }
}



/**
 * AWSCredentialsProviderCached. The AWSCredentialsProviderCached will be our main provider class.
 * The AWSCredentialsProviderCached will cached the current credential and expired_time, and stores a list of credentials providers. 
 *          If the credential is not expired, return the cached credentials.
 *          If the credential is expired, refresh the credential, and check the next credentialsProvider.
 * @category Auth
 */
export class AWSCredentialsProviderCached extends CredentialsProvider{
    cached_credentials : AWSCredentials | undefined;
    source_provider : CredentialsProvider | null;

    constructor(options: CredentialsOptions, expire_interval_in_ms? : number)
    {
        super(options,expire_interval_in_ms);
        var provider = null;
        if(options instanceof StaticCredentialOptions)
        {
            provider = new StaticCredentialProvider(options, expire_interval_in_ms);
        }
        else if (options instanceof AWSCognitoCredentialOptions)
        {
            provider = new AWSCognitoCredentialsProvider(options, expire_interval_in_ms);
        }
        this.source_provider = provider;
        this.cached_credentials = this.source_provider?.getCredentials();
        this.expire_time = this.source_provider?.expire_time;
    }

    add_provider(provider: CredentialsProvider)
    {
        provider.next = this.source_provider;
        this.source_provider = provider;
        this.cached_credentials = this.source_provider?.getCredentials();
        this.expire_time = this.source_provider.expire_time;
    }

    getCredentials(){
        if(!this.isExpired()) return this.cached_credentials;

        var provider = this.source_provider;
        if(provider == null)
            throw "The credential provider is not set."
        while(provider.isExpired())
        {
            provider.refreshCredential();
            if(provider.next != null)
                provider = provider.next;
            else
                break;
        }
        this.cached_credentials = provider.getCredentials();
        this.expire_time = provider.expire_time;
        return this.cached_credentials;
    }

    isExpired(){
        if (this.expire_time == undefined) return false;
        return this.expire_time <= new Date();
    }

    refreshCredential(){
        if(this.source_provider == null)
            throw "The credential provider is not set."
        return this.source_provider.refreshCredential();
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
