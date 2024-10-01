/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * A module containing support for a variety of cryptographic operations.
 *
 * @packageDocumentation
 * @module crypto
 * @mergeTarget
 */

import * as Crypto from "crypto-js";
import { Hashable } from "../common/crypto";

export { Hashable } from "../common/crypto";

/**
 * CryptoJS does not provide easy access to underlying bytes.
 * As a workaround just dump it to a string and then reinterpret chars as individual bytes.
 * TODO: long term we would probably want to move to WebCrypto for SHA's and some other 3p for crc's and md5.
 * @param hash 
 * @returns 
 */
function hashToUint8Array(hash: Crypto.WordArray) {
    return Uint8Array.from(hash.toString(Crypto.enc.Latin1).split('').map(c => c.charCodeAt(0)));;
}

class BaseHash {
    private hasher : any;

    constructor(hasher: any) {
        this.hasher = hasher;
    }

    /**
     * Hashes additional data
     * @param data Additional data to hash
     */
    update(data: Hashable) {
        this.hasher.update(data.toString());
    }

    /**
     * Completes the hash computation and returns the final hash digest.
     *
     * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
     *
     * @returns the final hash digest
     */
    finalize(truncate_to?: number): DataView {
        const hashBuffer = hashToUint8Array(this.hasher.finalize()) ;
        const truncated = hashBuffer.slice(0, truncate_to ? truncate_to : hashBuffer.length);
        return new DataView(truncated.buffer);;
    }
}

/**
 * Object that allows for continuous MD5 hashing of data.
 *
 * @category Crypto
 */
export class Md5Hash extends BaseHash {
    constructor() {
        super(Crypto.algo.MD5.create());
    }
}


/**
 * Computes an MD5 hash. Use this if you don't need to stream the data you're hashing and can load the entire input
 * into memory.
 *
 * @param data The data to hash
 * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
 *
 * @returns the data's hash digest
 *
 * @category Crypto
 */
export function hash_md5(data: Hashable, truncate_to?: number): DataView {
    const md5 = new Md5Hash();
    md5.update(data);
    return md5.finalize(truncate_to);
}

/**
 * Object that allows for continuous SHA256 hashing of data.
 *
 * @category Crypto
 */
export class Sha256Hash extends BaseHash {
    constructor() {
        super(Crypto.algo.SHA256.create());
    }
}

/**
 * Computes an SHA256 hash. Use this if you don't need to stream the data you're hashing and can load the entire input
 * into memory.
 *
 * @param data The data to hash
 * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
 *
 * @returns the data's hash digest
 *
 * @category Crypto
 */
export function hash_sha256(data: Hashable, truncate_to?: number): DataView {
    const sha256 = new Sha256Hash();
    sha256.update(data);
    return sha256.finalize(truncate_to);
}

/**
 * Object that allows for continuous SHA1 hashing of data.
 *
 * @category Crypto
 */
 export class Sha1Hash extends BaseHash {
    constructor() {
        super(Crypto.algo.SHA1.create());
    }
}

/**
 * Computes an SHA1 hash. Use this if you don't need to stream the data you're hashing and can load the entire input
 * into memory.
 *
 * @param data The data to hash
 * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
 *
 * @returns the data's hash digest
 *
 * @category Crypto
 */
export function hash_sha1(data: Hashable, truncate_to?: number): DataView {
    const sha1 = new Sha1Hash();
    sha1.update(data);
    return sha1.finalize(truncate_to);
}

/**
 * Object that allows for continuous hashing of data with an hmac secret.
 *
 * @category Crypto
 */
export class Sha256Hmac extends BaseHash {
    /**
     * Constructor for the Sha256Hmac class type
     * @param secret secret key to seed the hmac process with
     */
    constructor(secret: Hashable) {
        // @ts-ignore types file doesn't have this signature of create()
        super(Crypto.algo.HMAC.create(Crypto.algo.SHA256, secret));
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
 * @returns the data's hmac digest
 *
 * @category Crypto
 */
export function hmac_sha256(secret: Hashable, data: Hashable, truncate_to?: number): DataView {
    const hmac = new Sha256Hmac(secret);
    hmac.update(data);
    return hmac.finalize(truncate_to);
}
