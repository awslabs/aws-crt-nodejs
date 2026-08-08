/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const os = require('os');
const process = require("process");
const path = require("path");
const fs = require("fs");
const getCRuntime = require("./cruntime");

// Advance notice: aws-crt is moving to a Node.js 20.x minimum in October 2026.
// Print a heads-up on install for anyone still on Node.js < 20. Informational
// only; the install continues to succeed until the October 2026 release.
(function noticeUpcomingNodeFloor() {
    const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
    if (!Number.isNaN(nodeMajor) && nodeMajor < 20) {
        console.warn(
            `\nNotice: Starting October 2026, the AWS CRT for JavaScript (aws-crt) will\n` +
            `require Node.js 20.x or later. Support for Node.js 14.x, 16.x, and 18.x\n` +
            `will be dropped. You are currently on Node.js v${process.versions.node}. Please plan to\n` +
            `upgrade to a supported Node.js version (ideally the latest LTS).\n` +
            `More information: https://github.com/awslabs/aws-crt-nodejs\n`
        );
    }
})();

if (!process.argv.includes('--rebuild')) {
    const binaryDir = path.join('dist', 'bin', `${os.platform()}-${os.arch()}-${getCRuntime()}`, 'aws-crt-nodejs.node');
    if (fs.existsSync(binaryDir)) {
        // Don't continue if the binding already exists (unless --rebuild is specified)
        console.log("The binding already exists, skip rebuilding. To rebuild the native addon, please run install.js with `--rebuild`")
        process.exit(0);
    }
}

// Run the build
require('./build.js');
