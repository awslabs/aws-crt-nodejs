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

export class Md5Hash {
    private hash?: Crypto.WordArray;
    
    update(data: Hashable) {
        this.hash = Crypto.MD5(data.toString(), this.hash ? this.hash.toString() : undefined);
    }

    digest(truncate_to?: number): DataView {
        const digest = this.hash ? this.hash.toString(Crypto.enc.Utf8) : '';
        const truncated = digest.substring(0, truncate_to ? truncate_to : digest.length);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(truncated);
        return new DataView(bytes);
    }
}

export function hash_md5(data: Hashable, truncate_to?: number): DataView {
    const md5 = new Md5Hash();
    md5.update(data);
    return md5.digest();
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

    digest(truncate_to?: number): DataView {
        const digest = this.hmac.finalize();
        const truncated = digest.substring(0, truncate_to ? truncate_to : digest.length);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(truncated);
        return new DataView(bytes);
    }
}
