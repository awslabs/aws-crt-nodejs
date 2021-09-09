/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const os = require('os');
const process = require("process");
const cmake = require("cmake-js");
const fs = require("fs");
const axios = require("axios");

async function downloadFile(fileUrl, outputLocationPath) {
    const writer = fs.createWriteStream(outputLocationPath);
    return axios({
        method: 'get',
        url: fileUrl,
        responseType: 'stream',
    }).then(response => {
        return new Promise((resolve, reject) => {
            response.data.pipe(writer);
            let error = null;
            writer.on('error', err => {
                error = err;
                writer.close();
                reject(err);
            });
            writer.on('close', () => {
                if (!error) {
                    resolve(true);
                }
            });
        });
    });
}


async function download_binary(url) {
    const binaryURL = url + "/bin/" + os.platform + "-" + os.arch + "/aws-crt-nodejs.node"
    return new Promise((resolve, reject) => {
        downloadFile(url, "./aws-crt-1.9.2-binary.tgz").then(() => {
            // TODO: Check the checksum, move to right directory and clean up the tmp file
            console.log("downloaded")
            resolve("success")
        }).catch((err) => {
            console.log("no binary found 111!")
            reject("failed")
        })
    });
}

async function fetch_native_code(url, version) {
    const sourceURL = url + "aws-crt-" + version + "-source.tgz"
    return new Promise((resolve, reject) => {
        downloadFile(sourceURL, "./aws-crt-" + version + "-source.tgz").then(() => {
            // TODO: Check the checksum unzip the file. move it to ../crt and clean up the tmp file
            console.log("downloaded")
            resolve("success")
        }).catch((err) => {
            console.log(err)
            reject("failed")
        })
    });
}


function build_locally() {
    let options = {
        CMAKE_EXPORT_COMPILE_COMMANDS: true,
        CMAKE_JS_PLATFORM: os.platform,
        CMAKE_JS_ARCH: os.arch,
        BUILD_TESTING: 'OFF',
        CMAKE_INSTALL_PREFIX: 'crt/install',
        CMAKE_PREFIX_PATH: 'crt/install',
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
}

if (fs.existsSync("crt/")) {
    // There is no native code, we are not building from source.
    (async () => {
        const url = "http://d332vdhbectycy.cloudfront.net/";
        let rawdata = fs.readFileSync('package.json');
        let package = JSON.parse(rawdata);
        const version = "1.9.2";
        // Step 1: Try to fetch the binary directly
        download_binary(url).catch((err) => {
            // Step 2: Try to fetch the binary directly, if it fails, build fails.
            fetch_native_code(url, version).then(() => {
                // kick off local build
                build_locally();
            })

        })
        console.log('Test!');
    })();
} else {
    // kick off local build
    build_locally();
}
