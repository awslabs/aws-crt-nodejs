/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import crt_native from './binding';
import { NativeResource } from "./native_resource";
import { Hashable } from "../common/crypto";

/**
 * Object that allows for continuous hashing of data.
 *
 * @internal
 */
abstract class Hash extends NativeResource {
    /**
     * Digest additional data.
     * @param data Additional data to digest
     */
    update(data: Hashable) {
        crt_native.hash_update(this.native_handle(), data);
    }

    /**
     * Completes the hash computation and returns the final digest.
     *
     * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
     */
    finalize(truncate_to?: number): DataView {
        return crt_native.hash_digest(this.native_handle(), truncate_to);
    }

    constructor(hash_handle: any) {
        super(hash_handle);
    }
}

/**
 * Object that allows for continuous MD5 hashing of data.
 *
 * @module aws-crt
 * @category Crypto
 */
export class Md5Hash extends Hash {
    constructor() {
        super(crt_native.hash_md5_new());
    }
}

/**
 * Computes an MD5 hash. Use this if you don't need to stream the data you're hashing and can load the entire input
 * into memory.
 *
 * @param data The data to hash
 * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
 *
 * @module aws-crt
 * @category Crypto
 */
export function hash_md5(data: Hashable, truncate_to?: number): DataView {
    return crt_native.hash_md5_compute(data, truncate_to);
}

/**
 * Object that allows for continuous SHA256 hashing of data.
 *
 * @module aws-crt
 * @category Crypto
 */
export class Sha256Hash extends Hash {
    constructor() {
        super(crt_native.hash_sha256_new());
    }
}


/**
 * Computes an SHA256 hash. Use this if you don't need to stream the data you're hashing and can load the entire input
 * into memory.
 *
 * @param data The data to hash
 * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
 *
 * @module aws-crt
 * @category Crypto
 */
export function hash_sha256(data: Hashable, truncate_to?: number): DataView {
    return crt_native.hash_sha256_compute(data, truncate_to);
}

/**
 * Object that allows for continuous hashing of data with an hmac secret.
 *
 * @module aws-crt
 * @category Crypto
 */
abstract class Hmac extends NativeResource {
    /**
     * Digest additional data.
     */
    update(data: Hashable) {
        crt_native.hmac_update(this.native_handle(), data);
    }

    /**
     * Completes the hash computation and returns the final digest.
     *
     * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
     */
    finalize(truncate_to?: number): DataView {
        return crt_native.hmac_digest(this.native_handle(), truncate_to);
    }

    constructor(hash_handle: any) {
        super(hash_handle);
    }
}

/**
 * Object that allows for continuous SHA256 HMAC hashing of data.
 *
 * @module aws-crt
 * @category Crypto
 */
export class Sha256Hmac extends Hmac {
    constructor(secret: Hashable) {
        super(crt_native.hmac_sha256_new(secret));
    }
}

/**
 * Computes an SHA256 HMAC. Use this if you don't need to stream the data you're hashing and can load the entire input
 * into memory.
 *
 * @param secret The key to use for the HMAC process
 * @param data The data to hash
 * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
 *
 * @module aws-crt
 * @category Crypto
 */
export function hmac_sha256(secret: Hashable, data: Hashable, truncate_to?: number): DataView {
    return crt_native.hmac_sha256_compute(secret, data, truncate_to);
}
