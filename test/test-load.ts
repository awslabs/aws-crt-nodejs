import * as io from '../lib/io';
import * as mqtt from '../lib/mqtt';
import { Md5Hash, hash_md5 } from '../lib/crypto';
import ResourceSafety = require('../lib/resource_safety');
import { TextDecoder } from 'util';

console.log('ALPN is available: ', io.is_alpn_available());

const test_topic = "test";

async function main() {
    let bootstrap = new io.ClientBootstrap();
    let tls_opt = io.TlsContextOptions.create_client_with_mtls("/home/ANT.AMAZON.COM/henso/source/4d169378e4.cert.pem", "/home/ANT.AMAZON.COM/henso/source/4d169378e4.private.key")
    tls_opt.override_default_trust_store(undefined, "/henso/source/AmazonRootCA1.pem")
    tls_opt.alpn_list = io.is_alpn_available() ? "x-amzn-mqtt-ca" : undefined;
    let tls_ctx = new io.ClientTlsContext(tls_opt);
    let client = new mqtt.Client(bootstrap, tls_ctx);

    await ResourceSafety.using(new mqtt.Connection(client), async (conn) => {
        try {
            const session_present = await conn.connect({
                client_id: "js-client",
                host_name: "a16523t7iy5uyg-ats.iot.us-east-1.amazonaws.com",
                port: io.is_alpn_available() ? 443 : 8883,
                keep_alive: 6000
            });
            console.log("connected", session_present);

            /* Subscribe, publish on suback, and resolve on message received */
            await new Promise(resolve => {
                conn.subscribe(test_topic, mqtt.QoS.AtLeastOnce, (topic, payload) => {
                    let decoder = new TextDecoder('utf-8');
                    let payload_text = decoder.decode(payload);
                    console.log("Got message, topic:", topic, ", payload:\n", payload_text);
                    resolve();
                }).
                then(sub_ack => {
                    console.log("subscribed to topic: " + sub_ack.topic + ", with packet id: " + sub_ack.packet_id 
                    + ", error code: " + sub_ack.error_code + ", with qos: " + sub_ack.qos);
                    conn.publish(test_topic, "Testing from JS client", mqtt.QoS.AtLeastOnce)
            });
            }).catch((reason) => {
                console.error('MQTT exception: ', reason);
            });

            await conn.unsubscribe(test_topic);
            console.log("unsubscribed");

            await conn.disconnect();
            console.log("disconnected");
        } catch (e) {
            console.error(e);
        }
    });
}

main().catch((reason) => {
    console.error("Exception in main(): ", reason);
})

const to_hash = 'ABC';
let md5 = new Md5Hash();
md5.update(to_hash);
const obj_digest = md5.digest();
console.log('Object Hash of', to_hash, ':', obj_digest);

let oneshot_digest = hash_md5(to_hash);
console.log('Oneshot Hash of', to_hash, ':', oneshot_digest);
