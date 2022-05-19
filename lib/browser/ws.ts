/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: Apache-2.0.
*/

/**
 * @packageDocumentation
 * @module mqtt
 */

import { MqttConnectionConfig } from "./mqtt";
import { AWSBrowserCredentials } from "./auth";
var websocket = require('@httptoolkit/websocket-stream')
import * as Crypto from "crypto-js";

/**
 * Options for websocket based connections in browser
 *
 * @category MQTT
 */
export interface WebsocketOptions {
    /** Additional headers to add */
    headers?: { [index: string]: string };
    /** Websocket protocol, used during Upgrade */
    protocol?: string;
}

function zero_pad(n: number) {
    return (n > 9) ? n : '0' + n.toString();
}

function canonical_time() {
    const now = new Date();
    return `${now.getUTCFullYear()}${zero_pad(now.getUTCMonth() + 1)}${zero_pad(now.getUTCDate())}T` +
        `${zero_pad(now.getUTCHours())}${zero_pad(now.getUTCMinutes())}${zero_pad(now.getUTCSeconds())}Z`;
}

function canonical_day(time: string = canonical_time()) {
    return time.substring(0, time.indexOf('T'));
}

function make_signing_key(credentials: AWSBrowserCredentials, day: string, service_name: string) {
    const hash_opts = { asBytes: true };
    let hash = Crypto.HmacSHA256(day, 'AWS4' + credentials.aws_secret_key, hash_opts);
    hash = Crypto.HmacSHA256(credentials.aws_region || '', hash, hash_opts);
    hash = Crypto.HmacSHA256(service_name, hash, hash_opts);
    hash = Crypto.HmacSHA256('aws4_request', hash, hash_opts);
    return hash;
}

function sign_url(method: string,
    url: URL,
    credentials: AWSBrowserCredentials,
    service_name: string,
    time: string = canonical_time(),
    day: string = canonical_day(time),
    payload: string = '') {

    const signed_headers = 'host';
    const canonical_headers = `host:${url.hostname.toLowerCase()}\n`;
    const payload_hash = Crypto.SHA256(payload, { asBytes: true });
    const canonical_params = url.search.replace(new RegExp('^\\?'), '');
    const canonical_request = `${method}\n${url.pathname}\n${canonical_params}\n${canonical_headers}\n${signed_headers}\n${payload_hash}`;
    const canonical_request_hash = Crypto.SHA256(canonical_request, { asBytes: true });
    const signature_raw = `AWS4-HMAC-SHA256\n${time}\n${day}/${credentials.aws_region}/${service_name}/aws4_request\n${canonical_request_hash}`;
    const signing_key = make_signing_key(credentials, day, service_name);
    const signature = Crypto.HmacSHA256(signature_raw, signing_key, { asBytes: true });
    let query_params = `${url.search}&X-Amz-Signature=${signature}`;
    if (credentials.aws_sts_token) {
        query_params += `&X-Amz-Security-Token=${encodeURIComponent(credentials.aws_sts_token)}`;
    }
    const signed_url = `${url.protocol}//${url.hostname}${url.pathname}${query_params}`;
    return signed_url;
}

/** @internal */
export function create_websocket_url(config: MqttConnectionConfig) {
    const time = canonical_time();
    const day = canonical_day(time);
    const path = '/mqtt';
    const protocol = (config.websocket || {}).protocol || 'wss';
    console.log("creating url");
    if (protocol === 'wss') {
        // Trigger refresh the credential
        config.credentialConfig.refreshIdentityCallback(config.credentialConfig.provider, config.credentialConfig.credentials);
        const service_name = 'iotdevicegateway';
        const credentials = config.credentialConfig.credentials!;
        const query_params = `X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${credentials.aws_access_id}` +
            `%2F${day}%2F${credentials.aws_region}%2F${service_name}%2Faws4_request&X-Amz-Date=${time}&X-Amz-SignedHeaders=host`;
        const url = new URL(`wss://${config.host_name}${path}?${query_params}`);
        return sign_url('GET', url, credentials, service_name, time, day);
    }
    else if (protocol === 'wss-custom-auth') {
        return `wss://${config.host_name}/${path}`;
    }
    throw new URIError(`Invalid protocol requested: ${protocol}`);
}

/** @internal */
export function create_websocket_stream(config: MqttConnectionConfig) {
    const url = create_websocket_url(config);
    return websocket(url, ['mqttv3.1'], config.websocket);
}