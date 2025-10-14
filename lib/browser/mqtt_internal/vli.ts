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

    let hasMore = true;
    while (hasMore)  {
        let byte = value & 0x7F;
        value = value >>> 7;
        hasMore = value > 0;
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

export enum VliDecodeResultType {
    Success,
    MoreData,
}

export interface VliDecodeResult {
    type: VliDecodeResultType,
    value?: number,
    nextOffset?: number
}

export function decode_vli(data: DataView, offset: number) : VliDecodeResult {
    let value: number = 0;
    let index: number = 0;
    let shift: number = 0;
    while (index < 4) {
        let view_index = offset + index++;
        let raw_byte = data.getUint8(view_index);
        let masked_byte = raw_byte & 0x7F;
        value += (masked_byte << shift);
        if (masked_byte == raw_byte) {
            return {
                type: VliDecodeResultType.Success,
                value: value,
                nextOffset: offset + index + 1
            };
        } else if (view_index >= data.byteLength) {
            return {
                type: VliDecodeResultType.MoreData
            };
        }

        shift += 7;
    }

    throw new CrtError("Decoding failure - invalid VLI integer");
}
