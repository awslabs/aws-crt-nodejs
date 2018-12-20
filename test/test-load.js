const crt = require('../build/Debug/aws-crt-nodejs');

console.log(crt.aws_nodejs_is_alpn_available());

let elg = crt.aws_nodejs_io_event_loop_group_new(1);
let bootstrap = crt.aws_nodejs_io_client_bootstrap_new(elg);
let tls_ctx = crt.aws_nodejs_io_client_tls_ctx_new(null, "AmazonRootCA1.pem", null, null, "iot-certificate.pem.crt", "iot-private.pem.key", null, null, null);
let client = crt.aws_nodejs_mqtt_client_new(bootstrap);
global.gc();
client = null;
global.gc();
tls_ctx = null;
global.gc();
bootstrap = null;
global.gc();
elg = null;
global.gc();
