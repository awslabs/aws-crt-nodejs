/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const os = require('os');
const process = require("process");
const cmake = require("cmake-js");
const axios = require("axios");
const path = require("path");
const tar = require('tar');
const fs = require("fs-extra");
const { v4: uuidv4 } = require('uuid');

async function download_file(fileUrl, outputLocationPath) {
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

async function fetch_native_code(url, version, path) {
    const sourceURL = url + "aws-crt-" + version + "-source.tgz"
    const tarballPath = path + "source.tgz"
    return new Promise((resolve, reject) => {
        download_file(sourceURL, tarballPath).then(() => {
            // TODO: Check the checksum unzip the file. move it to ../crt and clean up the tmp file
            fs.createReadStream(tarballPath)
                .on("error", () => { reject("failed") })
                .pipe(tar.x({
                    C: path
                }))
                .on("end", () => {
                    fs.copy(path + '/aws-crt-nodejs/crt', './crt_test')
                        .then(() => resolve("success"))
                        .catch(err => reject(err))
                });
        }).catch((err) => {
            reject(err)
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

if (!fs.existsSync("crt/")) {
    const tmp_path = path.join(__dirname, uuidv4() + "temp/");
    fs.mkdirSync(tmp_path);

    // There is no native code, we are not building from source.
    (async () => {
        // AWS common runtime aws-crt-nodejs cloudfront distribution.
        const url = "http://d332vdhbectycy.cloudfront.net/";
        let rawdata = fs.readFileSync('package.json');
        let package = JSON.parse(rawdata);
        const version = package["version"];
        fetch_native_code(url, version, tmp_path).then(() => {
            // clean up temp directory
            fs.rmSync(tmp_path, { recursive: true });
            // kick off local build
            build_locally();
        })
    })();
} else {
    // kick off local build
    build_locally();
}
