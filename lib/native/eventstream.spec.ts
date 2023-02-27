/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as eventstream from './eventstream';
import {once} from "events";
import crt_native from "./binding";

jest.setTimeout(10000);

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

