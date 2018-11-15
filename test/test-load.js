const crt = require('../build/Debug/aws-crt-nodejs');

console.log(crt.io_is_alpn_available());

let elg = crt.io_event_loop_group_new(1);
let client = crt.mqtt_client_new(elg);
global.gc();
client = null;
global.gc();
elg = null;
global.gc();
