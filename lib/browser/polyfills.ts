/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
import buffer from 'buffer';
import process from 'process';

// Workaround to get mqtt-js working with Webpack 5

if (typeof self !== 'undefined') {
    (self as any).Buffer = buffer.Buffer;
    (self as any).process = process;

    if (typeof self.window !== 'undefined') {
        // NodeJS global shim workaround for Angular
        (window as any).global = window;
    }
}

export { };
