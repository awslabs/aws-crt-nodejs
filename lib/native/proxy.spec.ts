/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {
    ClientBootstrap,
    ClientTlsContext,
    SocketDomain,
    SocketOptions,
    SocketType,
    TlsConnectionOptions,
    TlsContextOptions
} from "./io";
import {
    HttpClientConnection, HttpHeaders,
    HttpProxyAuthenticationType,
    HttpProxyConnectionType,
    HttpProxyOptions,
    HttpRequest
} from "./http";

enum ProxyTestType {
    FORWARDING = 0,
    TUNNELING_HTTP = 1,
    TUNNELING_HTTPS = 2,
    TUNNELING_DOUBLE_TLS = 3,
    LEGACY_HTTP = 4,
    LEGACY_HTTPS = 5,
}

class ProxyConfig {

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

    public static is_valid() {
        return ProxyConfig.HTTP_PROXY_HOST !== "" &&
            ProxyConfig.HTTP_PROXY_PORT != 0 &&
            ProxyConfig.HTTPS_PROXY_HOST !== "" &&
            ProxyConfig.HTTPS_PROXY_PORT != 0 &&
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


async function test_proxied_connection(test_type : ProxyTestType, auth_type : HttpProxyAuthenticationType) {
    const promise = new Promise((resolve, reject) => {
        let host = ProxyConfig.get_uri_from_test_type(test_type)
        let connection = new HttpClientConnection(
            new ClientBootstrap(),
            host,
            ProxyConfig.get_port_from_test_type(test_type),
            new SocketOptions(SocketType.STREAM, SocketDomain.IPV4, 3000),
            ProxyConfig.get_tls_connection_options_for_test(test_type, host),
            ProxyConfig.create_http_proxy_options_from_environment(test_type, auth_type));

        connection.on('connect', () => {
            let request = new HttpRequest(
                "GET",
                '/',
                new HttpHeaders([
                    ['host', host],
                    ['user-agent', 'AWS CRT for NodeJS']
                ])
            );
            let stream = connection.request(request);
            stream.on('response', (status_code, headers) => {
                expect(status_code).toBe(200);
                expect(headers).toBeDefined();
            });
            stream.on('data', (body_data) => {
                expect(body_data.byteLength).toBeGreaterThan(0);
            });
            stream.on('end', () => {
                connection.close();
            });
            stream.on('error', (error) => {
                connection.close();
                console.log(error);
                expect(error).toBeUndefined();
            });
            stream.activate();
        });
        connection.on('close', () => {
            resolve(true);
        });
        connection.on('error', (error) => {
            reject(error);
        });
    });

    await expect(promise).resolves.toBeTruthy();
}

const conditional_test = (condition : boolean) => condition ? it : it.skip;

function is_proxy_environment_enabled() {
    return ProxyConfig.is_valid()
}

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Forwarding NoAuth', async (done) => {
    await test_proxied_connection(ProxyTestType.FORWARDING, HttpProxyAuthenticationType.None);
    done();
});

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Legacy NoAuth', async (done) => {
    await test_proxied_connection(ProxyTestType.LEGACY_HTTP, HttpProxyAuthenticationType.None);
    done();
});

conditional_test(is_proxy_environment_enabled())('Proxied Https Connection Legacy NoAuth', async (done) => {
    await test_proxied_connection(ProxyTestType.LEGACY_HTTPS, HttpProxyAuthenticationType.None);
    done();
});

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Tunneling NoAuth', async (done) => {
    await test_proxied_connection(ProxyTestType.TUNNELING_HTTP, HttpProxyAuthenticationType.None);
    done();
});

conditional_test(is_proxy_environment_enabled())('Proxied Https Connection Tunneling NoAuth', async (done) => {
    await test_proxied_connection(ProxyTestType.TUNNELING_HTTPS, HttpProxyAuthenticationType.None);
    done();
});

conditional_test(is_proxy_environment_enabled())('Proxied Https Connection DoubleTls NoAuth', async (done) => {
    await test_proxied_connection(ProxyTestType.TUNNELING_DOUBLE_TLS, HttpProxyAuthenticationType.None);
    done();
});

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Forwarding BasicAuth', async (done) => {
    await test_proxied_connection(ProxyTestType.FORWARDING, HttpProxyAuthenticationType.Basic);
    done();
});

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Legacy BasicAuth', async (done) => {
    await test_proxied_connection(ProxyTestType.LEGACY_HTTP, HttpProxyAuthenticationType.Basic);
    done();
});

conditional_test(is_proxy_environment_enabled())('Proxied Https Connection Legacy BasicAuth', async (done) => {
    await test_proxied_connection(ProxyTestType.LEGACY_HTTPS, HttpProxyAuthenticationType.Basic);
    done();
});

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Tunneling BasicAuth', async (done) => {
    await test_proxied_connection(ProxyTestType.TUNNELING_HTTP, HttpProxyAuthenticationType.Basic);
    done();
});

conditional_test(is_proxy_environment_enabled())('Proxied Https Connection Tunneling BasicAuth', async (done) => {
    await test_proxied_connection(ProxyTestType.TUNNELING_HTTPS, HttpProxyAuthenticationType.Basic);
    done();
});
