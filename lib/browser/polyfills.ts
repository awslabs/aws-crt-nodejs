/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import buffer from 'buffer';
import process from 'process';

// Hack to get mqtt package working with Webpack 5
if (window) {
    (window as any).Buffer = buffer.Buffer;
    (window as any).process = process;
}

export {};
