/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import buffer from 'buffer';
import process from 'process';

// Workaround to get mqtt-js working with Webpack 5
if (typeof window !== 'undefined') {
    (window as any).Buffer = buffer.Buffer;
    (window as any).process = process;
    // NodeJS global shim workaround for Angular
    (window as any).global = window;
}

export {};
