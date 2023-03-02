/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as eventstream from './eventstream';
import {once} from "events";
import crt_native from "./binding";

jest.setTimeout(10000000);

function hasEchoServerEnvironment() : boolean {
    if (process.env.AWS_TEST_EVENT_STREAM_ECHO_SERVER_HOST === undefined) {
        return false;
    }

    if (process.env.AWS_TEST_EVENT_STREAM_ECHO_SERVER_PORT === undefined) {
        return false;
    }

    return true;
}

const conditional_test = (condition : boolean) => condition ? it : it.skip;

function closeNativeConnectionInternal(connection: eventstream.ClientConnection) {

    // invoke an internal close that bypasses the binding.  The result is an invocation that simulates a network
    // disruption from the binding's perspective
    crt_native.event_stream_client_connection_close_internal(connection.native_handle());
}

function makeGoodConfig() : eventstream.ClientConnectionOptions {
    let config : eventstream.ClientConnectionOptions = {
        hostName: process.env.AWS_TEST_EVENT_STREAM_ECHO_SERVER_HOST ?? "",
        port: parseInt(process.env.AWS_TEST_EVENT_STREAM_ECHO_SERVER_PORT ?? "0"),
    };

    return config;
}

/* Success test where we connect, wait for success, and close */
async function doConnectionSuccessTest1(config: eventstream.ClientConnectionOptions) {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(config);

    await connection.connect();

    connection.close();
}

/*
 * Success test where we connect, wait for success, simulate a remote close by a backdoor function that closes the
 * native event stream connection directly, wait for the disconnect event and close
 */
async function doConnectionSuccessTest2(config: eventstream.ClientConnectionOptions) {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(config);

    let disconnected = once(connection, eventstream.ClientConnection.DISCONNECTION);

    await connection.connect();

    // simulate a socket closed by the remote endpoint scenario
    closeNativeConnectionInternal(connection);

    await disconnected;

    await new Promise(resolve => setTimeout(resolve, 200));

    connection.close();
}

/*
 * Quasi-success test where we kick off the connection (which will complete successfully) but immediately close it.
 *
 */
async function doConnectionSuccessTest3(config: eventstream.ClientConnectionOptions) {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(config);

    // intentionally do not await to try and beat the native connection setup with a close call
    connection.connect();

    connection.close();

    await new Promise(resolve => setTimeout(resolve, 200));
}

/*
 * successful connection setup/teardown tests include some short waits to try and shake out any native race conditions
 * that might occur due to JS object finalization after close.  For the same reason, we scope the connection object
 * to a helper function, making finalization on the extern more likely.
 */

conditional_test(hasEchoServerEnvironment())('Eventstream transport connection success echo server - await connect, close, and forget', async () => {
    await doConnectionSuccessTest1(makeGoodConfig());

    await new Promise(resolve => setTimeout(resolve, 200));
});

conditional_test(hasEchoServerEnvironment())('Eventstream transport connection success echo server - await connect, simulate remote close', async () => {
    await doConnectionSuccessTest2(makeGoodConfig());

    await new Promise(resolve => setTimeout(resolve, 200));
});

conditional_test(hasEchoServerEnvironment())('Eventstream transport connection success echo server - start connect, close, and forget', async () => {
    await doConnectionSuccessTest3(makeGoodConfig());

    await new Promise(resolve => setTimeout(resolve, 200));
});

async function doConnectionFailureTest(config : eventstream.ClientConnectionOptions) {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(config);

    await expect(connection.connect()).rejects;

    connection.close();
}

conditional_test(hasEchoServerEnvironment())('Eventstream transport connection failure echo server - bad host', async () => {
    let badConfig : eventstream.ClientConnectionOptions = makeGoodConfig();
    badConfig.hostName = "derp.notarealdomainseriously.org";

    await doConnectionFailureTest(badConfig);
});

conditional_test(hasEchoServerEnvironment())('Eventstream transport connection failure echo server - bad port', async () => {
    let badConfig : eventstream.ClientConnectionOptions = makeGoodConfig();
    badConfig.port = 33333;

    await doConnectionFailureTest(badConfig);
});

async function doProtocolConnectionSuccessTest1() {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    await connection.connect();

    const connectResponse = once(connection, eventstream.ClientConnection.PROTOCOL_MESSAGE);

    let connectMessage: eventstream.Message = {
        type: eventstream.MessageType.Connect,
        headers: [
            eventstream.Header.newString(':version', '0.1.0'),
            eventstream.Header.newString('client-name', 'accepted.testy_mc_testerson')
        ]
    };

    await connection.sendProtocolMessage({
        message: connectMessage
    });

    let response : eventstream.MessageEvent = (await connectResponse)[0];
    let message : eventstream.Message = response.message;

    expect(message.type).toEqual(eventstream.MessageType.ConnectAck);
    expect(message.flags).toBeDefined();
    expect((message.flags ?? 0) & eventstream.MessageFlags.ConnectionAccepted).toEqual(eventstream.MessageFlags.ConnectionAccepted);

    connection.close();
}

conditional_test(hasEchoServerEnvironment())('Eventstream protocol connection success Echo Server - happy path', async () => {
    await doProtocolConnectionSuccessTest1();

    await new Promise(resolve => setTimeout(resolve, 200));
});

async function doProtocolConnectionSuccessTest2() {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    await connection.connect();

    let connectMessage: eventstream.Message = {
        type: eventstream.MessageType.Connect,
        headers: [
            eventstream.Header.newString(':version', '0.1.0'),
            eventstream.Header.newString('client-name', 'accepted.testy_mc_testerson')
        ]
    };

    connection.sendProtocolMessage({
        message: connectMessage
    });

    connection.close();

    await new Promise(resolve => setTimeout(resolve, 200));
}
conditional_test(hasEchoServerEnvironment())('Eventstream protocol connection success Echo Server - close while connecting', async () => {
    await doProtocolConnectionSuccessTest2();

    await new Promise(resolve => setTimeout(resolve, 200));
});

async function makeGoodConnection() : Promise<eventstream.ClientConnection> {
    return new Promise<eventstream.ClientConnection>(async (resolve, reject) => {
        try {
            let connection: eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

            await connection.connect();

            const connectResponse = once(connection, eventstream.ClientConnection.PROTOCOL_MESSAGE);

            let connectMessage: eventstream.Message = {
                type: eventstream.MessageType.Connect,
                headers: [
                    eventstream.Header.newString(':version', '0.1.0'),
                    eventstream.Header.newString('client-name', 'accepted.testy_mc_testerson')
                ]
            };

            await connection.sendProtocolMessage({
                message: connectMessage
            });

            let response: eventstream.MessageEvent = (await connectResponse)[0];
            let message: eventstream.Message = response.message;
            if (((message.flags ?? 0) & eventstream.MessageFlags.ConnectionAccepted) == 0) {
                reject();
            }

            resolve(connection);
        } catch (e) {
            reject();
        }
    });
}

function buildAllTypeHeaderSet() : Array<eventstream.Header> {
    var encoder = new TextEncoder();
    let buffer: ArrayBuffer = encoder.encode("Some test");
    let uuid: ArrayBuffer = encoder.encode("0123456789ABCDEF");

    let headers: Array<eventstream.Header> = [
        eventstream.Header.newBoolean('boolTrue', true),
        eventstream.Header.newBoolean('boolFalse', false),
        eventstream.Header.newByte('byte', 8),
        eventstream.Header.newInt16('int16', 32767),
        eventstream.Header.newInt32('int32', -65537),
        eventstream.Header.newInt64FromBigint('int64Bigint', BigInt(65536) * BigInt(65536) * BigInt(2)),
        eventstream.Header.newInt64FromNumber('int64Number', 65536 * 65536 * 2),
        eventstream.Header.newString('string', 'Hello'),
        eventstream.Header.newByteBuffer('binary', buffer),
        eventstream.Header.newTimeStampFromDate('date', new Date()),
        eventstream.Header.newTimeStampFromSecondsSinceEpoch('epochSeconds', Date.now()),
        eventstream.Header.newUUID('uuid', uuid)
    ];

    return headers;
}

function verifyEchoedHeaders(expectedHeaders : Array<eventstream.Header>, actualHeaders : Array<eventstream.Header>) {
    expectedHeaders.forEach((header: eventstream.Header) => {
        let actualHeader = actualHeaders.find((value: eventstream.Header) => { return value.name === header.name; });
        expect(actualHeader).toBeDefined();

        // @ts-ignore
        expect(header.type).toEqual(actualHeader.type);

        switch(header.type) {
            case eventstream.HeaderType.BooleanFalse:
            case eventstream.HeaderType.BooleanTrue:
                break;

            case eventstream.HeaderType.ByteBuffer:
            case eventstream.HeaderType.UUID:
                // @ts-ignore
                expect(Buffer.from(header.value as ArrayBuffer)).toEqual(Buffer.from(actualHeader.value as ArrayBuffer));
                break;

            default:
                // @ts-ignore
                expect(header.value).toEqual(actualHeader.value);
                break;

        }
    });
}

async function verifyPingRoundTrip(connection : eventstream.ClientConnection) : Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        try {
            const pingResponse = once(connection, eventstream.ClientConnection.PROTOCOL_MESSAGE);

            var encoder = new TextEncoder();
            let payload: ArrayBuffer = encoder.encode("A payload");

            let headers: Array<eventstream.Header> = buildAllTypeHeaderSet();

            let pingMessage: eventstream.Message = {
                type: eventstream.MessageType.Ping,
                headers: headers,
                payload: payload
            };

            await connection.sendProtocolMessage({
                message: pingMessage
            });

            let responseEvent: eventstream.MessageEvent = (await pingResponse)[0];
            let response: eventstream.Message = responseEvent.message;

            expect(response.type).toEqual(eventstream.MessageType.PingResponse);
            expect(response.headers).toBeDefined();

            verifyEchoedHeaders(headers, response.headers ?? []);

            expect(Buffer.from(payload)).toEqual(Buffer.from(response.payload as ArrayBuffer));

            resolve();
        } catch (e) {
            reject();
        }
    });
}

conditional_test(hasEchoServerEnvironment())('Eventstream connection success - send and receive all-header-types ping', async () => {

    let connection : eventstream.ClientConnection = await makeGoodConnection();

    await verifyPingRoundTrip(connection);

    connection.close();
});

conditional_test(hasEchoServerEnvironment())('Eventstream protocol connection failure Echo Server - bad version', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    await connection.connect();

    const connectResponse = once(connection, eventstream.ClientConnection.PROTOCOL_MESSAGE);

    let connectMessage: eventstream.Message = {
        type: eventstream.MessageType.Connect,
        headers: [
            eventstream.Header.newString(':version', '0.0.1'),
            eventstream.Header.newString('client-name', 'accepted.testy_mc_testerson')
        ]
    };

    await connection.sendProtocolMessage({
        message: connectMessage
    });

    let response : eventstream.MessageEvent = (await connectResponse)[0];
    let message : eventstream.Message = response.message;

    expect(message.type).toEqual(eventstream.MessageType.ConnectAck);
    expect(message.flags).toBeDefined();
    expect((message.flags ?? 0) & eventstream.MessageFlags.ConnectionAccepted).toEqual(0);

    connection.close();
});

conditional_test(hasEchoServerEnvironment())('Eventstream connection state failure - newStream while not connected', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    expect(() => {connection.newStream();}).toThrow();

    connection.close();
});

conditional_test(hasEchoServerEnvironment())('Eventstream connection state failure - sendProtocolMessage while not connected', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    let message : eventstream.Message = {
        type: eventstream.MessageType.Connect
    };

    await expect(connection.sendProtocolMessage({message: message} )).rejects.toThrow();

    connection.close();
});

conditional_test(hasEchoServerEnvironment())('Eventstream connection state failure - connect while connecting', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    let connected : Promise<void> = connection.connect();

    await expect(connection.connect()).rejects.toThrow();

    await connected;

    connection.close();
});

conditional_test(hasEchoServerEnvironment())('Eventstream connection state failure - connect while connected', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    await connection.connect();

    await expect(connection.connect()).rejects.toThrow();

    connection.close();
});

conditional_test(hasEchoServerEnvironment())('Eventstream connection state failure - connect while disconnected', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    let disconnected = once(connection, eventstream.ClientConnection.DISCONNECTION);

    await connection.connect();

    // simulate a socket closed by the remote endpoint scenario
    closeNativeConnectionInternal(connection);

    await disconnected;

    await expect(connection.connect()).rejects.toThrow();

    connection.close();
});

conditional_test(hasEchoServerEnvironment())('Eventstream connection state failure - newStream while disconnected', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    let disconnected = once(connection, eventstream.ClientConnection.DISCONNECTION);

    await connection.connect();

    // simulate a socket closed by the remote endpoint scenario
    closeNativeConnectionInternal(connection);

    await disconnected;

    expect(() => {connection.newStream();}).toThrow();

    connection.close();
});

conditional_test(hasEchoServerEnvironment())('Eventstream connection state failure - sendProtocolMessage while disconnected', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    let disconnected = once(connection, eventstream.ClientConnection.DISCONNECTION);

    await connection.connect();

    // simulate a socket closed by the remote endpoint scenario
    closeNativeConnectionInternal(connection);

    await disconnected;

    let message : eventstream.Message = {
        type: eventstream.MessageType.Connect
    };

    await expect(connection.sendProtocolMessage({message: message} )).rejects.toThrow();

    connection.close();
});

conditional_test(hasEchoServerEnvironment())('Eventstream connection state failure - connect while closed', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    connection.close();

    await expect(connection.connect()).rejects.toThrow();
});

conditional_test(hasEchoServerEnvironment())('Eventstream connection state failure - newStream while closed', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    await connection.connect();

    connection.close();

    expect(() => {connection.newStream();}).toThrow();
});

conditional_test(hasEchoServerEnvironment())('Eventstream connection state failure - sendProtocolMessage while closed', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    await connection.connect();

    connection.close();

    let message : eventstream.Message = {
        type: eventstream.MessageType.Connect
    };

    await expect(connection.sendProtocolMessage({message: message} )).rejects.toThrow();
});

conditional_test(hasEchoServerEnvironment())('Eventstream stream state failure - sendMessage before activation', async () => {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    await connection.connect();

    let stream : eventstream.ClientStream = connection.newStream();

    let message : eventstream.Message = {
        type: eventstream.MessageType.ApplicationMessage
    };

    await expect(stream.sendMessage({message: message} )).rejects.toThrow();

    stream.close();
    connection.close();
});

conditional_test(hasEchoServerEnvironment())('Eventstream stream success - create and close, no asserts', async () => {

    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(makeGoodConfig());

    await connection.connect();

    let stream : eventstream.ClientStream = connection.newStream();

    stream.close();
    connection.close();
});

async function openUnterminatedStream(connection: eventstream.ClientConnection) : Promise<eventstream.ClientStream> {
    return new Promise<eventstream.ClientStream>(async (resolve, reject) => {
        try {
            let stream : eventstream.ClientStream = connection.newStream();

            const activateResponse = once(stream, eventstream.ClientStream.STREAM_MESSAGE);

            let message : eventstream.Message = {
                type: eventstream.MessageType.ApplicationMessage
            };

            await stream.activate({
                operation: "awstest#EchoStreamMessages",
                message : message
            });

            let responseEvent: eventstream.MessageEvent = (await activateResponse)[0];
            let response: eventstream.Message = responseEvent.message;

            expect(response.type).toEqual(eventstream.MessageType.ApplicationMessage);

            resolve(stream);
        } catch (e) {
            reject();
        }
    });
}
conditional_test(hasEchoServerEnvironment())('Eventstream stream success - activate echo stream, wait for response, close properly', async () => {

    let connection : eventstream.ClientConnection = await makeGoodConnection();

    let stream : eventstream.ClientStream = await openUnterminatedStream(connection);

    stream.close();
    connection.close();
});