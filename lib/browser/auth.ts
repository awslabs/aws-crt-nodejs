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
 */
  export interface AWSCredentials{
    /** AWS region */
    aws_region: string,
    /** AWS access id */
    aws_access_id: string,
    /** AWS secret access key */
    aws_secret_key: string,
    /** Session token for session credentials */
    aws_sts_token?: string,
    /** external credential provider */
    aws_provider ?: any,
}

 /**
  * Configuration for use in browser credential
  *
  * @category Auth
  */
export interface AwsSigningConfig extends AwsSigningConfigBase{
     /** callback for refresh credential when session expired, returns AWSBrowserCredentials
      * @param credentials_provider. The callback will pass the provider as a parameter
    */
      updateCredentialCallback?: Function;
      credentials_provider?: AWSCredentials;
}
