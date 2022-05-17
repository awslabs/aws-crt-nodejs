/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { mqtt, iot, CrtError } from "aws-crt";
import * as AWS from "aws-sdk";
import Config = require('./config');
import jquery = require("jquery");
const $: JQueryStatic = jquery;

function log(msg: string) {
    $('#console').append(`<pre>${msg}</pre>`);
}

async function fetch_credentials() {
    return new Promise<AWS.CognitoIdentityCredentials>((resolve, reject) => {
        AWS.config.region = Config.AWS_REGION;
        const credentials = AWS.config.credentials = new AWS.CognitoIdentityCredentials({
            IdentityPoolId: Config.AWS_COGNITO_IDENTITY_POOL_ID
        });
        log('Fetching Cognito credentials');
        credentials.refresh((err: any) => {
            if (err) {
                log(`Error fetching cognito credentials: ${err}`);
                reject(`Error fetching cognito credentials: ${err}`);
            }
            log('Cognito credentials refreshed');
            resolve(credentials);
        });
    });
}

async function connect_websocket(credentials: AWS.CognitoIdentityCredentials) {
    return new Promise<mqtt.MqttClientConnection>((resolve, reject) => {
        let config = iot.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket()
            .with_clean_session(true)
            .with_client_id("pub_sub_sample")
            .with_endpoint(Config.AWS_IOT_ENDPOINT)
            .with_credentials(Config.AWS_REGION, credentials.accessKeyId, credentials.secretAccessKey, credentials.sessionToken)
            .with_use_websockets()
            .with_keep_alive_seconds(30)
            .build();

        log('Connecting websocket...');
        const client = new mqtt.MqttClient();

        const connection = client.new_connection(config);
        connection.on('connect', (session_present) => {
            resolve(connection);
            log("connection started:")
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
                // connection.disconnect();
            })
                .then((subscription) => {
                    
                        setInterval( ()=>{connection.publish(subscription.topic, 'NOTICE ME', subscription.qos);}, 2000);
                    
                });
        })
        .catch((reason) => {
            log(`Error while connecting: ${reason}`);
        });
}

$(document).ready(() => {
    main();
});
