/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 *
 * A module containing support for a variety of cryptographic operations.
 *
 * @packageDocumentation
 * @module crypto
 */

/**
 * The types that are acceptable to use as input for hashing.
 *
 * @category Crypto
 */
export type Hashable = string | ArrayBuffer | DataView | Buffer;
