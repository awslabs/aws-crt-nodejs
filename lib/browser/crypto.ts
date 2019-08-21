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

import * as Crypto from "crypto-js";
import { Hashable } from "../common/crypto";
import { TextEncoder } from "util";

export class Md5Hash {
    private hash?: Crypto.WordArray;
    
    update(data: Hashable) {
        this.hash = Crypto.MD5(data.toString(), this.hash ? this.hash.toString() : undefined);
    }

    finalize(truncate_to?: number): DataView {
        const digest = this.hash ? this.hash.toString() : '';
        const truncated = digest.substring(0, truncate_to ? truncate_to : digest.length);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(truncated);
        return new DataView(bytes.buffer);
    }
}


/**
 * Computes an MD5 hash. Use this if you don't need to stream the data you're hashing and can load the entire input
 * into memory.
 *
 * @param data The data to hash
 * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
 */
export function hash_md5(data: Hashable, truncate_to?: number): DataView {
    const md5 = new Md5Hash();
    md5.update(data);
    return md5.finalize(truncate_to);
}

export class Sha256Hmac {
    private hmac: any;

    constructor(secret: Hashable) {
        // @ts-ignore types file doesn't have this signature of create()
        this.hmac = Crypto.algo.HMAC.create(Crypto.algo.SHA256, secret);
    }

    update(data: Hashable) {
        this.hmac.update(data.toString());
    }

    finalize(truncate_to?: number): DataView {
        const digest = this.hmac.finalize();
        const truncated = digest.toString().substring(0, truncate_to ? truncate_to : digest.length);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(truncated);
        return new DataView(bytes.buffer);
    }
}

/**
 * Computes an SHA256 hash. Use this if you don't need to stream the data you're hashing and can load the entire input
 * into memory.
 *
 * @param data The data to hash
 * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
 */
export function hash_sha256(data: Hashable, truncate_to?: number): DataView {
    const digest = Crypto.SHA256(data.toString()).toString();
    const truncated = digest.substring(0, truncate_to ? truncate_to : digest.length);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(truncated);
    return new DataView(bytes.buffer);
}

/**
 * Computes an SHA256 HMAC. Use this if you don't need to stream the data you're hashing and can load the entire input
 * into memory.
 *
 * @param secret The key to use for the HMAC process
 * @param data The data to hash
 * @param truncate_to The maximum number of bytes to receive. Leave as undefined or 0 to receive the entire digest.
 */
export function hmac_sha256(secret: Hashable, data: Hashable, truncate_to?: number): DataView {
    const hmac = new Sha256Hmac(secret);
    hmac.update(data);
    return hmac.finalize(truncate_to);
}
