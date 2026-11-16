/// <reference no-default-lib="true"/>
/// <reference lib="es2015" />
/// <reference lib="webworker" />

import { mqtt} from "aws-crt";
import { setupConnection, Mqtt5ClientPublish } from "./pub_sub";

addEventListener("install", async (event) => {
  console.log(`Service Worker Install: ${event.data}`);
  console.log(`Setup mqtt client`)
  await setupConnection()
});

addEventListener("message", async (event) => {
  console.log(`Message Received: ${event.data}`);
  await Mqtt5ClientPublish()
  console.log("Finish Publish Message")
});


