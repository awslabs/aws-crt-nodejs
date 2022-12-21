/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {
    SocketDomain,
    SocketOptions,
    SocketType,
} from "./io";
import {
    HttpClientConnection, HttpHeaders,
    HttpProxyAuthenticationType,
    HttpRequest
} from "./http";
import {ProxyConfig, ProxyTestType} from "@test/proxy";

import {AwsIotMqttConnectionConfigBuilder} from "./aws_iot";
import {v4 as uuid} from "uuid";
import {MqttClient} from "./mqtt";




async function test_proxied_connection(test_type : ProxyTestType, auth_type : HttpProxyAuthenticationType) {
    const promise = new Promise((resolve, reject) => {
        let host = ProxyConfig.get_uri_from_test_type(test_type)
        let connection = new HttpClientConnection(
            undefined,
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

function is_tls_to_proxy_enabled() {
    return ProxyConfig.is_tls_to_proxy_valid()
}

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Forwarding NoAuth', async () => {
    await test_proxied_connection(ProxyTestType.FORWARDING, HttpProxyAuthenticationType.None);
});

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Legacy NoAuth', async () => {
    await test_proxied_connection(ProxyTestType.LEGACY_HTTP, HttpProxyAuthenticationType.None);
});

conditional_test(is_proxy_environment_enabled())('Proxied Https Connection Legacy NoAuth', async () => {
    await test_proxied_connection(ProxyTestType.LEGACY_HTTPS, HttpProxyAuthenticationType.None);
});

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Tunneling NoAuth', async () => {
    await test_proxied_connection(ProxyTestType.TUNNELING_HTTP, HttpProxyAuthenticationType.None);
});

conditional_test(is_proxy_environment_enabled())('Proxied Https Connection Tunneling NoAuth', async () => {
    await test_proxied_connection(ProxyTestType.TUNNELING_HTTPS, HttpProxyAuthenticationType.None);
});

conditional_test(is_proxy_environment_enabled() && is_tls_to_proxy_enabled())('Proxied Https Connection DoubleTls NoAuth', async () => {
    await test_proxied_connection(ProxyTestType.TUNNELING_DOUBLE_TLS, HttpProxyAuthenticationType.None);
});

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Forwarding BasicAuth', async () => {
    await test_proxied_connection(ProxyTestType.FORWARDING, HttpProxyAuthenticationType.Basic);
});

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Legacy BasicAuth', async () => {
    await test_proxied_connection(ProxyTestType.LEGACY_HTTP, HttpProxyAuthenticationType.Basic);
});

conditional_test(is_proxy_environment_enabled())('Proxied Https Connection Legacy BasicAuth', async () => {
    await test_proxied_connection(ProxyTestType.LEGACY_HTTPS, HttpProxyAuthenticationType.Basic);
});

conditional_test(is_proxy_environment_enabled())('Proxied Http Connection Tunneling BasicAuth', async () => {
    await test_proxied_connection(ProxyTestType.TUNNELING_HTTP, HttpProxyAuthenticationType.Basic);
});

conditional_test(is_proxy_environment_enabled())('Proxied Https Connection Tunneling BasicAuth', async () => {
    await test_proxied_connection(ProxyTestType.TUNNELING_HTTPS, HttpProxyAuthenticationType.Basic);
});

async function test_proxied_mqtt_connection(test_type : ProxyTestType, auth_type : HttpProxyAuthenticationType) {

    const config = AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(ProxyConfig.HTTP_PROXY_TLS_CERT_PATH, ProxyConfig.HTTP_PROXY_TLS_KEY_PATH)
        .with_certificate_authority_from_path(undefined, ProxyConfig.HTTP_PROXY_TLS_ROOT_CA_PATH)
        .with_clean_session(true)
        .with_client_id(`node-mqtt-unit-test-${uuid()}`)
        .with_endpoint(ProxyConfig.HTTP_PROXY_MQTT_ENDPOINT)
        .with_ping_timeout_ms(5000)
        .with_http_proxy_options(ProxyConfig.create_http_proxy_options_from_environment(test_type, auth_type))
        .build()
    const client = new MqttClient(undefined);
    const connection = client.new_connection(config);
    const promise = new Promise(async (resolve, reject) => {
        connection.on('connect', async (session_present) => {
            expect(session_present).toBeFalsy();

            const disconnected = connection.disconnect();
            await expect(disconnected).resolves.toBeUndefined();
        });
        connection.on('error', (error) => {
            reject(error);
        })
        connection.on('disconnect', () => {
            resolve(true);
        })
        const connected = connection.connect();
        await expect(connected).resolves.toBeDefined();
    });
    await expect(promise).resolves.toBeTruthy();
}

conditional_test(is_proxy_environment_enabled())('Proxied Mqtt Connection Tunneling NoAuth', async () => {
    await test_proxied_mqtt_connection(ProxyTestType.TUNNELING_HTTP, HttpProxyAuthenticationType.None);
});

conditional_test(is_proxy_environment_enabled())('Proxied Mqtt Connection Tunneling BasicAuth', async () => {
    await test_proxied_mqtt_connection(ProxyTestType.TUNNELING_HTTP, HttpProxyAuthenticationType.Basic);
});

conditional_test(is_proxy_environment_enabled() && is_tls_to_proxy_enabled())('Proxied Mqtt Connection DoubleTls NoAuth', async () => {
    await test_proxied_mqtt_connection(ProxyTestType.TUNNELING_DOUBLE_TLS, HttpProxyAuthenticationType.None);
});