import { io, mqtt, resource_safety } from '../lib';
import { AwsIotMqttConnectionConfigBuilder } from '../lib/native/aws_mqtt';
import { TextDecoder } from 'util';
const yargs = require('yargs');

const using = resource_safety.using;

const argv = yargs
    .option('cert_path', {
        alias: 'c',
        description: 'Path on disk to an MTLS certificate in PEM format',
        type: 'string',
        require: 'true'
    })
    .option('key_path', {
        alias: 'k',
        description: 'Path on disk to an MTLS private key in PEM format',
        type: 'string',
        require: 'true'
    })
    .option('ca_path', {
        alias: 'a',
        description: 'Path on disk to a certificate authority in PEM format',
        type: 'string',
        require: 'false'
    })
    .option('endpoint', {
        alias: 'e',
        description: 'Endpoint to connect to',
        type: 'string',
        require: 'true'
    })
    .help()
    .alias('help', 'h')
    .argv;

console.log('ALPN is available: ', io.is_alpn_available());

const test_topic = "test";

async function main() {
    let bootstrap = new io.ClientBootstrap();
    let config_builder = 
    AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(argv.cert_path, argv.key_path);
    config_builder
        .with_certificate_authority_from_path(undefined, argv.ca_path)
        .with_clean_session(false)
        .with_client_id('js-client')
        .with_endpoint(argv.endpoint);

    let client = new mqtt.Client(bootstrap);

    await using(new mqtt.Connection(client, config_builder.build()), async (conn) => {
        try {
            const session_present = await conn.connect();
            console.log("connected", session_present);

            /* Subscribe, publish on suback, and resolve on message received */
            await new Promise(resolve => {
                conn.subscribe(test_topic, mqtt.QoS.AtLeastOnce, (topic, payload) => {
                    let decoder = new TextDecoder('utf-8');
                    let payload_text = decoder.decode(payload);
                    console.log("Got message, topic:", topic, ", payload:\n", payload_text);
                    resolve();
                }).
                then((sub_ack : any) => {
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
            throw e;
        }
    });
}

main().catch((reason) => {
    console.error("Exception in main(): ", reason);
})
