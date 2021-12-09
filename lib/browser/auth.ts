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

/**
 * Standard AWS Credentials
 *
 */
export interface AWSCredentials {
    /** Optional region */
    aws_region?: string,
    /** AWS access id */
    aws_access_id: string,
    /** AWS secret access key */
    aws_secret_key: string,
    /** Session token for session credentials */
    aws_sts_token?: string
}
