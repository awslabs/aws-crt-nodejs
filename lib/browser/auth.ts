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

 import { AwsSigningConfig } from '../common/auth';

 
 /**
 * Standard AWS Credentials
 *
 */
  export interface AWSBrowserCredentials{
    /** AWS region */
    aws_region: string,
    /** AWS access id */
    aws_access_id: string,
    /** AWS secret access key */
    aws_secret_key: string,
    /** Session token for session credentials */
    aws_sts_token?: string
}

 /**
  * Configuration for use in browser credential
  *
  * @category Auth
  */
export interface AWSBrowserSigningConfig extends AwsSigningConfig{
     /** callback for refresh credential when session expired, returns AWSBrowserCredentials
      * @param provider. The callback will pass the provider as a parameter
      * @param credentials The callback should update the credentials on refresh
     */
      refreshIdentityCallback: Function;
      credentials?: AWSBrowserCredentials;
}
