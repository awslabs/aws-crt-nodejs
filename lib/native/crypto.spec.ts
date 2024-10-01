/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as native from './crypto';
import * as browser from '../browser/crypto';

import {expect} from '@jest/globals';
import type {MatcherFunction} from 'expect';

/*
 * Note: jest by default does not compare contents of complex classes like DataView.
 * So when comparing two dataviews for equality we equality we always end up with true result because
 * the only thing compared is the type of the instance.
 * So add a custom comparison operation for it.
 * Its possible to make it global for all tests with some additional work. 
 * Jest 30 is adding DataView equivalence checks out of the box.
*/
const toEqualDataView: MatcherFunction<[expected: DataView]> =
  function (actual, expected) {
    let dv_actual = actual as DataView;
    let dv_expected = expected as DataView;

    if (dv_actual.buffer.byteLength !== dv_expected.buffer.byteLength) {
        return {
            message: () => 'DataViews of different length; actual: ${dv1.buffer.byteLength}, expected: ${dv2.buffer.byteLength}',
            pass: false
        };
    }

    for (let i = 0; i < dv_actual.buffer.byteLength; i++) {
        if (dv_actual.getUint8(i) !== dv_expected.getUint8(i)) {
            return {
                message: () => 'DataViews byte mismatch at index ${i}; actual: ${dv_actual.getUint8(i)}, expected: ${dv_expected.getUint8(i)}',
                pass: false
            };
        }
    }

    return {
        message: () => 'DataViews are equal',
        pass: true
    };
  };

expect.extend({
    toEqualDataView,
});

declare module 'expect' {
  interface Matchers<R> {
    toEqualDataView(expected: DataView): R;
  }
}

test('md5 multi-part matches', () => {
    const parts = ['ABC', '123', 'XYZ'];
    const native_md5 = new native.Md5Hash();
    const browser_md5 = new browser.Md5Hash();
    parts.forEach(part => {
        native_md5.update(part);
        browser_md5.update(part);
    });
    const native_hash = native_md5.finalize();
    const browser_hash = browser_md5.finalize();

    expect(native_hash).toEqualDataView(browser_hash);
});

test('md5 one-shot matches', () => {
    const data = 'ABC123XYZ';
    const native_hash = native.hash_md5(data);
    const browser_hash = browser.hash_md5(data);

    expect(native_hash).toEqualDataView(browser_hash);
});

test('SHA256 multi-part matches', () => {
    const parts = ['ABC', '123', 'XYZ'];
    const native_sha = new native.Sha256Hash();
    const browser_sha = new browser.Sha256Hash();
    parts.forEach(part => {
        native_sha.update(part);
        browser_sha.update(part);
    });
    const native_hash = native_sha.finalize();
    const browser_hash = browser_sha.finalize();

    expect(native_hash).toEqualDataView(browser_hash);
});

test('SHA256 one-shot matches', () => {
    const data = 'ABC123XYZ';
    const native_hash = native.hash_sha256(data);
    const browser_hash = browser.hash_sha256(data);
    
    expect(native_hash).toEqualDataView(browser_hash);
});

test('SHA1 multi-part matches', () => {
    const parts = ['ABC', '123', 'XYZ'];
    const native_sha = new native.Sha1Hash();
    const browser_sha = new browser.Sha1Hash();
    parts.forEach(part => {
        native_sha.update(part);
        browser_sha.update(part);
    });
    const native_hash = native_sha.finalize();
    const browser_hash = browser_sha.finalize();

    expect(native_hash).toEqualDataView(browser_hash);
});

test('SHA1 one-shot matches', () => {
    const data = 'ABC123XYZ';
    const native_hash = native.hash_sha1(data);
    const browser_hash = browser.hash_sha1(data);

    expect(native_hash).toEqualDataView(browser_hash);
});

test('hmac-256 multi-part matches', () => {
    const secret = 'TEST';
    const parts = ['ABC', '123', 'XYZ'];
    const native_hmac = new native.Sha256Hmac(secret);
    const browser_hmac = new browser.Sha256Hmac(secret);
    parts.forEach(part => {
        native_hmac.update(part);
        browser_hmac.update(part);
    });
    const native_hash = native_hmac.finalize();
    const browser_hash = browser_hmac.finalize();

    expect(native_hash).toEqualDataView(browser_hash);
});

test('hmac-256 one-shot matches', () => {
    const secret = 'TEST';
    const data = 'ABC123XYZ';
    const native_hash = native.hmac_sha256(secret, data);
    const browser_hash = browser.hmac_sha256(secret, data);

    expect(native_hash).toEqualDataView(browser_hash);
});
