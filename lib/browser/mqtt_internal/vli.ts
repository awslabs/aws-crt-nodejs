/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";

// assumes value is integral and non-negative
export function get_vli_byte_length(value: number) : number {
    if (value < 128) {
        return 1;
    } else if (value < 16384) {
        return 2;
    } else if (value < 2097152) {
        return 3;
    } else if (value < 268435456) {
        return 4;
    } else {
        throw new CrtError("Invalid VLI value");
    }
}

// assumes value is integral and non-negative
export function encode_vli(dest: DataView, value: number) : DataView {
    let i = 0;
    if (4 > dest.byteLength) {
        throw new CrtError("Insufficient room to safely encode VLI value");
    }

    let hasMore = true;
    while (hasMore)  {
        let byte = value & 0x7F;
        value = value >>> 7;
        let hasMore = value > 0;
        if (hasMore) {
            byte = byte | 0x80;
            if (i >= 3) {
                throw new CrtError("Invalid VLI value");
            }
        }

        dest.setUint8(dest.byteOffset + i++, byte);
    }

    return new DataView(dest.buffer, dest.byteOffset + i, dest.byteLength - i);
}

export function decode_vli(view: DataView) : [number, DataView] {
    try {
        let value: number = 0;
        let index: number = 0;
        while (index < 4) {
            let raw_byte = view.getUint8(index++);
            let masked_byte = raw_byte & 0x7F;
            value = (value << 7) | masked_byte;
            if (masked_byte == raw_byte) {
                return [value, new DataView(view.buffer, view.byteOffset + index, view.byteLength - index)];
            }
        }
    } catch (e) {
        throw new CrtError("Decoding failure - short buffer");
    }

    throw new CrtError("Decoding failure - invalid VLI integer");
}