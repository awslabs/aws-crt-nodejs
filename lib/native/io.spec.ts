/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as io from './io';
import {Pkcs11Lib, TlsCipherPreference} from './io';
import {CrtError} from './error';
import {cRuntime, CRuntimeType} from "./binding";
import {platform} from 'os';
import * as aws_iot_mqtt311 from "./aws_iot";
import {v4 as uuid} from "uuid";
import * as mqtt311 from "./mqtt";

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
/**
 * Skip test if cruntime is Musl. Softhsm library crashes on Alpine if we don't use AWS_PKCS11_LIB_STRICT_INITIALIZE_FINALIZE.
 * Supporting AWS_PKCS11_LIB_STRICT_INITIALIZE_FINALIZE on Node-js is not trivial due to non-deterministic cleanup.
 * TODO: Support AWS_PKCS11_LIB_STRICT_INITIALIZE_FINALIZE in tests
 */
const pkcs11_test = conditional_test(cRuntime !== CRuntimeType.MUSL && PKCS11_LIB_PATH)

pkcs11_test('Pkcs11Lib sanity check', () => {
    // sanity check that we can load and unload a PKCS#11 library
    new Pkcs11Lib(PKCS11_LIB_PATH);
});

pkcs11_test('Pkcs11Lib exception', () => {
    // check that initialization errors get thrown
    expect(() => {
        new Pkcs11Lib("obviously-invalid-path.so", Pkcs11Lib.InitializeFinalizeBehavior.STRICT);
    }).toThrow(/AWS_IO_SHARED_LIBRARY_LOAD_FAILURE/);
});

function do_successful_cipher_preference_test(tls_cipher_preference: TlsCipherPreference) {
    // verify successful support query
    expect(io.tls_cipher_preference_is_supported(tls_cipher_preference)).toBe(true);

    // verify successful tls context creation
    let tls_ctx_options = new io.TlsContextOptions();
    tls_ctx_options.tls_cipher_preference = tls_cipher_preference;

    let tls_ctx = new io.ClientTlsContext(tls_ctx_options);
    expect(tls_ctx).toBeDefined();
}

function do_unsuccessful_cipher_preference_test(tls_cipher_preference: TlsCipherPreference) {
    // verify failing support query
    expect(io.tls_cipher_preference_is_supported(tls_cipher_preference)).toBe(false);

    // verify unsuccessful tls context creation
    let tls_ctx_options = new io.TlsContextOptions();
    tls_ctx_options.tls_cipher_preference = tls_cipher_preference;

    expect(() => {
        new io.ClientTlsContext(tls_ctx_options);
    }).toThrow("AWS_IO_TLS_CIPHER_PREF_UNSUPPORTED");
}

function do_cipher_preference_test(tls_cipher_preference: TlsCipherPreference, should_be_successful: boolean) {
    if (should_be_successful) {
        do_successful_cipher_preference_test(tls_cipher_preference);
    } else {
        do_unsuccessful_cipher_preference_test(tls_cipher_preference);
    }
}

test("Supports default TlsCipherPreference", () => {
    do_cipher_preference_test(TlsCipherPreference.Default, true);
});

test("Per-Platform PQ default TlsCipherPreference", () => {
    do_cipher_preference_test(TlsCipherPreference.PQ_Default, platform() === "linux");
});

test("Per-Platform latest 1.2 policy TlsCipherPreference", () => {
    do_cipher_preference_test(TlsCipherPreference.TLSv1_2_2025_07, platform() === "linux");
});

