/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * The types that are acceptable to use as input for hashing.
 *
 * @module aws-crt
 * @category Crypto
 */
export type Hashable = string | ArrayBuffer | DataView | Buffer;
