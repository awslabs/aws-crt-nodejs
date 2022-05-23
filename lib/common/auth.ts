/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Module contains interface for AWS Authentication logic - signing http requests, events, chunks, etc...
 *
 * @packageDocumentation
 * @module auth
 * @preferred
 */

/**
 * @internal
 */
export type StringLike = string | ArrayBuffer | DataView;

/**
 * AWS signing algorithm enumeration.
 *
 * @category Auth
 */
export enum AwsSigningAlgorithm {
    /** Use the Aws signature version 4 signing process to sign the request */
    SigV4,

    /** Use the Aws signature version 4 Asymmetric signing process to sign the request */
    SigV4Asymmetric
}

/**
 * AWS signature type enumeration.
 *
 * @category Auth
 */
export enum AwsSignatureType {
    /** Sign an http request and apply the signing results as headers */
    HttpRequestViaHeaders,

    /** Sign an http request and apply the signing results as query params */
    HttpRequestViaQueryParams,

    /** Sign an http request payload chunk */
    HttpRequestChunk,

    /** Sign an event stream event */
    HttpRequestEvent
}

/**
 * Values for use with {@link AwsSigningConfig.signed_body_value}.
 *
 * Some services use special values (e.g. 'UNSIGNED-PAYLOAD') when the body
 * is not being signed in the usual way.
 *
 * @category Auth
 */
export enum AwsSignedBodyValue {
    /** Use the SHA-256 of the empty string as the canonical request payload value */
    EmptySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",

    /** Use the literal string 'UNSIGNED-PAYLOAD' as the canonical request payload value  */
    UnsignedPayload = "UNSIGNED-PAYLOAD",

    /** Use the literal string 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD' as the canonical request payload value  */
    StreamingAws4HmacSha256Payload = "STREAMING-AWS4-HMAC-SHA256-PAYLOAD",

    /** Use the literal string 'STREAMING-AWS4-HMAC-SHA256-EVENTS' as the canonical request payload value  */
    StreamingAws4HmacSha256Events = "STREAMING-AWS4-HMAC-SHA256-EVENTS",
}

/**
 * AWS signed body header enumeration.
 *
 * @category Auth
 */
export enum AwsSignedBodyHeaderType {
    /** Do not add a header containing the canonical request payload value */
    None,

    /** Add the X-Amz-Content-Sha256 header with the canonical request payload value */
    XAmzContentSha256
}

/**
 * Configuration for use in AWS-related signing.
 * AwsSigningConfig is immutable.
 * It is good practice to use a new config for each signature, or the date might get too old.
 *
 * @category Auth
 */
export interface AwsSigningConfigBase {

    /** The region to sign against */
    region: string;
    /** Name of service to sign a request for */
    service?: string;
    /**
     * Date and time to use during the signing process. If not provided then
     * the current time in UTC is used. Naive dates (lacking timezone info)
     * are assumed to be in local time
     */
    date?: Date;

    /** Query param signing only: how long the pre-signed URL is valid for */
    expiration_in_seconds ?: number;
}

/**
 * Configuration for websocket signing
 * It is good practice to use a new config for each signature, or the date might get too old.
 *
 * @category Auth
 */
export interface WebsocketOptionsBase {
    /**
     * (Optional) factory function to create the configuration used to sign the websocket handshake.  Leave null
     * to use the default settings.
     */
    create_signing_config ?: ()=> AwsSigningConfigBase;

    /**
     * (Optional) override for the service name used in signing the websocket handshake.  Leave null to use the
     * default (iotdevicegateway)
     */
     service?: string;

    /**
     *  For browser: credentials_provider is Type AWSCredentials
     *  For native:  Type _crt_native_._AwsCredentialsProvider_
     */
    credentials_provider?: any;

    /** callback for refresh credential on creating the wws url
     *  @param credentials_provider. The callback will pass the provider as a parameter
     */
    updateCredentialCallback?: Function;

    /** expiration time */
    expiration_time?: number;
}