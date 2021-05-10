/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const os = require('os');
const process = require("process");
const path = require("path");
const fs = require("fs");

const binaryDir = path.join('dist', 'bin', `${os.platform}-${os.arch}`, 'aws-crt-nodejs.node');
if (fs.existsSync(binaryDir)) {
    // Don't continue if the binding already exists (unless --rebuild is specified)
    process.exit(0);
}

// Run the build
require('./build.js');
