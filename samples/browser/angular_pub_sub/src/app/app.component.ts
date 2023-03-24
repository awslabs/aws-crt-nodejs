import { Component } from '@angular/core';

import { mqtt, iot, auth } from "aws-crt";
import * as AWS from "aws-sdk";
import * as sampleConfig from "./config";

function logMessage(message: String) {
  let logDiv = document.getElementById("log");
  if (logDiv != null) {
    logDiv.innerHTML += "<br />" + message;
  }
  console.log(message);
}


interface AWSCognitoCredentialOptions {
  IdentityPoolId: string,
  Region: string
}


export class AWSCognitoCredentialsProvider extends auth.CredentialsProvider {
  private options: AWSCognitoCredentialOptions;
  private source_provider: AWS.CognitoIdentityCredentials;
  private aws_credentials: auth.AWSCredentials;
  constructor(options: AWSCognitoCredentialOptions, expire_interval_in_ms?: number) {
    super();
    this.options = options;
    AWS.config.region = options.Region;
    this.source_provider = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: options.IdentityPoolId
    });
    this.aws_credentials =
    {
      aws_region: options.Region,
      aws_access_id: this.source_provider.accessKeyId,
      aws_secret_key: this.source_provider.secretAccessKey,
      aws_sts_token: this.source_provider.sessionToken
    }

    setInterval(async () => {
      await this.refreshCredentialAsync();
    }, expire_interval_in_ms ?? 3600 * 1000);
  }

  override getCredentials(): auth.AWSCredentials | undefined {
    return this.aws_credentials;
  }

  async refreshCredentialAsync() {
    return new Promise<AWSCognitoCredentialsProvider>((resolve, reject) => {
      this.source_provider.get((err) => {
        if (err) {
          logMessage("Failed to get cognito credentials.");
          reject("Failed to get cognito credentials.");
        }
        else {
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


async function connect_websocket(provider: auth.CredentialsProvider) {
  return new Promise<mqtt.MqttClientConnection>((resolve, reject) => {
    let config = iot.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket()
      .with_clean_session(true)
      .with_client_id(`pub_sub_sample(${new Date()})`)
      .with_endpoint(sampleConfig.AWS_IOT_ENDPOINT)
      .with_credential_provider(provider)
      .with_use_websockets()
      .with_keep_alive_seconds(30)
      .build();

    logMessage("Connecting websocket...");
    const client = new mqtt.MqttClient();
    const connection = client.new_connection(config);

    connection.on("connect", (session_present) => {
      logMessage("Connection made!");
      resolve(connection);
    });
    connection.on("interrupt", (error) => {
      logMessage(`Connection interrupted: error=${error}`);
    });
    connection.on("resume", (return_code, session_present) => {
      logMessage(`Resumed: rc: ${return_code} existing session: ${session_present}`);
    });
    connection.on("disconnect", () => {
      logMessage("Disconnected");
    });
    connection.on("error", (error) => {
      reject(error);
    });
    connection.connect();
  });
}


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'Angular Example';
  provider = new AWSCognitoCredentialsProvider(
    {
      IdentityPoolId: sampleConfig.AWS_COGNITO_IDENTITY_POOL_ID,
      Region: sampleConfig.AWS_REGION
    }
  );
  connection: Promise<mqtt.MqttClientConnection> = null as any;
  clientSetup: boolean = false;
  sampleTopic: string = "/test/me/senpai";
  sampleQoS: mqtt.QoS = mqtt.QoS.AtLeastOnce;
  sampleMessageCount: number = 0;

  async connect() {
    if (this.clientSetup == false) {
      await this.provider.refreshCredentialAsync();
      this.connection = connect_websocket(this.provider);
      this.clientSetup = true;

      // Subscribe to the topic
      logMessage("Subscribing...");
      (await this.connection).subscribe(
        this.sampleTopic,
        this.sampleQoS,
        (topic, payload, dup, qos, retain) => {
          const decoder = new TextDecoder("utf8");
          let message = decoder.decode(new Uint8Array(payload));
          logMessage(`Message received: topic=${topic} message=${message}`);
        }
      );
      logMessage("Subscribed...");
    }
    else {
      logMessage("Client already connected");
    }
  }

  async disconnect() {
    if (this.clientSetup == true) {
      // Unsubscribe
      logMessage("Unsubscribing...");
      (await this.connection).unsubscribe(this.sampleTopic);
      logMessage("Unsubscribed...");

      // Disconnect
      logMessage("Disconnecting websocket...");
      (await this.connection).disconnect();
      this.clientSetup = false;
    }
    else {
      logMessage("Client already disconnected");
    }
  }

  async publish() {
    if (this.clientSetup == true) {
      logMessage(`start publish`)
      this.sampleMessageCount += 1;
      (await this.connection).publish(this.sampleTopic, `NOTICE ME {${this.sampleMessageCount}}`, this.sampleQoS);
    }
    else {
      logMessage("Client is not connected");
    }
  }

}
