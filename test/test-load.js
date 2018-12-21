const crt = require('../build/Debug/aws-crt-nodejs');
const io = require('../dist/io');
const mqtt = require('../dist/mqtt');

console.log(io.is_alpn_available());

let elg = new io.EventLoopGroup(1);
let bootstrap = new io.ClientBootstrap(elg);
let tls_opt = io.TlsContextOptions.create_client_with_mtls("iot-certificate.pem.crt", "iot-private.pem.key")
tls_opt.override_default_trust_store(null, "AmazonRootCA1.pem")
let tls_ctx = new io.ClientTlsContext(tls_opt);
let client = new mqtt.Client(bootstrap, tls_ctx);
global.gc();
client = null;
global.gc();
tls_ctx = null;
global.gc();
bootstrap = null;
global.gc();
elg = null;
global.gc();
