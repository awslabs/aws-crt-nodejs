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
            log(`Identity Expires: ${credentials.expireTime}`);
            resolve(credentials);
        });
    });
}

async function connect_websocket(original_credential: AWS.CognitoIdentityCredentials) {
    return new Promise<mqtt.MqttClientConnection>((resolve, reject) => {
        AWS.config.region = Config.AWS_REGION;
        let config = iot.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket()
            .with_clean_session(true)
            .with_client_id(`pub_sub_sample(${new Date()})`)
            .with_endpoint(Config.AWS_IOT_ENDPOINT)
            .with_credentials( Config.AWS_REGION, original_credential.accessKeyId, original_credential.secretAccessKey, original_credential.sessionToken, 
                original_credential, (provider : mqtt.AWSCredentials) => {
                provider.aws_provider.refresh((err: any) => {
                    if (err) {
                        log(`Error fetching cognito credentials: ${err}`);
                    }
                    else
                    {
                        log('Cognito credentials refreshed.');
                        provider.aws_region = Config.AWS_REGION;
                        provider.aws_access_id =  provider.aws_provider.accessKeyId;
                        provider.aws_secret_key =  provider.aws_provider.secretAccessKey;
                        provider.aws_sts_token = provider.aws_provider.sessionToken;
                    }
                });
            })
            .with_use_websockets()
            .with_keep_alive_seconds(30)
            .build();

        log('Connecting websocket...');
        const client = new mqtt.MqttClient();
        log('new connection ...');
        const connection = client.new_connection(config);
        log('setup callbacks ...');
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
        log('connect...');
        connection.connect();
    });

}

async function main() {
    fetch_credentials()
        .then(connect_websocket)
        .then((connection) => {
            log(`start subscribe`)
            connection.subscribe('/test/me/senpai', mqtt.QoS.AtLeastOnce, (topic, payload, dup, qos, retain) => {
                const decoder = new TextDecoder('utf8');
                let message = decoder.decode(new Uint8Array(payload));
                log(`Message received: topic=${topic} message=${message}`);
            })
                .then((subscription) => {
                    log(`start publish`)
                        setInterval( ()=>{
                            connection.publish(subscription.topic, 'NOTICE ME', subscription.qos);
                        }, 6000);
                });
        })
        .catch((reason) => {
            log(`Error while connecting: ${reason}`);
        });
}

$(document).ready(() => {
    main();
});
