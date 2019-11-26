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
import { exit } from "process";
import * as path from "path";
import * as fs from "fs";
const cmake = require("cmake-js");

const binaryDir = path.join('dist', 'bin', `${platform}-${arch}`, 'aws-crt-nodejs.node');
if (fs.existsSync(binaryDir)) {
    // Don't continue if the binding already exists
    exit(0);
}

// Run the build
var buildSystem = new cmake.BuildSystem({
    target: "install",
    cMakeOptions: {
        CMAKE_EXPORT_COMPILE_COMMANDS: true,
        CMAKE_JS_PLATFORM: platform,
        CMAKE_JS_ARCH: arch,
    },
});
buildSystem.build();
