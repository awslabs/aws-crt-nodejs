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
const os = require('os');
const process = require("process");
const fs = require("fs");
const cmake = require("cmake-js");

// Copy the binding files over verbatim
fs.copyFileSync('lib/native/binding.js', 'dist/native/binding.js');
fs.copyFileSync('lib/native/binding.d.ts', 'dist/native/binding.d.ts');

// Run the build
var buildSystem = new cmake.BuildSystem({
    target: "install",
    debug: process.argv.includes('--debug'),
    cMakeOptions: {
        CMAKE_EXPORT_COMPILE_COMMANDS: true,
        CMAKE_JS_PLATFORM: os.platform,
        CMAKE_JS_ARCH: os.arch,
    },
});
buildSystem.build();
