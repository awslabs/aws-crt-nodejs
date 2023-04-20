/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { mqtt, iot, CrtError, auth } from "aws-crt";
import AWS from "aws-sdk"
import {AWS_REGION, AWS_COGNITO_IDENTITY_POOL_ID, AWS_IOT_ENDPOINT} from './config';
import jquery from "jquery";
const $: JQueryStatic = jquery;
function log(msg: string) {
    $('#console').append(`<pre>${msg}</pre>`);
}

/**
 * AWSCognitoCredentialOptions. The credentials options used to create AWSCongnitoCredentialProvider.
 */
interface AWSCognitoCredentialOptions
{
    IdentityPoolId : string,
    Region: string
}

/**
 * AWSCognitoCredentialsProvider. The AWSCognitoCredentialsProvider implements AWS.CognitoIdentityCredentials.
 *
 */
export class AWSCognitoCredentialsProvider extends auth.CredentialsProvider{

    private options: AWSCognitoCredentialOptions;
    private source_provider : AWS.CognitoIdentityCredentials;
    private aws_credentials : auth.AWSCredentials;
    constructor(options: AWSCognitoCredentialOptions, expire_interval_in_ms? : number)
    {
        super();
        this.options = options;
        AWS.config.region = options.Region;
        this.source_provider = new AWS.CognitoIdentityCredentials({
            IdentityPoolId: options.IdentityPoolId
        });
        this.aws_credentials =
        {
            aws_region: options.Region,
            aws_access_id : this.source_provider.accessKeyId,
            aws_secret_key: this.source_provider.secretAccessKey,
            aws_sts_token: this.source_provider.sessionToken
        }

        setInterval(async ()=>{
            await this.refreshCredentialAsync();
        },expire_interval_in_ms?? 3600*1000);
    }

    getCredentials(){
        return this.aws_credentials;
    }

    async refreshCredentialAsync()
    {
        return new Promise<AWSCognitoCredentialsProvider>((resolve, reject) => {
            this.source_provider.get((err)=>{
                if(err)
                {
                    reject("Failed to get cognito credentials.")
                }
                else
                {
                    this.aws_credentials.aws_access_id = this.source_provider.accessKeyId;
                    this.aws_credentials.aws_secret_key = this.source_provider.secretAccessKey;
                    this.aws_credentials.aws_sts_token = this.source_provider.sessionToken;
                    this.aws_credentials.aws_region = this.options.Region;
                    resolve(this);
                }
            });
        });
    }
}

class PubSubInstance
{
    connection : mqtt.MqttClientConnection | any = undefined;
    sampleTopic: string = "/test/me/senpai";
    clientSetup: boolean = false;
    provider = new AWSCognitoCredentialsProvider(
        {
            IdentityPoolId: AWS_COGNITO_IDENTITY_POOL_ID,
            Region: AWS_REGION
        }
    );
    sampleMessageCount: number = 0;

    async logToPage(message : string)
    {
        log(message);
    }

    async connect(input_qos : mqtt.QoS) {
        if (this.clientSetup == false) {
            await this.provider.refreshCredentialAsync();
            this.connection = connect_websocket(this.provider);
            this.clientSetup = true;

            // Subscribe to the topic
            log("Subscribing...");
            log("\tUsing QOS: " + input_qos);
            (await this.connection).subscribe(
                this.sampleTopic,
                input_qos,
                (topic : string, payload : any, dup : boolean, qos : mqtt.QoS, retain : boolean) => {
                    const decoder = new TextDecoder("utf8");
                    let message = decoder.decode(new Uint8Array(payload));
                    log(`Message received: topic=${topic} message=${message} with (subscribe) QoS=${qos}`);
            }
            );
            log("Subscribed...");
        }
        else {
            log("Client already connected");
        }
    }

    async disconnect() {
        if (this.clientSetup == true) {
            // Unsubscribe
            log("Unsubscribing...");
            (await this.connection).unsubscribe(this.sampleTopic);
            log("Unsubscribed...");

            // Disconnect
            log("Disconnecting websocket...");
            (await this.connection).disconnect();
            this.clientSetup = false;
        }
        else {
            log("Client already disconnected");
        }
    }

      async publish(input_qos : mqtt.QoS) {
        if (this.clientSetup == true) {
            log(`start publish with QoS` + input_qos)
          this.sampleMessageCount += 1;
          (await this.connection).publish(this.sampleTopic, `NOTICE ME {${this.sampleMessageCount}}`, input_qos);
        }
        else {
            log("Client is not connected");
        }
      }
}
export {PubSubInstance}

async function connect_websocket(provider: auth.CredentialsProvider) {
    return new Promise<mqtt.MqttClientConnection>((resolve, reject) => {
        let config = iot.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket()
            .with_clean_session(true)
            .with_client_id(`pub_sub_sample(${new Date()})`)
            .with_endpoint(AWS_IOT_ENDPOINT)
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
            log("Error occurred: " + error)
            reject(error);
        });
        log('connect...');
        connection.connect();
    });

}
