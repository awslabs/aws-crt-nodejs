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
    /** AWS access id */
    access_id: string,
    /** AWS secret access key */
    secret_key: string,
    /** Session token for session credentials */
    sts_token?: string
}

 /**
  * Configuration for use in browser credential
  *
  * @category Auth
  */
export interface AWSBrowserSigningConfig extends AwsSigningConfig{
     /** callback for refresh credential when session expired, returns AWSBrowserCredentials
      * @param provider. The callback will pass the provider as a parameter
      *  AWSBrowserCredentials.credential_error should set to 0 if the credential result is valid.
     */
      getIdentityCallback: Function;
}
