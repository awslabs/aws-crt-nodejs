/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {mqtt5, auth, iot, MqttConnectCustomAuthConfig} from "aws-crt"
import {once} from "events"
import * as settings from "./config"
import { toUtf8 } from '@aws-sdk/util-utf8-browser';
/// @ts-ignore

let client : mqtt5.Mqtt5Client | undefined = undefined
const test_topic = "hello/world/qos0"

function createClient() : mqtt5.Mqtt5Client {

    let customAuthConfig : MqttConnectCustomAuthConfig = {
        authorizerName: settings.AUTHORIZER_NAME,
        username: settings.USERNAME,
        password: settings.PASSWORD
    };

    let builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithCustomAuth(
        settings.AWS_IOT_ENDPOINT,
        customAuthConfig
    );

    console.log("Connecting custom authorizer...");
    client = new mqtt5.Mqtt5Client(builder.build());
    client.on("messageReceived",(eventData: mqtt5.MessageReceivedEvent) : void => {
        console.log("Message Received event: " + JSON.stringify(eventData.message));
        if (eventData.message.payload) {
            console.log("  with payload: " + toUtf8(new Uint8Array(eventData.message.payload as ArrayBuffer)));
        }
    } );

    return client;
}

export async function setupConnection() {

    if(client != undefined) return;
    /** Set up the credentialsProvider */
    client = createClient();

    const attemptingConnect = once(client, "attemptingConnect");
    const connectionSuccess = once(client, "connectionSuccess");

    client.start();

    await attemptingConnect;
    await connectionSuccess;

    const suback = await client.subscribe({
        subscriptions: [
            { qos: mqtt5.QoS.AtLeastOnce, topicFilter: test_topic }
        ]
    });
    console.log('Suback result: ' + JSON.stringify(suback));
}

export async function Mqtt5ClientPublish()
{
    await setupConnection()
    if (!client)
    {
        console.log("[Warning] Client has not been setup.")
        return
    }
    const qos0PublishResult = await client.publish({
        qos: mqtt5.QoS.AtLeastOnce,
        topicName: test_topic,
        payload: "This is a qos 1 payload"
    });
    console.log('QoS 1 Publish result: ' + JSON.stringify(qos0PublishResult));
}

