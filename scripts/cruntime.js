/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const os = require("os")
const child_process = require("child_process");

function getCRuntime() {
    const platform = os.platform();
    let cruntime = 'cruntime';
    if (platform === 'linux') {
        const lddOutput = child_process.execSync('ldd --version').toString();
        if (lddOutput.includes('musl')) {
            cruntime = 'musl';
        } else {
            cruntime = 'glibc';
        }
    }

    console.log(`C Runtime: ${cruntime}`);
    return cruntime
}

module.exports = getCRuntime;
