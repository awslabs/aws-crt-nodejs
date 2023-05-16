/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as test_utils from "@test/mqtt5";
import * as mqtt5 from "./mqtt5";
import * as iot from "./iot";
import * as fs from 'fs';
import * as auth from "./auth";
import * as io from "./io";

jest.setTimeout(10000);

const conditional_test = (condition: boolean) => condition ? it : it.skip;

class AWS_IOT_ENV {
    public static HOST = process.env.AWS_TEST_MQTT5_IOT_CORE_HOST ?? "";
    public static REGION = process.env.AWS_TEST_MQTT5_IOT_CORE_REGION ?? "";

    public static RSA_CERT = process.env.AWS_TEST_MQTT5_IOT_CORE_RSA_CERT ?? "";
    public static RSA_KEY = process.env.AWS_TEST_MQTT5_IOT_CORE_RSA_KEY ?? "";

    public static CUSTOM_AUTH_UNSIGNED_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_NAME ?? "";
    public static CUSTOM_AUTH_UNSIGNED_USERNAME = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static CUSTOM_AUTH_UNSIGNED_PASSWORD = process.env.AWS_TEST_MQTT5_IOT_CORE_NO_SIGNING_AUTHORIZER_PASSWORD ?? "";

    public static CUSTOM_AUTH_SIGNED_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_NAME ?? "";
    public static CUSTOM_AUTH_SIGNED_USERNAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_USERNAME ?? "";
    public static CUSTOM_AUTH_SIGNED_PASSWORD = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_PASSWORD ?? "";
    public static CUSTOM_AUTH_SIGNED_TOKEN = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN ?? "";
    public static CUSTOM_AUTH_SIGNED_KEY_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_KEY_NAME ?? "";
    public static CUSTOM_AUTH_SIGNED_SIGNATURE = process.env.AWS_TEST_MQTT5_IOT_CORE_SIGNING_AUTHORIZER_TOKEN_SIGNATURE ?? "";

    public static PKCS11_LIB_PATH = process.env.AWS_TEST_PKCS11_LIB ?? "";
    public static PKCS11_TOKEN_LABEL = process.env.AWS_TEST_PKCS11_TOKEN_LABEL ?? "";
    public static PKCS11_PIN = process.env.AWS_TEST_PKCS11_PIN ?? "";
    public static PKCS11_PRIVATE_KEY_LABEL = process.env.AWS_TEST_PKCS11_PKEY_LABEL ?? "";
    public static PKCS11_CERT = process.env.AWS_TEST_PKCS11_CERT_FILE ?? "";

    public static PKCS12_FILE = process.env.AWS_TEST_MQTT5_IOT_CORE_PKCS12_KEY ?? "";
    public static PKCS12_PASSWORD = process.env.AWS_TEST_MQTT5_IOT_CORE_PKCS12_KEY_PASSWORD ?? "";

    public static WINDOWS_CERT = process.env.AWS_TEST_MQTT5_IOT_CORE_WINDOWS_CERT_STORE ?? "";

    public static CRED_ACCESS_KEY = process.env.AWS_TEST_MQTT5_ROLE_CREDENTIAL_ACCESS_KEY ?? "";
    public static CRED_SECRET_ACCESS_KEY = process.env.AWS_TEST_MQTT5_ROLE_CREDENTIAL_SECRET_ACCESS_KEY ?? "";
    public static CRED_SESSION_TOKEN = process.env.AWS_TEST_MQTT5_ROLE_CREDENTIAL_SESSION_TOKEN ?? "";

    public static AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID ?? "";
    public static AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? "";

    public static COGNITO_IDENTITY = process.env.AWS_TEST_MQTT5_COGNITO_IDENTITY ?? "";
    public static COGNITO_ENDPOINT = process.env.AWS_TEST_MQTT5_COGNITO_ENDPOINT ?? "";

    public static X509_ENDPOINT = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_ENDPOINT ?? "";
    public static X509_CA = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_CA ?? "";
    public static X509_CERT = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_CERT ?? "";
    public static X509_KEY = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_KEY ?? "";
    public static X509_ROLE_ALIAS = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_ROLE_ALIAS ?? "";
    public static X509_THING_NAME = process.env.AWS_TEST_MQTT5_IOT_CORE_X509_THING_NAME ?? "";

    public static is_valid_mtls_rsa() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.RSA_CERT !== "" &&
            AWS_IOT_ENV.RSA_KEY !== "";
    }

    public static is_valid_custom_auth_unsigned() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_PASSWORD !== "";
    }

    public static is_valid_custom_auth_signed() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME !== "" &&
            AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE !== "";
    }

    public static is_valid_pkcs11() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.PKCS11_LIB_PATH !== "" &&
            AWS_IOT_ENV.PKCS11_TOKEN_LABEL !== "" &&
            AWS_IOT_ENV.PKCS11_PIN !== "" &&
            AWS_IOT_ENV.PKCS11_PRIVATE_KEY_LABEL !== "" &&
            AWS_IOT_ENV.PKCS11_CERT !== "";
    }

    public static is_valid_pkcs12() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.PKCS12_FILE !== "" &&
            AWS_IOT_ENV.PKCS12_PASSWORD !== "";
    }

    public static is_valid_windows_cert() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.WINDOWS_CERT !== "";
    }

    public static is_valid_websocket() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.REGION !== "" &&
            AWS_IOT_ENV.AWS_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.AWS_SECRET_ACCESS_KEY !== ""
    }

    public static is_valid_cred() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.REGION !== "" &&
            AWS_IOT_ENV.CRED_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.CRED_SECRET_ACCESS_KEY !== "" &&
            AWS_IOT_ENV.CRED_SESSION_TOKEN !== "";
    }

    public static is_valid_cognito() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.COGNITO_ENDPOINT !== "" &&
            AWS_IOT_ENV.COGNITO_IDENTITY !== "";
    }

    public static is_valid_x509() {
        return AWS_IOT_ENV.HOST !== "" &&
            AWS_IOT_ENV.X509_ENDPOINT !== "" &&
            AWS_IOT_ENV.X509_CA !== "" &&
            AWS_IOT_ENV.X509_CERT !== "" &&
            AWS_IOT_ENV.X509_KEY !== "" &&
            AWS_IOT_ENV.X509_ROLE_ALIAS !== "" &&
            AWS_IOT_ENV.X509_THING_NAME !== "";
    }
}

conditional_test(AWS_IOT_ENV.is_valid_mtls_rsa())('Aws Iot Core Direct Mqtt By File - Connection Success', async () => {
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(
        AWS_IOT_ENV.HOST,
        AWS_IOT_ENV.RSA_CERT,
        AWS_IOT_ENV.RSA_KEY
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});


conditional_test(AWS_IOT_ENV.is_valid_mtls_rsa())('Aws Iot Core Direct Mqtt By In-Memory - Connection Success', async () => {
    let cert = fs.readFileSync(AWS_IOT_ENV.RSA_CERT,'utf8');
    let key = fs.readFileSync(AWS_IOT_ENV.RSA_KEY,'utf8');
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromMemory(
        AWS_IOT_ENV.HOST,
        cert,
        key
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_unsigned())('Aws Iot Core Direct Mqtt Non-Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME,
        username: AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME,
        password: Buffer.from(AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_PASSWORD, "utf-8")
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_signed())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        username: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        password: Buffer.from(AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD, "utf-8"),
        tokenKeyName: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        tokenValue: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN,
        tokenSignature: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_cred())('Aws Iot Core Websocket by Sigv4 - Connection Success', async () => {
    let provider: auth.AwsCredentialsProvider = auth.AwsCredentialsProvider.newStatic(
        AWS_IOT_ENV.CRED_ACCESS_KEY,
        AWS_IOT_ENV.CRED_SECRET_ACCESS_KEY,
        AWS_IOT_ENV.CRED_SESSION_TOKEN
    );
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        AWS_IOT_ENV.HOST,
        {
            credentialsProvider: provider
        }
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

// requires correct credentials to be sourced from the default credentials provider chain
conditional_test(AWS_IOT_ENV.is_valid_websocket())('Aws Iot Core Websocket Default Credentials - Connection Success', async () => {
    let provider: auth.AwsCredentialsProvider = auth.AwsCredentialsProvider.newDefault();
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        AWS_IOT_ENV.HOST,
        {
            credentialsProvider: provider
        }
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_cognito())('Aws Iot Core Websocket Cognito Credentials - Connection Success', async () => {
    let provider: auth.AwsCredentialsProvider = auth.AwsCredentialsProvider.newCognito(
        {
            identity: AWS_IOT_ENV.COGNITO_IDENTITY,
            endpoint: AWS_IOT_ENV.COGNITO_ENDPOINT
        }
    );
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        AWS_IOT_ENV.HOST,
        {
            credentialsProvider: provider
        }
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_x509())('Aws Iot Core Websocket X509 Credentials - Connection Success', async () => {
    let tls_ctx_options: io.TlsContextOptions = io.TlsContextOptions.create_client_with_mtls_from_path(
        AWS_IOT_ENV.X509_CERT,
        AWS_IOT_ENV.X509_KEY
    );
    let tls_ctx = new io.ClientTlsContext(tls_ctx_options);
    let provider: auth.AwsCredentialsProvider = auth.AwsCredentialsProvider.newX509(
        {
            endpoint: AWS_IOT_ENV.X509_ENDPOINT,
            thingName: AWS_IOT_ENV.X509_THING_NAME,
            roleAlias: AWS_IOT_ENV.X509_ROLE_ALIAS,
            tlsContext: tls_ctx
        }
    );
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
        AWS_IOT_ENV.HOST,
        {
            credentialsProvider: provider
        }
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_unsigned())('Aws Iot Core Direct Mqtt Non-Signing Custom Auth - Connection Failure Bad Password', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME,
        username: AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME,
        password: Buffer.from("Thisisnotthepassword", "utf-8")
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_signed())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Failure Bad Password', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        username: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        password: Buffer.from("Thisisnotthepassword", "utf-8"),
        tokenKeyName: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        tokenValue: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN,
        tokenSignature: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_signed())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Failure Bad Token Value', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        username: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        password: Buffer.from(AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD, "utf-8"),
        tokenKeyName: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        tokenValue: "ThisIsNotTheTokenValue",
        tokenSignature: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_signed())('Aws Iot Core Direct Mqtt Signing Custom Auth - Connection Failure Bad Token Signature', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        username: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        password: Buffer.from(AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD, "utf-8"),
        tokenKeyName: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        tokenValue: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN,
        tokenSignature: "ThisIsNotTheTokenSignature"
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithCustomAuth(
        AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testFailedConnection(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_unsigned())('Aws Iot Core Websocket Mqtt Non-Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_NAME,
        username: AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_USERNAME,
        password: Buffer.from(AWS_IOT_ENV.CUSTOM_AUTH_UNSIGNED_PASSWORD, "utf-8")
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithCustomAuth(
        AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_custom_auth_signed())('Aws Iot Core Websocket Mqtt Signing Custom Auth - Connection Success', async () => {
    let customAuthConfig : iot.MqttConnectCustomAuthConfig = {
        authorizerName: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_NAME,
        username: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_USERNAME,
        password: Buffer.from(AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_PASSWORD, "utf-8"),
        tokenKeyName: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_KEY_NAME,
        tokenValue: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_TOKEN,
        tokenSignature: AWS_IOT_ENV.CUSTOM_AUTH_SIGNED_SIGNATURE
    };
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithCustomAuth(
        AWS_IOT_ENV.HOST,
        customAuthConfig
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

// conditional_test(AWS_IOT_ENV.is_valid_pkcs11())('Aws Iot Core PKCS11 - Connection Success', async () => {
//     const pkcs11_lib = new io.Pkcs11Lib(AWS_IOT_ENV.PKCS11_LIB_PATH);
//     let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPkcs11(
//         AWS_IOT_ENV.HOST,
//         {
//             pkcs11_lib: pkcs11_lib,
//             user_pin: AWS_IOT_ENV.PKCS11_PIN,
//             token_label: AWS_IOT_ENV.PKCS11_TOKEN_LABEL,
//             private_key_object_label: AWS_IOT_ENV.PKCS11_PRIVATE_KEY_LABEL,
//             cert_file_path: AWS_IOT_ENV.PKCS11_CERT,
//         }
//     );
//     await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
// });

conditional_test(AWS_IOT_ENV.is_valid_pkcs12())('Aws Iot Core PKCS12 - Connection Success', async () => {
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPkcs12(
        AWS_IOT_ENV.HOST,
        {
            pkcs12_file : AWS_IOT_ENV.PKCS12_FILE,
            pkcs12_password : AWS_IOT_ENV.PKCS12_PASSWORD
        }
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

conditional_test(AWS_IOT_ENV.is_valid_windows_cert())('Aws Iot Core Window Cert - Connection Success', async () => {
    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromWindowsCertStorePath(
        AWS_IOT_ENV.HOST,
        AWS_IOT_ENV.WINDOWS_CERT
    );
    await test_utils.testConnect(new mqtt5.Mqtt5Client(builder.build()));
});

