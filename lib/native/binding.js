/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */
import { platform, arch } from "os";
import * as path from 'path';
import * as fs from 'fs';

const binary_name = 'aws-crt-nodejs';
const platformDir = `${platform}-${arch}`;

let source_root = path.resolve(__dirname, '..', '..');
const dist = path.join(source_root, 'dist');
if (fs.existsSync(dist)) {
    source_root = dist;
}

const bin_path = path.resolve(source_root, 'bin');

const search_paths = [
    path.join(bin_path, 'native', binary_name),
    path.join(bin_path, platformDir, binary_name),
];

let binding;
for (const path of search_paths) {
    if (fs.existsSync(path + '.node')) {
        binding = require(path);
        break;
    }
}

if (binding == undefined) {
    throw new Error("AWS CRT binary not present in any of the following locations:\n\t" + search_paths.join('\n\t'));
}

export default binding;
