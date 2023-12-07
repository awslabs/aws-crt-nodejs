/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

export const conditional_test = (condition: boolean) => condition ? it : it.skip;

export class AWS_IOT_ENV {

    // ====================
    // MQTT5
    // ====================

    public static MQTT5_HOST = process.env.AWS_TEST_MQTT5_IOT_CORE_HOST ?? "";
    public static MQTT5_REGION = process.env.AWS_TEST_MQTT5_IOT_CORE_REGION ?? "";

    public static MQTT5_RSA_CERT = process.env.AWS_TEST_MQTT5_IOT_CORE_RSA_CERT ?? "";
    public static MQTT5_RSA_KEY = process.env.AWS_TEST_MQTT5_IOT_CORE_RSA_KEY ?? "";

    public static MQTT5_CUSTOM_AUTH_UNSIGNED_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_NAME ?? "";
    public static MQTT5_CUSTOM_AUTH_UNSIGNED_USERNAME = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static MQTT5_CUSTOM_AUTH_UNSIGNED_PASSWORD = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_PASSWORD ?? "";

    public static MQTT5_CUSTOM_AUTH_SIGNED_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_NAME ?? "";
    public static MQTT5_CUSTOM_AUTH_SIGNED_USERNAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static MQTT5_CUSTOM_AUTH_SIGNED_PASSWORD = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_PASSWORD ?? "";
    public static MQTT5_CUSTOM_AUTH_SIGNED_TOKEN = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN ?? "";
    public static MQTT5_CUSTOM_AUTH_SIGNED_KEY_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_KEY_NAME ?? "";
    public static MQTT5_CUSTOM_AUTH_SIGNED_SIGNATURE = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_SIGNATURE ?? "";
    public static MQTT5_CUSTOM_AUTH_SIGNED_SIGNATURE_UNENCODED = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_SIGNATURE_UNENCODED ?? "";

    public static MQTT5_PKCS11_LIB_PATH = process.env.AWS_TEST_PKCS11_LIB ?? "";
    public static MQTT5_PKCS11_TOKEN_LABEL = process.env.AWS_TEST_PKCS11_TOKEN_LABEL ?? "";
    public static MQTT5_PKCS11_PIN = process.env.AWS_TEST_PKCS11_PIN ?? "";
    public static MQTT5_PKCS11_PRIVATE_KEY_LABEL = process.env.AWS_TEST_PKCS11_PKEY_LABEL ?? "";
    public static MQTT5_PKCS11_CERT = process.env.AWS_TEST_PKCS11_CERT_FILE ?? "";

    public static MQTT5_PKCS12_FILE = process.env.AWS_TEST_MQTT5_IOT_CORE_PKCS12_KEY ?? "";
    public static MQTT5_PKCS12_PASSWORD = process.env.AWS_TEST_MQTT5_IOT_CORE_PKCS12_KEY_PASSWORD ?? "";

    public static MQTT5_WINDOWS_CERT = process.env.AWS_TEST_MQTT5_IOT_CORE_WINDOWS_CERT_STORE ?? "";

    public static MQTT5_CRED_ACCESS_KEY = process.env.AWS_TEST_MQTT5_ROLE_CREDENTIAL_ACCESS_KEY ?? "";
    public static MQTT5_CRED_SECRET_ACCESS_KEY = process.env.AWS_TEST_MQTT5_ROLE_CREDENTIAL_SECRET_ACCESS_KEY ?? "";
    public static MQTT5_CRED_SESSION_TOKEN = process.env.AWS_TEST_MQTT5_ROLE_CREDENTIAL_SESSION_TOKEN ?? "";

    public static MQTT5_COGNITO_IDENTITY = process.env.AWS_TEST_MQTT5_COGNITO_IDENTITY ?? "";
    public static MQTT5_COGNITO_ENDPOINT = process.env.AWS_TEST_MQTT5_COGNITO_ENDPOINT ?? "";

    public static MQTT5_X509_ENDPOINT = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_ENDPOINT ?? "";
    public static MQTT5_X509_CA = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_CA ?? "";
    public static MQTT5_X509_CERT = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_CERT ?? "";
    public static MQTT5_X509_KEY = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_KEY ?? "";
    public static MQTT5_X509_ROLE_ALIAS = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_ROLE_ALIAS ?? "";
    public static MQTT5_X509_THING_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_THING_NAME ?? "";

    public static mqtt5_is_valid_mtls_rsa() {
        return AWS_IOT_ENV.MQTT5_HOST !== "" &&
            AWS_IOT_ENV.MQTT5_RSA_CERT !== "" &&
            AWS_IOT_ENV.MQTT5_RSA_KEY !== "";
    }

    public static mqtt5_is_valid_custom_auth_unsigned() {
        return AWS_IOT_ENV.MQTT5_HOST !== "" &&
            AWS_IOT_ENV.MQTT5_CUSTOM_AUTH_UNSIGNED_NAME !== "" &&
            AWS_IOT_ENV.MQTT5_CUSTOM_AUTH_UNSIGNED_USERNAME !== "" &&
            AWS_IOT_ENV.MQTT5_CUSTOM_AUTH_UNSIGNED_PASSWORD !== "";
    }

    public static mqtt5_is_valid_custom_auth_signed() {
        return AWS_IOT_ENV.MQTT5_HOST !== "" &&
            AWS_IOT_ENV.MQTT5_CUSTOM_AUTH_SIGNED_NAME !== "" &&
            AWS_IOT_ENV.MQTT5_CUSTOM_AUTH_SIGNED_USERNAME !== "" &&
            AWS_IOT_ENV.MQTT5_CUSTOM_AUTH_SIGNED_PASSWORD !== "" &&
            AWS_IOT_ENV.MQTT5_CUSTOM_AUTH_SIGNED_TOKEN !== "" &&
            AWS_IOT_ENV.MQTT5_CUSTOM_AUTH_SIGNED_KEY_NAME !== "" &&
            AWS_IOT_ENV.MQTT5_CUSTOM_AUTH_SIGNED_SIGNATURE !== "";
    }

    public static mqtt5_is_valid_pkcs11() {
        return AWS_IOT_ENV.MQTT5_HOST !== "" &&
            AWS_IOT_ENV.MQTT5_PKCS11_LIB_PATH !== "" &&
            AWS_IOT_ENV.MQTT5_PKCS11_TOKEN_LABEL !== "" &&
            AWS_IOT_ENV.MQTT5_PKCS11_PIN !== "" &&
            AWS_IOT_ENV.MQTT5_PKCS11_PRIVATE_KEY_LABEL !== "" &&
            AWS_IOT_ENV.MQTT5_PKCS11_CERT !== "";
    }

    public static mqtt5_is_valid_pkcs12() {
        return AWS_IOT_ENV.MQTT5_HOST !== "" &&
            AWS_IOT_ENV.MQTT5_PKCS12_FILE !== "" &&
            AWS_IOT_ENV.MQTT5_PKCS12_PASSWORD !== "";
    }

    public static mqtt5_is_valid_windows_cert() {
        return AWS_IOT_ENV.MQTT5_HOST !== "" &&
            AWS_IOT_ENV.MQTT5_WINDOWS_CERT !== "";
    }

    public static mqtt5_is_valid_websocket() {
        return AWS_IOT_ENV.MQTT5_HOST !== "" &&
            AWS_IOT_ENV.MQTT5_REGION !== "" &&
            AWS_IOT_ENV.AWS_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.AWS_SECRET_ACCESS_KEY !== ""
    }

    public static mqtt5_is_valid_cred() {
        return AWS_IOT_ENV.MQTT5_HOST !== "" &&
            AWS_IOT_ENV.MQTT5_REGION !== "" &&
            AWS_IOT_ENV.MQTT5_CRED_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.MQTT5_CRED_SECRET_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.MQTT5_CRED_SESSION_TOKEN !== "";
    }

    public static mqtt5_is_valid_cognito() {
        return AWS_IOT_ENV.MQTT5_HOST !== "" &&
            AWS_IOT_ENV.MQTT5_COGNITO_ENDPOINT !== "" &&
            AWS_IOT_ENV.MQTT5_COGNITO_IDENTITY !== "";
    }

    public static mqtt5_is_valid_x509() {
        return AWS_IOT_ENV.MQTT5_HOST !== "" &&
            AWS_IOT_ENV.MQTT5_X509_ENDPOINT !== "" &&
            AWS_IOT_ENV.MQTT5_X509_CA !== "" &&
            AWS_IOT_ENV.MQTT5_X509_CERT !== "" &&
            AWS_IOT_ENV.MQTT5_X509_KEY !== "" &&
            AWS_IOT_ENV.MQTT5_X509_ROLE_ALIAS !== "" &&
            AWS_IOT_ENV.MQTT5_X509_THING_NAME !== "";
    }

    // ====================
    // MQTT311
    // ====================

    public static MQTT311_HOST = process.env.AWS_TEST_MQTT311_IOT_CORE_HOST ?? "";
    public static MQTT311_REGION = process.env.AWS_TEST_MQTT311_IOT_CORE_REGION ?? "";

    public static MQTT311_CUSTOM_AUTH_UNSIGNED_NAME = process.env.AWS_TEST_MQTT311_IOT_CORE_NO_SIGNING_AUTHORIZER_NAME ?? "";
    public static MQTT311_CUSTOM_AUTH_UNSIGNED_USERNAME = process.env.AWS_TEST_MQTT311_IOT_CORE_NO_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static MQTT311_CUSTOM_AUTH_UNSIGNED_PASSWORD = process.env.AWS_TEST_MQTT311_IOT_CORE_NO_SIGNING_AUTHORIZER_PASSWORD ?? "";

    public static MQTT311_CUSTOM_AUTH_SIGNED_NAME = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_NAME ?? "";
    public static MQTT311_CUSTOM_AUTH_SIGNED_USERNAME = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static MQTT311_CUSTOM_AUTH_SIGNED_PASSWORD = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_PASSWORD ?? "";
    public static MQTT311_CUSTOM_AUTH_SIGNED_TOKEN = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_TOKEN ?? "";
    public static MQTT311_CUSTOM_AUTH_SIGNED_KEY_NAME = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_KEY_NAME ?? "";
    public static MQTT311_CUSTOM_AUTH_SIGNED_SIGNATURE = process.env.AWS_TEST_MQTT311_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_SIGNATURE ?? "";

    public static MQTT311_PKCS11_LIB_PATH = process.env.AWS_TEST_PKCS11_LIB ?? "";
    public static MQTT311_PKCS11_TOKEN_LABEL = process.env.AWS_TEST_PKCS11_TOKEN_LABEL ?? "";
    public static MQTT311_PKCS11_PIN = process.env.AWS_TEST_PKCS11_PIN ?? "";
    public static MQTT311_PKCS11_PRIVATE_KEY_LABEL = process.env.AWS_TEST_PKCS11_PKEY_LABEL ?? "";
    public static MQTT311_PKCS11_CERT = process.env.AWS_TEST_PKCS11_CERT_FILE ?? "";

    public static MQTT311_PKCS12_FILE = process.env.AWS_TEST_MQTT311_IOT_CORE_PKCS12_KEY ?? "";
    public static MQTT311_PKCS12_PASSWORD = process.env.AWS_TEST_MQTT311_IOT_CORE_PKCS12_KEY_PASSWORD ?? "";

    public static MQTT311_WINDOWS_CERT = process.env.AWS_TEST_MQTT311_IOT_CORE_WINDOWS_CERT_STORE ?? "";

    public static MQTT311_CRED_ACCESS_KEY = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_ACCESS_KEY ?? "";
    public static MQTT311_CRED_SECRET_ACCESS_KEY = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_SECRET_ACCESS_KEY ?? "";
    public static MQTT311_CRED_SESSION_TOKEN = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_SESSION_TOKEN ?? "";

    public static MQTT311_COGNITO_IDENTITY = process.env.AWS_TEST_MQTT311_COGNITO_IDENTITY ?? "";
    public static MQTT311_COGNITO_ENDPOINT = process.env.AWS_TEST_MQTT311_COGNITO_ENDPOINT ?? "";

    public static MQTT311_X509_ENDPOINT = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_ENDPOINT ?? "";
    public static MQTT311_X509_CA = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_CA ?? "";
    public static MQTT311_X509_CERT = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_CERT ?? "";
    public static MQTT311_X509_KEY = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_KEY ?? "";
    public static MQTT311_X509_ROLE_ALIAS = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_ROLE_ALIAS ?? "";
    public static MQTT311_X509_THING_NAME = process.env.AWS_TEST_MQTT311_IOT_CORE_X509_THING_NAME ?? "";

    public static MQTT311_IOT_MQTT_HOST = process.env.AWS_TEST_MQTT311_IOT_CORE_HOST ?? "";
    public static MQTT311_IOT_MQTT_RSA_CERT = process.env.AWS_TEST_MQTT311_IOT_CORE_RSA_CERT ?? "";
    public static MQTT311_IOT_MQTT_RSA_KEY = process.env.AWS_TEST_MQTT311_IOT_CORE_RSA_KEY ?? "";
    public static MQTT311_IOT_MQTT_ECC_CERT = process.env.AWS_TEST_MQTT311_IOT_CORE_ECC_CERT ?? "";
    public static MQTT311_IOT_MQTT_ECC_KEY = process.env.AWS_TEST_MQTT311_IOT_CORE_ECC_KEY ?? "";
    public static MQTT311_IOT_MQTT_REGION = process.env.AWS_TEST_MQTT311_IOT_CORE_REGION ?? "";

    public static MQTT311_IOT_CRED_ACCESS_KEY = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_ACCESS_KEY ?? "";
    public static MQTT311_IOT_CRED_SECRET_ACCESS_KEY = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_SECRET_ACCESS_KEY ?? "";
    public static MQTT311_IOT_CRED_SESSION_TOKEN = process.env.AWS_TEST_MQTT311_ROLE_CREDENTIAL_SESSION_TOKEN ?? "";

    public static MQTT311_DIRECT_MQTT_HOST = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_HOST ?? "";
    public static MQTT311_DIRECT_MQTT_PORT = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_PORT ?? "";
    public static MQTT311_DIRECT_AUTH_MQTT_HOST = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_BASIC_AUTH_HOST ?? "";
    public static MQTT311_DIRECT_AUTH_MQTT_PORT = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_BASIC_AUTH_PORT ?? "";
    public static MQTT311_DIRECT_TLS_MQTT_HOST = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_TLS_HOST ?? "";
    public static MQTT311_DIRECT_TLS_MQTT_PORT = process.env.AWS_TEST_MQTT311_DIRECT_MQTT_TLS_PORT ?? "";

    public static MQTT311_WS_MQTT_HOST = process.env.AWS_TEST_MQTT311_WS_MQTT_HOST ?? "";
    public static MQTT311_WS_MQTT_PORT = process.env.AWS_TEST_MQTT311_WS_MQTT_PORT ?? "";
    public static MQTT311_WS_AUTH_MQTT_HOST = process.env.AWS_TEST_MQTT311_WS_MQTT_BASIC_AUTH_HOST ?? "";
    public static MQTT311_WS_AUTH_MQTT_PORT = process.env.AWS_TEST_MQTT311_WS_MQTT_BASIC_AUTH_PORT ?? "";
    public static MQTT311_WS_TLS_MQTT_HOST = process.env.AWS_TEST_MQTT311_WS_MQTT_TLS_HOST ?? "";
    public static MQTT311_WS_TLS_MQTT_PORT = process.env.AWS_TEST_MQTT311_WS_MQTT_TLS_PORT ?? "";

    public static MQTT311_BASIC_AUTH_USERNAME = process.env.AWS_TEST_MQTT311_BASIC_AUTH_USERNAME ?? "";
    public static MQTT311_BASIC_AUTH_PASSWORD = process.env.AWS_TEST_MQTT311_BASIC_AUTH_PASSWORD ?? "";
    public static MQTT311_PROXY_HOST = process.env.AWS_TEST_MQTT311_PROXY_HOST ?? "";
    public static MQTT311_PROXY_PORT = process.env.AWS_TEST_MQTT311_PROXY_PORT ?? "";

    public static mqtt311_is_valid_custom_auth_unsigned() {
        return AWS_IOT_ENV.MQTT311_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_CUSTOM_AUTH_UNSIGNED_NAME !== "" &&
            AWS_IOT_ENV.MQTT311_CUSTOM_AUTH_UNSIGNED_USERNAME !== "" &&
            AWS_IOT_ENV.MQTT311_CUSTOM_AUTH_UNSIGNED_PASSWORD !== "";
    }

    public static mqtt311_is_valid_custom_auth_signed() {
        return AWS_IOT_ENV.MQTT311_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_CUSTOM_AUTH_SIGNED_NAME !== "" &&
            AWS_IOT_ENV.MQTT311_CUSTOM_AUTH_SIGNED_USERNAME !== "" &&
            AWS_IOT_ENV.MQTT311_CUSTOM_AUTH_SIGNED_PASSWORD !== "" &&
            AWS_IOT_ENV.MQTT311_CUSTOM_AUTH_SIGNED_TOKEN !== "" &&
            AWS_IOT_ENV.MQTT311_CUSTOM_AUTH_SIGNED_KEY_NAME !== "" &&
            AWS_IOT_ENV.MQTT311_CUSTOM_AUTH_SIGNED_SIGNATURE !== "";
    }

    public static mqtt311_is_valid_pkcs11() {
        return AWS_IOT_ENV.MQTT311_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_PKCS11_LIB_PATH !== "" &&
            AWS_IOT_ENV.MQTT311_PKCS11_TOKEN_LABEL !== "" &&
            AWS_IOT_ENV.MQTT311_PKCS11_PIN !== "" &&
            AWS_IOT_ENV.MQTT311_PKCS11_PRIVATE_KEY_LABEL !== "" &&
            AWS_IOT_ENV.MQTT311_PKCS11_CERT !== "";
    }

    public static mqtt311_is_valid_pkcs12() {
        return AWS_IOT_ENV.MQTT311_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_PKCS12_FILE !== "" &&
            AWS_IOT_ENV.MQTT311_PKCS12_PASSWORD !== "";
    }

    public static mqtt311_is_valid_windows_cert() {
        return AWS_IOT_ENV.MQTT311_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_WINDOWS_CERT !== "";
    }

    public static mqtt311_is_valid_websocket() {
        return AWS_IOT_ENV.MQTT311_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_REGION !== "" &&
            AWS_IOT_ENV.AWS_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.AWS_SECRET_ACCESS_KEY !== ""
    }

    public static mqtt311_is_valid_cred() {
        return AWS_IOT_ENV.MQTT311_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_REGION !== "" &&
            AWS_IOT_ENV.MQTT311_CRED_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.MQTT311_CRED_SECRET_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.MQTT311_CRED_SESSION_TOKEN !== "";
    }

    public static mqtt311_is_valid_cognito() {
        return AWS_IOT_ENV.MQTT311_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_COGNITO_ENDPOINT !== "" &&
            AWS_IOT_ENV.MQTT311_COGNITO_IDENTITY !== "";
    }

    public static mqtt311_is_valid_x509() {
        return AWS_IOT_ENV.MQTT311_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_X509_ENDPOINT !== "" &&
            AWS_IOT_ENV.MQTT311_X509_CA !== "" &&
            AWS_IOT_ENV.MQTT311_X509_CERT !== "" &&
            AWS_IOT_ENV.MQTT311_X509_KEY !== "" &&
            AWS_IOT_ENV.MQTT311_X509_ROLE_ALIAS !== "" &&
            AWS_IOT_ENV.MQTT311_X509_THING_NAME !== "";
    }

    public static mqtt311_is_valid_direct_mqtt() {
        return AWS_IOT_ENV.MQTT311_DIRECT_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_DIRECT_AUTH_MQTT_PORT !== "";
    }
    public static mqtt311_is_valid_direct_auth_mqtt() {
        return AWS_IOT_ENV.MQTT311_DIRECT_AUTH_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_DIRECT_AUTH_MQTT_PORT !== "" &&
            AWS_IOT_ENV.MQTT311_BASIC_AUTH_USERNAME !== "" &&
            AWS_IOT_ENV.MQTT311_BASIC_AUTH_PASSWORD !== "";
    }
    public static mqtt311_is_valid_direct_tls_mqtt() {
        return AWS_IOT_ENV.MQTT311_DIRECT_TLS_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_DIRECT_TLS_MQTT_PORT !== "";
    }
    public static mqtt311_is_valid_direct_proxy() {
        return AWS_IOT_ENV.MQTT311_DIRECT_TLS_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_DIRECT_TLS_MQTT_PORT !== "" &&
            AWS_IOT_ENV.MQTT311_PROXY_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_PROXY_PORT !== "";
    }
    public static mqtt311_is_valid_ws_mqtt() {
        return AWS_IOT_ENV.MQTT311_WS_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_WS_MQTT_PORT !== "";
    }
    public static mqtt311_is_valid_ws_auth_mqtt() {
        return AWS_IOT_ENV.MQTT311_WS_AUTH_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_WS_AUTH_MQTT_PORT !== "" &&
            AWS_IOT_ENV.MQTT311_BASIC_AUTH_USERNAME !== "" &&
            AWS_IOT_ENV.MQTT311_BASIC_AUTH_PASSWORD !== "";
    }
    public static mqtt311_is_valid_ws_tls_mqtt() {
        return AWS_IOT_ENV.MQTT311_WS_TLS_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_WS_TLS_MQTT_PORT !== "";
    }
    public static mqtt311_is_valid_ws_proxy() {
        return AWS_IOT_ENV.MQTT311_WS_TLS_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_WS_TLS_MQTT_PORT !== "" &&
            AWS_IOT_ENV.MQTT311_PROXY_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_PROXY_PORT !== "";
    }

    public static mqtt311_is_valid_iot_rsa() {
        return AWS_IOT_ENV.MQTT311_IOT_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_IOT_MQTT_RSA_CERT !== "" &&
            AWS_IOT_ENV.MQTT311_IOT_MQTT_RSA_KEY !== "";
    }
    public static mqtt311_is_valid_iot_ecc() {
        return AWS_IOT_ENV.MQTT311_IOT_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_IOT_MQTT_ECC_CERT !== "" &&
            AWS_IOT_ENV.MQTT311_IOT_MQTT_ECC_KEY !== "";
    }
    public static mqtt311_is_valid_iot_websocket() {
        return AWS_IOT_ENV.MQTT311_IOT_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_IOT_MQTT_REGION !== "";
    }

    public static mqtt311_is_valid_iot_cred() {
        return AWS_IOT_ENV.MQTT311_IOT_MQTT_HOST !== "" &&
            AWS_IOT_ENV.MQTT311_IOT_MQTT_REGION !== "" &&
            AWS_IOT_ENV.MQTT311_IOT_MQTT_RSA_CERT !== "" &&
            AWS_IOT_ENV.MQTT311_IOT_MQTT_RSA_KEY !== "" &&
            AWS_IOT_ENV.MQTT311_IOT_CRED_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.MQTT311_IOT_CRED_SECRET_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.MQTT311_IOT_CRED_SESSION_TOKEN !== "";
    }

    // ====================
    // Misc
    // ====================

    public static AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID ?? "";
    public static AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? "";

}
