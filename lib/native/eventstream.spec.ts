/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as eventstream from './eventstream';
import {once} from "events";
import crt_native from "./binding";

jest.setTimeout(10000);

//const conditional_test = (condition : boolean) => condition ? it : it.skip;


function closeNativeConnectionInternal(connection: eventstream.ClientConnection) {

    // invoke an internal close that bypasses the binding.  The result is an invocation that simulates a network
    // disruption from the binding's perspective
    crt_native.event_stream_client_connection_close_internal(connection.native_handle());
}

function makeGoodConfig() : eventstream.ClientConnectionOptions {
    let config : eventstream.ClientConnectionOptions = {
        hostName: "127.0.0.1",
        port: 8033,
    };

    return config;
}

async function doScopedTest1(config: eventstream.ClientConnectionOptions) {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(config);

    await connection.connect();

    connection.close();
}

async function doScopedTest2(config: eventstream.ClientConnectionOptions) {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(config);

    let disconnected = once(connection, eventstream.ClientConnection.DISCONNECTION);

    await connection.connect();

    // simulate a socket closed by the remote endpoint scenario
    closeNativeConnectionInternal(connection);

    await disconnected;

    await new Promise(resolve => setTimeout(resolve, 1000));

    connection.close();
}

async function doScopedTest3(config: eventstream.ClientConnectionOptions) {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(config);

    // intentionally do not await to try and beat the native connection setup with a close call
    connection.connect();

    connection.close();

    await new Promise(resolve => setTimeout(resolve, 1000));
}

/*
 * successful connection setup/teardown tests include some short waits to try and shake out any native race conditions
 * that might occur due to JS object finalization after close
 */

test('Connection Success Echo Server - await connect, close, and forget', async () => {
    await doScopedTest1(makeGoodConfig());

    await new Promise(resolve => setTimeout(resolve, 1000));
});

test('Connection Success Echo Server - await connect, simulate remote close', async () => {
    await doScopedTest2(makeGoodConfig());

    await new Promise(resolve => setTimeout(resolve, 1000));
});

test('Connection Success Echo Server - start connect, close, and forget', async () => {
    await doScopedTest3(makeGoodConfig());

    await new Promise(resolve => setTimeout(resolve, 1000));
});

async function doConnectionFailureTest(config : eventstream.ClientConnectionOptions) {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(config);

    await expect(connection.connect()).rejects;

    connection.close();
}

test('Connection Failure Echo Server - bad host', async () => {
    let badConfig : eventstream.ClientConnectionOptions = makeGoodConfig();
    badConfig.hostName = "derp.notarealdomainseriously.org";

    await doConnectionFailureTest(badConfig);
});

test('Connection Failure Echo Server - bad port', async () => {
    let badConfig : eventstream.ClientConnectionOptions = makeGoodConfig();
    badConfig.port = 33333;

    await doConnectionFailureTest(badConfig);
});


