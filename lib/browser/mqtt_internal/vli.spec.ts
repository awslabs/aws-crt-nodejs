/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as vli from "./vli";

test('VLI encoding length 1 checks', () => {
    expect(vli.get_vli_byte_length(0)).toBe(1);
    expect(vli.get_vli_byte_length(1)).toBe(1);
    expect(vli.get_vli_byte_length(7)).toBe(1);
    expect(vli.get_vli_byte_length(64)).toBe(1);
    expect(vli.get_vli_byte_length(127)).toBe(1);
});

test('VLI encoding length 2 checks', () => {
    expect(vli.get_vli_byte_length(128)).toBe(2);
    expect(vli.get_vli_byte_length(129)).toBe(2);
    expect(vli.get_vli_byte_length(256)).toBe(2);
    expect(vli.get_vli_byte_length(128 * 128 - 1)).toBe(2);
});

test('VLI encoding length 3 checks', () => {
    expect(vli.get_vli_byte_length(128 * 128)).toBe(3);
    expect(vli.get_vli_byte_length(128 * 128 + 1)).toBe(3);
    expect(vli.get_vli_byte_length(65537)).toBe(3);
    expect(vli.get_vli_byte_length(128 * 128 * 128 - 1)).toBe(3);
});

test('VLI encoding length 4 checks', () => {
    expect(vli.get_vli_byte_length(128 * 128 * 128)).toBe(4);
    expect(vli.get_vli_byte_length(128 * 128 * 128 + 1)).toBe(4);
    expect(vli.get_vli_byte_length(128 * 128 * 128 * 64)).toBe(4);
    expect(vli.get_vli_byte_length(128 * 128 * 128 * 128 - 1)).toBe(4);
});

test('VLI encoding overflow checks', () => {
    expect(() => { vli.get_vli_byte_length(128 * 128 * 128 * 128)}).toThrow("Invalid VLI value");
    expect(() => { vli.get_vli_byte_length(128 * 128 * 128 * 128 + 1)}).toThrow("Invalid VLI value");
    expect(() => { vli.get_vli_byte_length(128 * 128 * 128 * 128 * 2)}).toThrow("Invalid VLI value");
});

test('VLI encoding 1 byte', () => {
    let buffer = new ArrayBuffer(4);
    let view1 = new DataView(buffer);

    let encode_result = vli.encode_vli(view1, 0);
    expect(encode_result.byteLength).toBe(3);
    expect(view1.getUint8(0)).toBe(0);

    encode_result = vli.encode_vli(view1, 1);
    expect(encode_result.byteLength).toBe(3);
    expect(view1.getUint8(0)).toBe(1);

    encode_result = vli.encode_vli(view1, 31);
    expect(encode_result.byteLength).toBe(3);
    expect(view1.getUint8(0)).toBe(31);

    encode_result = vli.encode_vli(view1, 127);
    expect(encode_result.byteLength).toBe(3);
    expect(view1.getUint8(0)).toBe(127);
});


test('VLI encoding 2 byte', () => {
    let buffer = new ArrayBuffer(4);
    let view1 = new DataView(buffer);

    let encode_result = vli.encode_vli(view1, 128);
    expect(encode_result.byteLength).toBe(2);
    expect(view1.getUint8(0)).toBe(128);
    expect(view1.getUint8(1)).toBe(1);

    encode_result = vli.encode_vli(view1, 129);
    expect(encode_result.byteLength).toBe(2);
    expect(view1.getUint8(0)).toBe(129);
    expect(view1.getUint8(1)).toBe(1);

    encode_result = vli.encode_vli(view1, 255);
    expect(encode_result.byteLength).toBe(2);
    expect(view1.getUint8(0)).toBe(255);
    expect(view1.getUint8(1)).toBe(1);

    encode_result = vli.encode_vli(view1, 256);
    expect(encode_result.byteLength).toBe(2);
    expect(view1.getUint8(0)).toBe(128);
    expect(view1.getUint8(1)).toBe(2);

    encode_result = vli.encode_vli(view1, 128 * 128 - 1);
    expect(encode_result.byteLength).toBe(2);
    expect(view1.getUint8(0)).toBe(255);
    expect(view1.getUint8(1)).toBe(127);
});

test('VLI encoding 3 byte', () => {
    let buffer = new ArrayBuffer(4);
    let view1 = new DataView(buffer);

    let encode_result = vli.encode_vli(view1, 128 * 128);
    expect(encode_result.byteLength).toBe(1);
    expect(view1.getUint8(0)).toBe(128);
    expect(view1.getUint8(1)).toBe(128);
    expect(view1.getUint8(2)).toBe(1);

    encode_result = vli.encode_vli(view1, 128 * 128 + 1);
    expect(encode_result.byteLength).toBe(1);
    expect(view1.getUint8(0)).toBe(129);
    expect(view1.getUint8(1)).toBe(128);
    expect(view1.getUint8(2)).toBe(1);

    encode_result = vli.encode_vli(view1, 128 * 128 + 127);
    expect(encode_result.byteLength).toBe(1);
    expect(view1.getUint8(0)).toBe(255);
    expect(view1.getUint8(1)).toBe(128);
    expect(view1.getUint8(2)).toBe(1);

    encode_result = vli.encode_vli(view1, 128 * 129);
    expect(encode_result.byteLength).toBe(1);
    expect(view1.getUint8(0)).toBe(128);
    expect(view1.getUint8(1)).toBe(129);
    expect(view1.getUint8(2)).toBe(1);

    encode_result = vli.encode_vli(view1, 128 * 128 * 128 - 1);
    expect(encode_result.byteLength).toBe(1);
    expect(view1.getUint8(0)).toBe(255);
    expect(view1.getUint8(1)).toBe(255);
    expect(view1.getUint8(2)).toBe(127);
});

test('VLI encoding 4 byte', () => {
    let buffer = new ArrayBuffer(4);
    let view1 = new DataView(buffer);

    let encode_result = vli.encode_vli(view1, 128 * 128 * 128);
    expect(encode_result.byteLength).toBe(0);
    expect(view1.getUint8(0)).toBe(128);
    expect(view1.getUint8(1)).toBe(128);
    expect(view1.getUint8(2)).toBe(128);
    expect(view1.getUint8(3)).toBe(1);

    encode_result = vli.encode_vli(view1, 128 * 128 * 128 + 1);
    expect(encode_result.byteLength).toBe(0);
    expect(view1.getUint8(0)).toBe(129);
    expect(view1.getUint8(1)).toBe(128);
    expect(view1.getUint8(2)).toBe(128);
    expect(view1.getUint8(3)).toBe(1);

    encode_result = vli.encode_vli(view1, 128 * 128 * 128 * 128 - 1);
    expect(encode_result.byteLength).toBe(0);
    expect(view1.getUint8(0)).toBe(255);
    expect(view1.getUint8(1)).toBe(255);
    expect(view1.getUint8(2)).toBe(255);
    expect(view1.getUint8(3)).toBe(127);
});

test('VLI encoding overflow', () => {
    let buffer = new ArrayBuffer(5);
    let view1 = new DataView(buffer);

    expect(() => { vli.encode_vli(view1, 128 * 128 * 128 * 128) }).toThrow("Invalid VLI value");
});


test('VLI decoding - 1 byte', () => {
    let buffer_0 = new Uint8Array([0]);
    expect(vli.decode_vli(new DataView(buffer_0.buffer), 0).value).toBe(0);

    let buffer_1 = new Uint8Array([1]);
    expect(vli.decode_vli(new DataView(buffer_1.buffer), 0).value).toBe(1);

    let buffer_63 = new Uint8Array([63]);
    expect(vli.decode_vli(new DataView(buffer_63.buffer), 0).value).toBe(63);

    let buffer_127 = new Uint8Array([127]);
    expect(vli.decode_vli(new DataView(buffer_127.buffer), 0).value).toBe(127);
});

test('VLI decoding - 2 byte', () => {
    let buffer_128 = new Uint8Array([128, 1]);
    expect(vli.decode_vli(new DataView(buffer_128.buffer), 0).value).toBe(128);

    let buffer_129 = new Uint8Array([129, 1]);
    expect(vli.decode_vli(new DataView(buffer_129.buffer), 0).value).toBe(129);

    let buffer_255 = new Uint8Array([255, 1]);
    expect(vli.decode_vli(new DataView(buffer_255.buffer), 0).value).toBe(255);

    let buffer_256 = new Uint8Array([128, 2]);
    expect(vli.decode_vli(new DataView(buffer_256.buffer), 0).value).toBe(256);

    let buffer_1025 = new Uint8Array([129, 8]);
    expect(vli.decode_vli(new DataView(buffer_1025.buffer), 0).value).toBe(1025);

    let buffer_16382 = new Uint8Array([254, 127]);
    expect(vli.decode_vli(new DataView(buffer_16382.buffer), 0).value).toBe(16382);
});

test('VLI decoding - 3 byte', () => {
    let buffer1 = new Uint8Array([128, 128, 1]);
    expect(vli.decode_vli(new DataView(buffer1.buffer), 0).value).toBe(128 * 128);

    let buffer2 = new Uint8Array([129, 128, 1]);
    expect(vli.decode_vli(new DataView(buffer2.buffer), 0).value).toBe(128 * 128 + 1);

    let buffer3 = new Uint8Array([255, 128, 1]);
    expect(vli.decode_vli(new DataView(buffer3.buffer), 0).value).toBe(128 * 128 + 127);

    let buffer4 = new Uint8Array([128, 128, 2]);
    expect(vli.decode_vli(new DataView(buffer4.buffer), 0).value).toBe(128 * 128 * 2);

    let buffer5 = new Uint8Array([255, 255, 127]);
    expect(vli.decode_vli(new DataView(buffer5.buffer), 0).value).toBe(128 * 128 * 128 - 1);
});

test('VLI decoding - 4 byte', () => {
    let buffer1 = new Uint8Array([128, 128, 128, 1]);
    expect(vli.decode_vli(new DataView(buffer1.buffer), 0).value).toBe(128 * 128 * 128);

    let buffer2 = new Uint8Array([129, 128, 128, 1]);
    expect(vli.decode_vli(new DataView(buffer2.buffer), 0).value).toBe(128 * 128 * 128 + 1);

    let buffer5 = new Uint8Array([255, 255, 255, 127]);
    expect(vli.decode_vli(new DataView(buffer5.buffer), 0).value).toBe(128 * 128 * 128 * 128 - 1);
});

function do_round_trip_encode_decode_vli_test(value: number) {
    let buffer = new ArrayBuffer(4);

    let encode_result = vli.encode_vli(new DataView(buffer), value);
    let encoded_view = new DataView(buffer, 0, buffer.byteLength - encode_result.byteLength);

    expect(vli.decode_vli(encoded_view, 0).value).toBe(value);
}

test('VLI round trip', () => {
    do_round_trip_encode_decode_vli_test(0);
    do_round_trip_encode_decode_vli_test(37);
    do_round_trip_encode_decode_vli_test(199);
    do_round_trip_encode_decode_vli_test(581);
    do_round_trip_encode_decode_vli_test(3700);
    do_round_trip_encode_decode_vli_test(31502);
    do_round_trip_encode_decode_vli_test(278306);
    do_round_trip_encode_decode_vli_test(26843545);
});