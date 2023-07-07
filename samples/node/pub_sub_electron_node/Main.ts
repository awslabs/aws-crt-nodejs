/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const { app, BrowserWindow, ipcMain} = require('electron')
const path = require("path")
import {mqtt, mqtt5, iot, ICrtError, io} from "aws-crt"
import {once} from "events"
import { toUtf8 } from '@aws-sdk/util-utf8-browser'
import * as args from "./settings"

var win:Electron.BrowserWindow
var client :mqtt5.Mqtt5Client | null;
var qos0_topic = "test/topic/qos0";
var qos1_topic = "test/topic/qos1";

function createWindow () {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "./preload_pubsub5.js"),
    }
  })

  io.enable_logging(io.LogLevel.DEBUG);
  win.webContents.openDevTools();
  console.log(process.versions.electron);
  win.loadFile('./index.html');
}

app.whenReady().then(() => {
  ipcMain.handle('PubSub5MtlsStart', ()=> {if(args.mqtt3) StartMqtt3(); else PubSub5MtlsStart()})
  ipcMain.handle('PubSub5WebsocketsStart', PubSub5WebsocketsStart)
  ipcMain.handle('PubSub5Stop',PubSub5Stop)
  ipcMain.handle('PublishTestMessage',PublishTestQoS1Message)
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.exit()
  }
})


app.on('will-quit', async () => {
  setTimeout(() => {}, 2147483647);
  if(args.mqtt3) await StopMqtt3();
  else await PubSub5Stop()

});

function console_render_log(msg: string)
{
  try
  {
    win?.webContents?.send('log', msg)
  }
  catch(error)
  {
    console.log("Failed to log the message: " + error)
  }
}

function creatClientConfig(isWebsocket: boolean) : mqtt5.Mqtt5ClientConfig {
  let builder : iot.AwsIotMqtt5ClientConfigBuilder | undefined = undefined;

  if (!isWebsocket) {
      console_render_log("Start to build client with Mtls... Please make sure setting up the credentials in \"Settings.ts\"");
      builder = iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(
          args.endpoint,
          args.cert_file_path,
          args.key_file_path
      );
  } else {
      console_render_log("Start to build client with websocket configuration... Please make sure setup the endpoint and region in \"Settings.ts\"");
      let wsOptions : iot.WebsocketSigv4Config | undefined = undefined;
      if (args.region) {
          wsOptions = { region: args.region };
      }
      builder = iot.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(
          args.endpoint,
          wsOptions
      );
  }

  builder.withConnectProperties({
      keepAliveIntervalSeconds: 1200,
      clientId: "test-client"
  });

  return builder.build();
}


function createClient(isWebsocket: boolean) : mqtt5.Mqtt5Client {

  let config : mqtt5.Mqtt5ClientConfig = creatClientConfig(isWebsocket);

  console_render_log("Creating client for " + config.hostName);
  client = new mqtt5.Mqtt5Client(config);

  client.on('error', (error: ICrtError) => {
      console_render_log("Error event: " + error.toString());
  });

  client.on("messageReceived",(eventData: mqtt5.MessageReceivedEvent) : void => {
      console_render_log("Message Received event: " + JSON.stringify(eventData.message));
      if (eventData.message.payload) {
          console_render_log("  with payload: " + toUtf8(new Uint8Array(eventData.message.payload as ArrayBuffer)));
      }
  } );

  client.on('attemptingConnect', (eventData: mqtt5.AttemptingConnectEvent) => {
      console_render_log("Attempting Connect event");
  });

  client.on('connectionSuccess', (eventData: mqtt5.ConnectionSuccessEvent) => {
      console_render_log("Connection Success event");
      console_render_log("Connack: " + JSON.stringify(eventData.connack));
      console_render_log("Settings: " + JSON.stringify(eventData.settings));
  });

  client.on('connectionFailure', (eventData: mqtt5.ConnectionFailureEvent) => {
      console_render_log("Connection failure event: " + eventData.error.toString());
      if (eventData.connack) {
          console_render_log("Connack: " + JSON.stringify(eventData.connack));
      }
  });

  client.on('disconnection', (eventData: mqtt5.DisconnectionEvent) => {
      console_render_log("Disconnection event: " + eventData.error.toString());
      if (eventData.disconnect !== undefined) {
          console_render_log('Disconnect packet: ' + JSON.stringify(eventData.disconnect));
      }
  });

  client.on('stopped', (eventData: mqtt5.StoppedEvent) => {
      console_render_log("Stopped event");
  });

  return client;
}

async function createClientAndStartPubSub(isWebsocket : boolean) {

  try{

      client = createClient(isWebsocket);

      const connectionSuccess = once(client, "connectionSuccess");

      client.start();
      await connectionSuccess;

  //     const suback = await client.subscribe({
  //         subscriptions: [
  //             { qos: mqtt5.QoS.AtLeastOnce, topicFilter: qos1_topic },
  //             { qos: mqtt5.QoS.AtMostOnce, topicFilter: qos0_topic }
  //         ]
  //     });
  //     console_render_log('Suback result: ' + JSON.stringify(suback));

  //     const qos0PublishResult = await client.publish({
  //         qos: mqtt5.QoS.AtMostOnce,
  //         topicName: qos0_topic,
  //         payload: JSON.stringify("This is a qos 0 payload"),
  //         userProperties: [
  //             {name: "test", value: "userproperty"}
  //         ]
  //     });
  //     console_render_log('QoS 0 Publish result: ' + JSON.stringify(qos0PublishResult));

  //     const qos1PublishResult = await client.publish({
  //         qos: mqtt5.QoS.AtLeastOnce,
  //         topicName: qos1_topic,
  //         payload: JSON.stringify("This is a qos 1 payload")
  //     });
  //     console_render_log('QoS 1 Publish result: ' + JSON.stringify(qos1PublishResult));
  }
  catch(error)
  {
      console_render_log("Client failed: " + error)
  }

}

export const PubSub5MtlsStart= async () => {
  if(client !=null)
  {
      console_render_log("Client is already started.");
      return;
  }

  await createClientAndStartPubSub(false)

}

export const PubSub5WebsocketsStart = async () => {
  if(client !=null)
  {
      console_render_log("Client is already started, please stop the client first.");
      return;
  }

  await createClientAndStartPubSub(true);

}


async function PubSub5Stop(){
  if(client == null)
  {
      console_render_log("Client is not started.")
      return;
  }

  try{
    const stopped = once(client, "stopped");
    client.stop();
    await stopped;
    client.close();
    client = null;

  }
  catch(error)
  {
    console_render_log("Client is not started.")
  }
}



async function PublishTestQoS1Message(){
  if(client == null)
  {
      console_render_log("Client is not started.")
      return;
  }

      const suback = await client.subscribe({
          subscriptions: [
              { qos: mqtt5.QoS.AtLeastOnce, topicFilter: qos1_topic },
              { qos: mqtt5.QoS.AtMostOnce, topicFilter: qos0_topic }
          ]
      });
      console_render_log('Suback result: ' + JSON.stringify(suback));

      const qos0PublishResult = await client.publish({
          qos: mqtt5.QoS.AtMostOnce,
          topicName: qos0_topic,
          payload: JSON.stringify("This is a qos 0 payload"),
          userProperties: [
              {name: "test", value: "userproperty"}
          ]
      });
      console_render_log('QoS 0 Publish result: ' + JSON.stringify(qos0PublishResult));

      const qos1PublishResult = await client.publish({
          qos: mqtt5.QoS.AtLeastOnce,
          topicName: qos1_topic,
          payload: JSON.stringify("This is a qos 1 payload")
      });
      console_render_log('QoS 1 Publish result: ' + JSON.stringify(qos1PublishResult));
}

var connection: mqtt.MqttClientConnection;


function buildconnection()
{
  let config_builder = iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(args.cert_file_path,
    args.key_file_path);

    config_builder.with_clean_session(false);
    config_builder.with_client_id("test-" + Math.floor(Math.random() * 100000000));
    config_builder.with_endpoint(args.endpoint);
    const config = config_builder.build();

    const client = new mqtt.MqttClient();
    return client.new_connection(config);
}

async function StopMqtt3()
{
  const timer = setInterval(() => { }, 60 * 1000);
  await connection.disconnect()
  // Allow node to die if the promise above resolved
  clearTimeout(timer);
}

async function StartMqtt3()
{
  const timer = setInterval(() => { }, 60 * 1000);

  connection = buildconnection();
  await connection.connect()

  // Allow node to die if the promise above resolved
  clearTimeout(timer);
}