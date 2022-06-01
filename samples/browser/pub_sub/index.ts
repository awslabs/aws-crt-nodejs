/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { mqtt, iot, CrtError, auth } from "aws-crt";
import Config = require('./config');
import jquery = require("jquery");
const $: JQueryStatic = jquery;

function log(msg: string) {
    $('#console').append(`<pre>${msg}</pre>`);
}

async function connect_websocket(provider: auth.AWSCognitoCredentialsProvider) {
    return new Promise<mqtt.MqttClientConnection>((resolve, reject) => {
        let config = iot.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket()
            .with_clean_session(true)
            .with_client_id("pub_sub_sample")
            .with_endpoint(Config.AWS_IOT_ENDPOINT)
            /** The following line is a sample of static credential. Please note the static credential will fail when web session expires.*/
            //.with_credentials(Config.AWS_REGION, original_credential.accessKeyId, original_credential.secretAccessKey, original_credential.sessionToken)
            .with_credential_provider(provider)
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
        log('connect...');
        connection.connect();
    });

}

async function main() {
    /** Set up the credentialsProvider */
    const options = new auth.AWSCognitoCredentialOptions(Config.AWS_COGNITO_IDENTITY_POOL_ID, Config.AWS_REGION);
    const provider = new auth.AWSCognitoCredentialsProvider(options);
    /** Make sure the credential provider fetched before setup the connection */
    await provider.refreshCredentialAsync();

    connect_websocket(provider)
    .then((connection) => {
        log(`start subscribe`)
        connection.subscribe('/test/me/senpai', mqtt.QoS.AtLeastOnce, (topic, payload, dup, qos, retain) => {
            const decoder = new TextDecoder('utf8');
            let message = decoder.decode(new Uint8Array(payload));
            log(`Message received: topic=${topic} message=${message}`);
            /** The sample is used to demo long-running web service. 
             * Uncomment the following line to see how disconnect behaves.*/
            // connection.disconnect();
        })
        .then((subscription) => {
            log(`start publish`)
            connection.publish(subscription.topic, 'NOTICE ME', subscription.qos);
            /** The sample is used to demo long-running web service. The sample will keep publishing the message every minute.*/
            setInterval( ()=>{
                connection.publish(subscription.topic, 'NOTICE ME', subscription.qos);
            }, 60000);
        });
    })
    .catch((reason) => {
        log(`Error while connecting: ${reason}`);
    });
}

$(document).ready(() => {
    main();
});
