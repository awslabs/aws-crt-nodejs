import * as test_utils from "../../test/mqtt5";
import {Mqtt5Client, Mqtt5ClientConfig} from "./mqtt5";
import {HttpRequest} from "./http";
import * as mqtt5_packet from "../common/mqtt5_packet";
import {once} from "events";

jest.setTimeout(10000);

const conditional_test = (condition : boolean) => condition ? it : it.skip;

function createOperationFailureClient() : Mqtt5Client {
    let config : Mqtt5ClientConfig = {
        hostName: test_utils.ClientEnvironmentalConfig.WS_MQTT_HOST,
        port: test_utils.ClientEnvironmentalConfig.WS_MQTT_PORT,
        websocketHandshakeTransform: (request: HttpRequest, done: (error_code?: number) => void) => { done(0); }
    }

    return new Mqtt5Client(config);
}

async function testDisconnectValidationFailure(sessionExpiry: number) {
    let client : Mqtt5Client = createOperationFailureClient();

    let connectionSuccess = once(client, Mqtt5Client.CONNECTION_SUCCESS);

    client.start();

    await connectionSuccess;

    expect(() => {
        client.stop({
            reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection,
            sessionExpiryIntervalSeconds: sessionExpiry
        });
    }).toThrow();

    let stopped = once(client, Mqtt5Client.STOPPED);

    client.stop();
    await stopped;

    client.close();
}

conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Disconnection failure - session expiry underflow', async () => {
    await testDisconnectValidationFailure(-5);
});

conditional_test(test_utils.ClientEnvironmentalConfig.hasValidSuccessfulConnectionTestConfig(test_utils.SuccessfulConnectionTestType.WS_MQTT))('Disconnection failure - session expiry overflow', async () => {
    await testDisconnectValidationFailure(4294967296);
});