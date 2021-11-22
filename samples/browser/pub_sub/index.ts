/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { mqtt, iot, CrtError } from "aws-crt";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import { CognitoIdentityCredentials } from "@aws-sdk/credential-provider-cognito-identity/dist-types/fromCognitoIdentity"
import Config = require('./config');
import jquery = require("jquery");
const $: JQueryStatic = jquery;

function log(msg: string) {
    $('#console').append(`<pre>${msg}</pre>`);
}

function fetch_credentials() {
    log('Fetching Cognito credentials');
    return fromCognitoIdentityPool({
        // Required. The unique identifier for the identity pool from which an identity should be
        // retrieved or generated.
        identityPoolId: Config.AWS_COGNITO_POOL_ID,
        clientConfig: { region: Config.AWS_REGION },
    })();
}

async function connect_websocket(credentials: CognitoIdentityCredentials) {
    return new Promise<mqtt.MqttClientConnection>((resolve, reject) => {
        let config = iot.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket()
            .with_clean_session(true)
            .with_client_id(`pub_sub_sample(${new Date()})`)
            .with_endpoint(Config.AWS_IOT_ENDPOINT)
            .with_credentials(Config.AWS_REGION, credentials.accessKeyId, credentials.secretAccessKey, credentials.sessionToken)
            .with_use_websockets()
            .build();

        log('Connecting websocket...');
        const client = new mqtt.MqttClient();

        const connection = client.new_connection(config);
        connection.on('connect', (session_present) => {
            resolve(connection);
        });
        connection.on('interrupt', (error: CrtError) => {
            log(`Connection interrupted: error=${error}`);
        });
        connection.on('resume', (return_code: number, session_present: boolean) => {
            log(`Resumed: rc: ${return_code} existing session: ${session_present}`)
        });
        connection.on('disconnect', () => {
            log('Disconnected');
        });
        connection.on('error', (error) => {
            reject(error);
        });
        connection.connect();
    });

}

async function main() {
    fetch_credentials()
        .then(connect_websocket)
        .then((connection) => {
            connection.subscribe('/test/me/senpai', mqtt.QoS.AtLeastOnce, (topic, payload, dup, qos, retain) => {
                const decoder = new TextDecoder('utf8');
                let message = decoder.decode(new Uint8Array(payload));
                log(`Message received: topic=${topic} message=${message}`);
                connection.disconnect();
            })
                .then((subscription) => {
                    return connection.publish(subscription.topic, 'NOTICE ME', subscription.qos);
                });
        })
        .catch((reason) => {
            log(`Error while connecting: ${reason}`);
        });
}

$(document).ready(() => {
    main();
});
