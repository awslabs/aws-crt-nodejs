/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {HttpProxyAuthenticationType} from "../lib/common/http";
import {HttpProxyConnectionType, HttpProxyOptions} from "../lib/native/http";
import {ClientTlsContext, TlsConnectionOptions, TlsContextOptions} from "../lib/native/io";

export enum ProxyTestType {
    FORWARDING = 0,
    TUNNELING_HTTP = 1,
    TUNNELING_HTTPS = 2,
    TUNNELING_DOUBLE_TLS = 3,
    LEGACY_HTTP = 4,
    LEGACY_HTTPS = 5,
}

export class ProxyConfig {

    public static HTTP_PROXY_HOST = process.env.AWS_TEST_HTTP_PROXY_HOST ?? ""
    public static HTTP_PROXY_PORT = parseInt(process.env.AWS_TEST_HTTP_PROXY_PORT ?? "0")
    public static HTTPS_PROXY_HOST = process.env.AWS_TEST_HTTPS_PROXY_HOST ?? ""
    public static HTTPS_PROXY_PORT = parseInt(process.env.AWS_TEST_HTTPS_PROXY_PORT ?? "0")
    public static HTTP_PROXY_BASIC_HOST = process.env.AWS_TEST_HTTP_PROXY_BASIC_HOST ?? ""
    public static HTTP_PROXY_BASIC_PORT = parseInt(process.env.AWS_TEST_HTTP_PROXY_BASIC_PORT ?? "0")

    public static HTTP_PROXY_BASIC_AUTH_USERNAME = process.env.AWS_TEST_BASIC_AUTH_USERNAME ?? ""
    public static HTTP_PROXY_BASIC_AUTH_PASSWORD = process.env.AWS_TEST_BASIC_AUTH_PASSWORD ?? ""

    public static HTTP_PROXY_TLS_CERT_PATH = process.env.AWS_TEST_TLS_CERT_PATH ?? ""
    public static HTTP_PROXY_TLS_KEY_PATH = process.env.AWS_TEST_TLS_KEY_PATH ?? ""
    public static HTTP_PROXY_TLS_ROOT_CA_PATH = process.env.AWS_TEST_TLS_ROOT_CERT_PATH ?? ""

    public static HTTP_PROXY_WS_SIGNING_REGION = process.env.AWS_TEST_IOT_SIGNING_REGION ?? ""
    public static HTTP_PROXY_MQTT_ENDPOINT = process.env.AWS_TEST_IOT_MQTT_ENDPOINT ?? ""

    public static X509_CREDENTIALS_ENDPOINT = process.env.AWS_TEST_X509_ENDPOINT ?? ""
    public static X509_CREDENTIALS_THING_NAME = process.env.AWS_TEST_X509_THING_NAME ?? ""
    public static X509_CREDENTIALS_ROLE_ALIAS = process.env.AWS_TEST_X509_ROLE_ALIAS ?? ""

    public static is_valid() {
        return ProxyConfig.HTTP_PROXY_HOST !== "" &&
            ProxyConfig.HTTP_PROXY_PORT != 0 &&
            ProxyConfig.HTTP_PROXY_BASIC_HOST !== "" &&
            ProxyConfig.HTTP_PROXY_BASIC_PORT != 0 &&
            ProxyConfig.HTTP_PROXY_BASIC_AUTH_USERNAME !== "" &&
            ProxyConfig.HTTP_PROXY_BASIC_AUTH_PASSWORD !== "" &&
            ProxyConfig.HTTP_PROXY_TLS_CERT_PATH !== "" &&
            ProxyConfig.HTTP_PROXY_TLS_KEY_PATH !== "" &&
            ProxyConfig.HTTP_PROXY_TLS_ROOT_CA_PATH !== "" &&
            ProxyConfig.HTTP_PROXY_WS_SIGNING_REGION !== "" &&
            ProxyConfig.HTTP_PROXY_MQTT_ENDPOINT !== ""
    }

    public static is_tls_to_proxy_valid() {
        return ProxyConfig.HTTPS_PROXY_HOST !== "" && ProxyConfig.HTTPS_PROXY_PORT != 0;
    }

    public static is_x509_valid() {
        return this.is_valid() && ProxyConfig.X509_CREDENTIALS_ENDPOINT != "" &&
                ProxyConfig.X509_CREDENTIALS_THING_NAME != "" && ProxyConfig.X509_CREDENTIALS_ROLE_ALIAS != "";
    }

    public static get_proxy_host_for_test(test_type : ProxyTestType, auth_type : HttpProxyAuthenticationType) {
        if (auth_type == HttpProxyAuthenticationType.Basic) {
            return ProxyConfig.HTTP_PROXY_BASIC_HOST
        }

        if (test_type == ProxyTestType.TUNNELING_DOUBLE_TLS) {
            return ProxyConfig.HTTPS_PROXY_HOST
        }

        return ProxyConfig.HTTP_PROXY_HOST
    }

    public static get_proxy_port_for_test(test_type : ProxyTestType, auth_type : HttpProxyAuthenticationType) {
        if (auth_type == HttpProxyAuthenticationType.Basic) {
            return ProxyConfig.HTTP_PROXY_BASIC_PORT
        }

        if (test_type == ProxyTestType.TUNNELING_DOUBLE_TLS) {
            return ProxyConfig.HTTPS_PROXY_PORT
        }

        return ProxyConfig.HTTP_PROXY_PORT
    }

    public static get_proxy_connection_type_for_test(test_type : ProxyTestType) {
        if (test_type == ProxyTestType.FORWARDING) {
            return HttpProxyConnectionType.Forwarding
        } else if (test_type == ProxyTestType.TUNNELING_DOUBLE_TLS ||
            test_type == ProxyTestType.TUNNELING_HTTP ||
            test_type == ProxyTestType.TUNNELING_HTTPS) {
            return HttpProxyConnectionType.Tunneling
        } else {
            return HttpProxyConnectionType.Legacy
        }
    }

    public static get_proxy_tls_connection_options_for_test(test_type : ProxyTestType) {
        if (test_type == ProxyTestType.TUNNELING_DOUBLE_TLS) {
            let tls_ctx_opt = new TlsContextOptions()
            tls_ctx_opt.verify_peer = false

            let tls_ctx = new ClientTlsContext(tls_ctx_opt)

            return new TlsConnectionOptions(tls_ctx, "localhost")
        } else {
            return undefined
        }
    }

    public static create_http_proxy_options_from_environment(test_type : ProxyTestType, auth_type : HttpProxyAuthenticationType) {
        return new HttpProxyOptions(
            ProxyConfig.get_proxy_host_for_test(test_type, auth_type),
            ProxyConfig.get_proxy_port_for_test(test_type, auth_type),
            auth_type,
            ProxyConfig.HTTP_PROXY_BASIC_AUTH_USERNAME,
            ProxyConfig.HTTP_PROXY_BASIC_AUTH_PASSWORD,
            ProxyConfig.get_proxy_tls_connection_options_for_test(test_type),
            ProxyConfig.get_proxy_connection_type_for_test(test_type))
    }

    public static get_tls_connection_options_for_test(test_type : ProxyTestType, host_name : string) {
        if (test_type == ProxyTestType.FORWARDING || test_type == ProxyTestType.LEGACY_HTTP || test_type == ProxyTestType.TUNNELING_HTTP) {
            return undefined
        } else {
            let tls_ctx_opt = new TlsContextOptions()
            let tls_ctx = new ClientTlsContext(tls_ctx_opt)

            return new TlsConnectionOptions(tls_ctx, host_name)
        }
    }

    public static get_uri_from_test_type(test_type : ProxyTestType) {
        if (test_type == ProxyTestType.FORWARDING || test_type == ProxyTestType.LEGACY_HTTP || test_type == ProxyTestType.TUNNELING_HTTP) {
            return "www.example.com"
        } else {
            return "www.amazon.com"
        }
    }

    public static get_port_from_test_type(test_type : ProxyTestType) {
        if (test_type == ProxyTestType.FORWARDING || test_type == ProxyTestType.LEGACY_HTTP || test_type == ProxyTestType.TUNNELING_HTTP) {
            return 80
        } else {
            return 443
        }
    }
};
