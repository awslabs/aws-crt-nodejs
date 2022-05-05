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



async function connect_websocket() {
    return new Promise<mqtt.MqttClientConnection>((resolve, reject) => {
        AWS.config.region = Config.AWS_REGION;
        const credential_provider = AWS.config.credentials = new AWS.CognitoIdentityCredentials({
            IdentityPoolId: Config.AWS_COGNITO_IDENTITY_POOL_ID
        });
        var cognitoIdentity = new AWS.CognitoIdentity();
        credential_provider.get(function(err) {
            if (!err) {
               console.log('retrieved identity: ' + credential_provider.identityId);
               var params = {
                  IdentityId: credential_provider.identityId
               };
               cognitoIdentity.getCredentialsForIdentity(params, function(err, respdata) {
                  if (!err) {
                     //
                     // Update our latest AWS credentials; the MQTT client will use these
                     // during its next reconnect attempt.
                     //
                     const credentials = {
                        access_id : respdata.Credentials.accessKeyId,
                        secret_key : respdata.Credentials.secretAccessKey,
                        sts_token : respdata.Credentials.sessionToken,
                    };
                  } else {
                     console.log('error retrieving credentials: ' + err);
                     alert('error retrieving credentials: ' + err);
                  }
               });
            } else {
               console.log('error retrieving identity:' + err);
               alert('error retrieving identity: ' + err);
            }
         });
         
        let config = iot.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket()
            .with_clean_session(true)
            .with_client_id(`pub_sub_sample(${new Date()})`)
            .with_endpoint(Config.AWS_IOT_ENDPOINT)
            .with_credentialConfig(Config.AWS_REGION, credential_provider, (provider : AWS.CognitoIdentityCredentials) => {
                if(provider.needsRefresh())
                {
                    log('do I always need refresh?? ');
                    provider.refresh((err: any) => {
                        if (err) {
                            log(`Error fetching cognito credentials: ${err}`);
                        }
                        else
                        {
                            log('Cognito credentials refreshed');
                        }
                    });
                }
                const credentials = {
                    access_id : provider.accessKeyId,
                    secret_key : provider.secretAccessKey,
                    sts_token : provider.sessionToken,
                }
                return credentials;
            })
            .with_use_websockets()
            .with_keep_alive_seconds(30)
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
    connect_websocket()
        .then((connection) => {
            connection.subscribe('/test/me/senpai', mqtt.QoS.AtLeastOnce, (topic, payload, dup, qos, retain) => {
                const decoder = new TextDecoder('utf8');
                let message = decoder.decode(new Uint8Array(payload));
                log(`Message received: topic=${topic} message=${message}`);
            })
                .then((subscription) => {
                    while(true)
                    {
                        connection.publish(subscription.topic, 'NOTICE ME', subscription.qos) 
                        setTimeout(() => {  console.log("publish every minute!"); }, 60000);
                        
                    }
                });
        })
        .catch((reason) => {
            log(`Error while connecting: ${reason}`);
        });
}

$(document).ready(() => {
    main();
});
