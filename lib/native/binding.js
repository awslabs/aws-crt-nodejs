/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as path from 'path';
import { platform, arch } from 'os';
import { existsSync } from 'fs';
import { versions } from 'process';

const upgrade_string = "Please upgrade to node >=10.16.0, or use the provided browser implementation.";
if ('napi' in versions) {
    // @ts-ignore
    const napi_version = parseInt(versions['napi']);
    if (napi_version < 4) {
        throw new Error("The AWS CRT native implementation requires that NAPI version 4 be present. " + upgrade_string);
    }
} else {
    throw new Error("The current runtime is not reporting an NAPI version. " + upgrade_string);
}

const binary_name = 'aws-crt-nodejs';
const platformDir = `${platform}-${arch}`;

let source_root = path.resolve(__dirname, '..', '..');
const dist = path.join(source_root, 'dist');
if (existsSync(dist)) {
    source_root = dist;
}

const bin_path = path.resolve(source_root, 'bin');

const search_paths = [
    path.join(bin_path, platformDir, binary_name),
];

let binding;
for (const path of search_paths) {
    if (existsSync(path + '.node')) {
        binding = require(path);
        break;
    }
}

if (binding == undefined) {
    throw new Error("AWS CRT binary not present in any of the following locations:\n\t" + search_paths.join('\n\t'));
}

export default binding;
