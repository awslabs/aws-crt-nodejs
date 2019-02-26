/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

const crt_native = require('../../build/Debug/aws-crt-nodejs');

/**
 * The types that are acceptable to pass for hashing.
 */
type Hashable = string | ArrayBuffer | DataView | Buffer;

/**
 * Object that allows for continuous hashing of data.
 */
export class Hash {
    /**
     * Create a new Hash object using the MD5 algorithm.
     */
    static md5(): Hash {
        return new Hash(crt_native.hash_md5_new());
    }

    /**
     * Create a new Hash object using the SHA256 algorithm.
     */
    static sha256(): Hash {
        return new Hash(crt_native.hash_sha256_new());
    }

    /**
     * Apply data to the hash.
     */
    update(data: Hashable) {
        crt_native.hash_update(this.native_handle(), data);
    }

    /**
     * Completes the hash computation and returns the final digest.
     *
     * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
     */
    digest(truncate_to?: number): DataView {
        return crt_native.hash_digest(this.native_handle(), truncate_to);
    }

    private hash_handle: any;
    private constructor(hash_handle: any) {
        this.hash_handle = hash_handle;
    }
    native_handle(): any {
        return this.hash_handle;
    }
}

/**
 * Object that allows for continuous hashing of data with an hmac secret.
 */
export class Hmac {
    /**
     * Create a new Hmac object using the SHA256 algorithm.
     */
    static sha256(secret: Hashable): Hmac {
        return new Hmac(crt_native.hmac_sha256_new(secret));
    }

    /**
     * Apply data to the hash.
     */
    update(data: Hashable) {
        crt_native.hash_update(this.native_handle(), data);
    }

    /**
     * Completes the hash computation and returns the final digest.
     *
     * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
     */
    digest(truncate_to?: number): DataView {
        return crt_native.hash_digest(this.native_handle(), truncate_to);
    }

    private hash_handle: any;
    private constructor(hash_handle: any) {
        this.hash_handle = hash_handle;
    }
    native_handle(): any {
        return this.hash_handle;
    }
}
