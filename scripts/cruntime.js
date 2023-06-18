/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const os = require("os")
const child_process = require('child_process')

async function getCRuntime() {
    const platform = os.platform();
    let non_linux_runtime_tag = 'cruntime';
    if(platform !== "linux") {
        return non_linux_runtime_tag;
    }

    try {
        // sometimes, ldd's output goes to stderr, so capture that too
        // Using spawnSync because execSync treats any output to stderr as an exception.
        const spawnedProcess = child_process.spawnSync('ldd', ['--version'], { encoding: 'utf8' });
        const output = spawnedProcess.stdout + spawnedProcess.stderr;
        if (output.includes('musl')) {
            return 'musl';
        } else {
            return 'glibc';
        }
    } catch (error) {
        console.error(`Error executing ldd --version: ${error}`);
        return  'glibc';
    }

}

module.exports = getCRuntime;
