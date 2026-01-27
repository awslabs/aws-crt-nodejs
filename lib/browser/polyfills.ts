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

    if (self.window) {
        // NodeJS global shim workaround for Angular
        (self.window as any).global = window
    }
}

export {};
