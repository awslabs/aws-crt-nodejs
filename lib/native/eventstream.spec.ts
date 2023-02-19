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

    await new Promise(resolve => setTimeout(resolve, 1000));

    connection.close();
}

/*
 * Quasi-success test where we kick off the connection (which will complete successfully) but immediately close it.
 *
 * TODO: because connect can only be called once, we could track the associated promise and reject it in this
 *  case, which would make things safer since you wouldn't be able to accidentally wait forever for something that
 *  will never complete.
 */
async function doConnectionSuccessTest3(config: eventstream.ClientConnectionOptions) {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(config);

    // intentionally do not await to try and beat the native connection setup with a close call
    connection.connect();

    connection.close();

    await new Promise(resolve => setTimeout(resolve, 1000));
}

/*
 * successful connection setup/teardown tests include some short waits to try and shake out any native race conditions
 * that might occur due to JS object finalization after close.  For the same reason, we scope the connection object
 * to a helper function, making finalization on the extern more likely.
 */

conditional_test(hasEchoServerEnvironment())('Connection Success Echo Server - await connect, close, and forget', async () => {
    await doConnectionSuccessTest1(makeGoodConfig());

    await new Promise(resolve => setTimeout(resolve, 1000));
});

conditional_test(hasEchoServerEnvironment())('Connection Success Echo Server - await connect, simulate remote close', async () => {
    await doConnectionSuccessTest2(makeGoodConfig());

    await new Promise(resolve => setTimeout(resolve, 1000));
});

conditional_test(hasEchoServerEnvironment())('Connection Success Echo Server - start connect, close, and forget', async () => {
    await doConnectionSuccessTest3(makeGoodConfig());

    await new Promise(resolve => setTimeout(resolve, 1000));
});

async function doConnectionFailureTest(config : eventstream.ClientConnectionOptions) {
    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(config);

    await expect(connection.connect()).rejects;

    connection.close();
}

conditional_test(hasEchoServerEnvironment())('Connection Failure Echo Server - bad host', async () => {
    let badConfig : eventstream.ClientConnectionOptions = makeGoodConfig();
    badConfig.hostName = "derp.notarealdomainseriously.org";

    await doConnectionFailureTest(badConfig);
});

conditional_test(hasEchoServerEnvironment())('Connection Failure Echo Server - bad port', async () => {
    let badConfig : eventstream.ClientConnectionOptions = makeGoodConfig();
    badConfig.port = 33333;

    await doConnectionFailureTest(badConfig);
});


