const crt = require('../build/Debug/aws-crt-nodejs');
const io = require('../dist/io');
const mqtt = require('../dist/mqtt');

console.log(io.is_alpn_available());

let elg = new io.EventLoopGroup(1);
let bootstrap = new io.ClientBootstrap(elg);
let tls_opt = io.TlsContextOptions.create_client_with_mtls("iot-certificate.pem.crt", "iot-private.pem.key")
tls_opt.override_default_trust_store(null, "AmazonRootCA1.pem")
tls_opt.alpn_list = "x-amzn-mqtt-ca"
let tls_ctx = new io.ClientTlsContext(tls_opt);
let client = new mqtt.Client(bootstrap, tls_ctx);

let conn = crt.aws_nodejs_mqtt_client_connection_new(
    client.native_handle(),
    tls_ctx.native_handle(),
    "a1ba5f1mpna9k5-ats.iot.us-east-1.amazonaws.com",
    io.is_alpn_available() ? 443 : 8883,
    "js-client",
    6000,
    null, /* on_connect */
    null, /* on_disconnect */
    undefined, /* will */
    null, /* username */
    null, /* password */
)

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

let done = false;
sleep(2000).then(() => done = true);

while(!done) { }

global.gc();
client = null;
global.gc();
tls_ctx = null;
global.gc();
bootstrap = null;
global.gc();
elg = null;
global.gc();
