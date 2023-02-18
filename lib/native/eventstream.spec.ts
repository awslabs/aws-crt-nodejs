/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

 import * as eventstream from './eventstream';
import {once} from "events";
import crt_native from "./binding";
import {ClientConnection} from "./eventstream";

jest.setTimeout(10000);

//const conditional_test = (condition : boolean) => condition ? it : it.skip;

/**
 * @internal
 * @ts-ignore
 */
function closeNativeConnectionInternal(connection: ClientConnection) {

    // invoke an internal close that bypasses the binding.  The result is an invocation that simulates a network
    // disruption from the binding's perspective
    crt_native.event_stream_client_connection_close_internal(connection.native_handle());
}

async function do_test() {
    let config : eventstream.ClientConnectionOptions = {
        hostName: "127.0.0.1",
        port: 8033,
    };

    let connection : eventstream.ClientConnection = new eventstream.ClientConnection(config);

    let disconnected = once(connection, eventstream.ClientConnection.DISCONNECTION);

    await connection.connect();

    closeNativeConnectionInternal(connection);

    await disconnected;
}

test('Connection Success - Echo Server', async () => {
    await do_test();

    await new Promise(resolve => setTimeout(resolve, 1000));
});
