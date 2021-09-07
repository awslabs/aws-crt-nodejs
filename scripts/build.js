/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const os = require('os');
const process = require("process");
const cmake = require("cmake-js");

let options = {
    CMAKE_EXPORT_COMPILE_COMMANDS: true,
    CMAKE_JS_PLATFORM: os.platform,
    CMAKE_JS_ARCH: os.arch,
    BUILD_TESTING: 'OFF',
    CMAKE_INSTALL_PREFIX: 'crt/install',
    CMAKE_PREFIX_PATH: 'crt/install',
    CMAKE_VERBOSE_MAKEFILE: true,
}

// Convert any -D arguments to this script to cmake -D arguments
for (const arg of process.argv) {
    if (arg.startsWith('-D')) {
        const option = arg.substring(2).split('=')
        options[option[0]] = option[1]
    }
}

// Run the build
var buildSystem = new cmake.BuildSystem({
    target: "install",
    debug: process.argv.includes('--debug'),
    cMakeOptions: options,
});
buildSystem.build();
