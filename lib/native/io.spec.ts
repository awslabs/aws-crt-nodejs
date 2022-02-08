/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as io from './io';
import { Pkcs11Lib } from './io';
import { CrtError } from './error';

const conditional_test = (condition: any) => condition ? it : it.skip;

test('Error Resolve', () => {
    const err = new CrtError(0);
    expect(err.error_code).toBe(0);
    expect(err.error_name).toBe('AWS_ERROR_SUCCESS');
    expect(err.message).toBe('aws-c-common: AWS_ERROR_SUCCESS, Success.');
});

test('ALPN availability', () => {
    expect(io.is_alpn_available()).toBeDefined();
});

const PKCS11_LIB_PATH = process.env.AWS_TEST_PKCS11_LIB ?? "";
const pkcs11_test = conditional_test(PKCS11_LIB_PATH)

pkcs11_test('Pkcs11Lib sanity check', () => {
    // sanity check that we can load and unload a PKCS#11 library
    let pkcs11_lib = new Pkcs11Lib(PKCS11_LIB_PATH, Pkcs11Lib.InitializeFinalizeBehavior.STRICT);

    pkcs11_lib.close(); /* close so it doesn't interfere with other tests */
    pkcs11_lib.close(); /* just asserting that it's safe to call close() multiple times */
});

pkcs11_test('Pkcs11Lib exception', () => {
    // check that initialization errors get thrown
    expect(() => {
        new Pkcs11Lib("obviously-invalid-path.so", Pkcs11Lib.InitializeFinalizeBehavior.STRICT);
    }).toThrow(/AWS_IO_SHARED_LIBRARY_LOAD_FAILURE/);
});

pkcs11_test('Pkcs11Lib.InitializeFinalizeBehavior.STRICT', () => {
    let pkcs11_lib = new Pkcs11Lib(PKCS11_LIB_PATH, Pkcs11Lib.InitializeFinalizeBehavior.STRICT);

    // InitializeFinalizeBehavior.STRICT behavior should fail if the PKCS#11 lib is already loaded
    expect(() => {
        new Pkcs11Lib(PKCS11_LIB_PATH, Pkcs11Lib.InitializeFinalizeBehavior.STRICT);
    }).toThrow(/CKR_CRYPTOKI_ALREADY_INITIALIZED/);

    pkcs11_lib.close(); /* close so it doesn't interfere with other tests */
});

pkcs11_test('Pkcs11Lib.InitializeFinalizeBehavior.OMIT', () => {
    // InitializeFinalizeBehavior.OMIT should fail unless another instance of the PKCS#11 lib is already loaded
    expect(() => {
        new Pkcs11Lib(PKCS11_LIB_PATH, Pkcs11Lib.InitializeFinalizeBehavior.OMIT);
    }).toThrow(/CKR_CRYPTOKI_NOT_INITIALIZED/);

    // InitializeFinalizeBehavior.OMIT behavior should be fine when another
    // instance of the PKCS#11 lib is already loaded
    let strict_lib = new Pkcs11Lib(PKCS11_LIB_PATH, Pkcs11Lib.InitializeFinalizeBehavior.STRICT);
    new Pkcs11Lib(PKCS11_LIB_PATH, Pkcs11Lib.InitializeFinalizeBehavior.OMIT);

    strict_lib.close(); /* close so it doesn't interfere with other tests */
});

// NOTE: we're not testing Pkcs11Lib.InitializeFinalizeBehavior.DEFAULT because it does not finalize
// the underlying PKCS#11 library, which may interfere with other tests
