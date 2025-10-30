/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as vli from "./vli";

test('VLI encoding length 1 checks', () => {
    expect(vli.getVliByteLength(0)).toBe(1);
    expect(vli.getVliByteLength(1)).toBe(1);
    expect(vli.getVliByteLength(7)).toBe(1);
    expect(vli.getVliByteLength(64)).toBe(1);
    expect(vli.getVliByteLength(127)).toBe(1);
});

test('VLI encoding length 2 checks', () => {
    expect(vli.getVliByteLength(128)).toBe(2);
    expect(vli.getVliByteLength(129)).toBe(2);
    expect(vli.getVliByteLength(256)).toBe(2);
    expect(vli.getVliByteLength(128 * 128 - 1)).toBe(2);
});

test('VLI encoding length 3 checks', () => {
    expect(vli.getVliByteLength(128 * 128)).toBe(3);
    expect(vli.getVliByteLength(128 * 128 + 1)).toBe(3);
    expect(vli.getVliByteLength(65537)).toBe(3);
    expect(vli.getVliByteLength(128 * 128 * 128 - 1)).toBe(3);
});

test('VLI encoding length 4 checks', () => {
    expect(vli.getVliByteLength(128 * 128 * 128)).toBe(4);
    expect(vli.getVliByteLength(128 * 128 * 128 + 1)).toBe(4);
    expect(vli.getVliByteLength(128 * 128 * 128 * 64)).toBe(4);
    expect(vli.getVliByteLength(128 * 128 * 128 * 128 - 1)).toBe(4);
});

test('VLI encoding overflow checks', () => {
    expect(() => { vli.getVliByteLength(128 * 128 * 128 * 128)}).toThrow("Invalid VLI value");
    expect(() => { vli.getVliByteLength(128 * 128 * 128 * 128 + 1)}).toThrow("Invalid VLI value");
    expect(() => { vli.getVliByteLength(128 * 128 * 128 * 128 * 2)}).toThrow("Invalid VLI value");
});

test('VLI encoding 1 byte', () => {
    let buffer = new ArrayBuffer(4);
    let view1 = new DataView(buffer);

    let encode_result = vli.encodeVli(view1, 0);
    expect(encode_result.byteLength).toBe(3);
    expect(view1.getUint8(0)).toBe(0);

    encode_result = vli.encodeVli(view1, 1);
    expect(encode_result.byteLength).toBe(3);
    expect(view1.getUint8(0)).toBe(1);

    encode_result = vli.encodeVli(view1, 31);
    expect(encode_result.byteLength).toBe(3);
    expect(view1.getUint8(0)).toBe(31);

    encode_result = vli.encodeVli(view1, 127);
    expect(encode_result.byteLength).toBe(3);
    expect(view1.getUint8(0)).toBe(127);
});


test('VLI encoding 2 byte', () => {
    let buffer = new ArrayBuffer(4);
    let view1 = new DataView(buffer);

    let encode_result = vli.encodeVli(view1, 128);
    expect(encode_result.byteLength).toBe(2);
    expect(view1.getUint8(0)).toBe(128);
    expect(view1.getUint8(1)).toBe(1);

    encode_result = vli.encodeVli(view1, 129);
    expect(encode_result.byteLength).toBe(2);
    expect(view1.getUint8(0)).toBe(129);
    expect(view1.getUint8(1)).toBe(1);

    encode_result = vli.encodeVli(view1, 255);
    expect(encode_result.byteLength).toBe(2);
    expect(view1.getUint8(0)).toBe(255);
    expect(view1.getUint8(1)).toBe(1);

    encode_result = vli.encodeVli(view1, 256);
    expect(encode_result.byteLength).toBe(2);
    expect(view1.getUint8(0)).toBe(128);
    expect(view1.getUint8(1)).toBe(2);

    encode_result = vli.encodeVli(view1, 128 * 128 - 1);
    expect(encode_result.byteLength).toBe(2);
    expect(view1.getUint8(0)).toBe(255);
    expect(view1.getUint8(1)).toBe(127);
});

test('VLI encoding 3 byte', () => {
    let buffer = new ArrayBuffer(4);
    let view1 = new DataView(buffer);

    let encode_result = vli.encodeVli(view1, 128 * 128);
    expect(encode_result.byteLength).toBe(1);
    expect(view1.getUint8(0)).toBe(128);
    expect(view1.getUint8(1)).toBe(128);
    expect(view1.getUint8(2)).toBe(1);

    encode_result = vli.encodeVli(view1, 128 * 128 + 1);
    expect(encode_result.byteLength).toBe(1);
    expect(view1.getUint8(0)).toBe(129);
    expect(view1.getUint8(1)).toBe(128);
    expect(view1.getUint8(2)).toBe(1);

    encode_result = vli.encodeVli(view1, 128 * 128 + 127);
    expect(encode_result.byteLength).toBe(1);
    expect(view1.getUint8(0)).toBe(255);
    expect(view1.getUint8(1)).toBe(128);
    expect(view1.getUint8(2)).toBe(1);

    encode_result = vli.encodeVli(view1, 128 * 129);
    expect(encode_result.byteLength).toBe(1);
    expect(view1.getUint8(0)).toBe(128);
    expect(view1.getUint8(1)).toBe(129);
    expect(view1.getUint8(2)).toBe(1);

    encode_result = vli.encodeVli(view1, 128 * 128 * 128 - 1);
    expect(encode_result.byteLength).toBe(1);
    expect(view1.getUint8(0)).toBe(255);
    expect(view1.getUint8(1)).toBe(255);
    expect(view1.getUint8(2)).toBe(127);
});

test('VLI encoding 4 byte', () => {
    let buffer = new ArrayBuffer(4);
    let view1 = new DataView(buffer);

    let encode_result = vli.encodeVli(view1, 128 * 128 * 128);
    expect(encode_result.byteLength).toBe(0);
    expect(view1.getUint8(0)).toBe(128);
    expect(view1.getUint8(1)).toBe(128);
    expect(view1.getUint8(2)).toBe(128);
    expect(view1.getUint8(3)).toBe(1);

    encode_result = vli.encodeVli(view1, 128 * 128 * 128 + 1);
    expect(encode_result.byteLength).toBe(0);
    expect(view1.getUint8(0)).toBe(129);
    expect(view1.getUint8(1)).toBe(128);
    expect(view1.getUint8(2)).toBe(128);
    expect(view1.getUint8(3)).toBe(1);

    encode_result = vli.encodeVli(view1, 128 * 128 * 128 * 128 - 1);
    expect(encode_result.byteLength).toBe(0);
    expect(view1.getUint8(0)).toBe(255);
    expect(view1.getUint8(1)).toBe(255);
    expect(view1.getUint8(2)).toBe(255);
    expect(view1.getUint8(3)).toBe(127);
});

test('VLI encoding overflow', () => {
    let buffer = new ArrayBuffer(5);
    let view1 = new DataView(buffer);

    expect(() => { vli.encodeVli(view1, 128 * 128 * 128 * 128) }).toThrow("Invalid VLI value");
});


test('VLI decoding - 1 byte', () => {
    let buffer_0 = new Uint8Array([0]);
    expect(vli.decodeVli(new DataView(buffer_0.buffer), 0).value).toBe(0);

    let buffer_1 = new Uint8Array([1]);
    expect(vli.decodeVli(new DataView(buffer_1.buffer), 0).value).toBe(1);

    let buffer_63 = new Uint8Array([63]);
    expect(vli.decodeVli(new DataView(buffer_63.buffer), 0).value).toBe(63);

    let buffer_127 = new Uint8Array([127]);
    expect(vli.decodeVli(new DataView(buffer_127.buffer), 0).value).toBe(127);
});

test('VLI decoding - 2 byte', () => {
    let buffer_128 = new Uint8Array([128, 1]);
    expect(vli.decodeVli(new DataView(buffer_128.buffer), 0).value).toBe(128);

    let buffer_129 = new Uint8Array([129, 1]);
    expect(vli.decodeVli(new DataView(buffer_129.buffer), 0).value).toBe(129);

    let buffer_255 = new Uint8Array([255, 1]);
    expect(vli.decodeVli(new DataView(buffer_255.buffer), 0).value).toBe(255);

    let buffer_256 = new Uint8Array([128, 2]);
    expect(vli.decodeVli(new DataView(buffer_256.buffer), 0).value).toBe(256);

    let buffer_1025 = new Uint8Array([129, 8]);
    expect(vli.decodeVli(new DataView(buffer_1025.buffer), 0).value).toBe(1025);

    let buffer_16382 = new Uint8Array([254, 127]);
    expect(vli.decodeVli(new DataView(buffer_16382.buffer), 0).value).toBe(16382);
});

test('VLI decoding - 3 byte', () => {
    let buffer1 = new Uint8Array([128, 128, 1]);
    expect(vli.decodeVli(new DataView(buffer1.buffer), 0).value).toBe(128 * 128);

    let buffer2 = new Uint8Array([129, 128, 1]);
    expect(vli.decodeVli(new DataView(buffer2.buffer), 0).value).toBe(128 * 128 + 1);

    let buffer3 = new Uint8Array([255, 128, 1]);
    expect(vli.decodeVli(new DataView(buffer3.buffer), 0).value).toBe(128 * 128 + 127);

    let buffer4 = new Uint8Array([128, 128, 2]);
    expect(vli.decodeVli(new DataView(buffer4.buffer), 0).value).toBe(128 * 128 * 2);

    let buffer5 = new Uint8Array([255, 255, 127]);
    expect(vli.decodeVli(new DataView(buffer5.buffer), 0).value).toBe(128 * 128 * 128 - 1);
});

test('VLI decoding - 4 byte', () => {
    let buffer1 = new Uint8Array([128, 128, 128, 1]);
    expect(vli.decodeVli(new DataView(buffer1.buffer), 0).value).toBe(128 * 128 * 128);

    let buffer2 = new Uint8Array([129, 128, 128, 1]);
    expect(vli.decodeVli(new DataView(buffer2.buffer), 0).value).toBe(128 * 128 * 128 + 1);

    let buffer5 = new Uint8Array([255, 255, 255, 127]);
    expect(vli.decodeVli(new DataView(buffer5.buffer), 0).value).toBe(128 * 128 * 128 * 128 - 1);
});

function doRoundTripEncodeDecodeVliTest(value: number) {
    let buffer = new ArrayBuffer(4);

    let encode_result = vli.encodeVli(new DataView(buffer), value);
    let encoded_view = new DataView(buffer, 0, buffer.byteLength - encode_result.byteLength);

    expect(vli.decodeVli(encoded_view, 0).value).toBe(value);
}

test('VLI round trip', () => {
    doRoundTripEncodeDecodeVliTest(0);
    doRoundTripEncodeDecodeVliTest(37);
    doRoundTripEncodeDecodeVliTest(199);
    doRoundTripEncodeDecodeVliTest(581);
    doRoundTripEncodeDecodeVliTest(3700);
    doRoundTripEncodeDecodeVliTest(31502);
    doRoundTripEncodeDecodeVliTest(278306);
    doRoundTripEncodeDecodeVliTest(26843545);
});

function doEncodeDecodeMultipleVliTest(value: number, count: number) {
    let buffer = new ArrayBuffer(count * 4);
    let encoding_view = new DataView(buffer);

    for (let i = 0; i < count; i++) {
        encoding_view = vli.encodeVli(encoding_view, value);
    }

    let encoded_view = new DataView(buffer, 0, buffer.byteLength - encoding_view.byteLength);
    let decode_count : number = 0;
    let offset : number = 0;
    while (offset < encoded_view.byteLength) {
        let decode_result = vli.decodeVli(encoded_view, offset);
        if (decode_result.type == vli.VliDecodeResultType.Success) {
            expect(decode_result.value).toBe(value);
            // @ts-ignore
            offset = decode_result.nextOffset;
            decode_count++;
        }
    }

    expect(decode_count).toBe(count);
}

test('VLI Multiple', () => {
    doEncodeDecodeMultipleVliTest(42, 20);
    doEncodeDecodeMultipleVliTest(2000, 20);
    doEncodeDecodeMultipleVliTest(99999, 20);
    doEncodeDecodeMultipleVliTest(128 * 128 * 128 + 5, 20);
});
