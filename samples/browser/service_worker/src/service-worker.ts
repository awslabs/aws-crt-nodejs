/// <reference no-default-lib="true"/>
/// <reference lib="es2015" />
/// <reference lib="webworker" />

import { auth } from "aws-crt";
import { Buffer } from "buffer";

addEventListener("message", async (event) => {
  self.Buffer = Buffer;
  console.log(`Message Received: ${event.data}`);

  console.log(auth)
});
