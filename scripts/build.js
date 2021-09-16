/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const os = require('os');
const fs = require("fs");
const crypto = require('crypto');
const process = require("process");
const path = require("path");

const cmake = require("cmake-js");
const axios = require("axios");
const tar = require('tar');

function downloadFile(fileUrl, outputLocationPath) {
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
                    resolve();
                }
            });
        });
    });
}

function checkChecksum(url, local_file) {
    return axios({
        method: 'get',
        url: url,
        responseType: 'text',
    }).then(response => {
        return new Promise((resolve, reject) => {
            const filestream = fs.createReadStream(local_file);
            const hash = crypto.createHash('sha256');
            filestream.on('readable', () => {
                // Only one element is going to be produced by the
                // hash stream.
                const data = filestream.read();
                if (data)
                    hash.update(data);
                else {
                    const checksum = hash.digest("hex")
                    if (checksum === response.data) {
                        resolve()
                    }
                    else {
                        reject(new Error("source code checksum mismatch"))
                    }
                }
            });
        });
    })
}

async function fetchNativeCode(url, version, path) {
    const sourceURL = `${url}/aws-crt-${version}-source.tgz`
    const tarballPath = path + "source.tgz";
    await downloadFile(sourceURL, tarballPath);
    const sourceChecksumURL = `${url}/aws-crt-${version}-source.sha256`;
    await checkChecksum(sourceChecksumURL, tarballPath);
    await tar.x({ file: tarballPath, strip: 2, C: nativeSourceDir });
}

function buildLocally() {
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
    return buildSystem.build();
}

async function buildFromRemoteSource(tmpPath) {
    if (fs.existsSync(nativeSourceDir)) {
        //teardown the local source code
        fs.rmSync(nativeSourceDir, { recursive: true });
    }
    fs.mkdirSync(tmpPath);
    fs.mkdirSync(nativeSourceDir);
    // AWS common runtime aws-crt-nodejs cloudfront distribution.
    let host = "https://d332vdhbectycy.cloudfront.net";
    if (process.env.CRT_BINARY_HOST) {
        // Use the host specified by user
        host = process.env.CRT_BINARY_HOST;
    }
    let rawData = fs.readFileSync('package.json');
    let package = JSON.parse(rawData);
    const version = package["version"];
    await fetchNativeCode(host, version, tmpPath);
    // Clean up temp directory
    fs.rmSync(tmpPath, { recursive: true });
    // Kick off local build
    await buildLocally();
    // Local build finished successfully, we don't need source anymore.
    fs.rmSync(nativeSourceDir, { recursive: true });
}

function checkDoDownload() {
    if (!fs.existsSync(".git/") || process.argv.includes('--source_download')) {
        return true;
    }
    return false;
}

// Makes sure the work directory is what we need
const workDir = path.join(__dirname, "../")
process.chdir(workDir);
const nativeSourceDir = "crt/"

if (checkDoDownload()) {
    const tmpPath = path.join(__dirname, `temp${crypto.randomBytes(16).toString("hex")}/`);
    try {
        buildFromRemoteSource(tmpPath);
    }
    catch (err) {
        // teardown tmpPath and source directory on failure
        fs.rmSync(tmpPath, { recursive: true });
        fs.rmSync(nativeSourceDir, { recursive: true });
        throw err;
    }
} else {
    // Kick off local build
    buildLocally();
}
