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
 export interface AwsSigningConfig {

     /** Which signing process to invoke */
     algorithm: AwsSigningAlgorithm;
 
     /** What kind of signature to compute */
     signature_type: AwsSignatureType;
 
     /** Credentials provider to fetch signing credentials with */
     provider: any;
 
     /** Name of service to sign a request for */
     service?: string;
 
     /**
      * Date and time to use during the signing process. If not provided then
      * the current time in UTC is used. Naive dates (lacking timezone info)
      * are assumed to be in local time
      */
     date?: Date;
 
     /**
      * Headers to skip when signing.
      *
      * Skipping auth-required headers will result in an unusable signature.
      * Headers injected by the signing process are not skippable.
      * This function does not override the internal check function
      * (x-amzn-trace-id, user-agent), but rather supplements it.
      * In particular, a header will get signed if and only if it returns
      * true to both the internal check (skips x-amzn-trace-id, user-agent)
      * and is found in this list (if defined)
      */
     header_blacklist?: string[];
 
     /**
      * Set true to double-encode the resource path when constructing the
      * canonical request. By default, all services except S3 use double encoding.
      */
     use_double_uri_encode?: boolean;
 
     /**
      * Whether the resource paths are normalized when building the canonical request.
      */
     should_normalize_uri_path?: boolean;
 
     /**
      * Should the session token be omitted from the signing process?  This should only be
      * true when making a websocket handshake with IoT Core.
      */
     omit_session_token?: boolean;
 
     /**
      * Value to use as the canonical request's body value.
      *
      * Typically, this is the SHA-256 of the payload, written as lowercase hex.
      * If this has been precalculated, it can be set here.
      * Special values used by certain services can also be set (see {@link AwsSignedBodyValue}).
      * If undefined (the default), the typical value will be calculated from the payload during signing.
      */
     signed_body_value?: string;
 
     /** Controls what header, if any, should be added to the request, containing the body value */
     signed_body_header?: AwsSignedBodyHeaderType;
 
     /** Query param signing only: how long the pre-signed URL is valid for */
     expiration_in_seconds?: number;
 }