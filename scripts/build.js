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


function copyFileSync(source, target) {
    if (fs.existsSync(target)) {
        throw new Error(`${target} already exists, not overwriting it`)
    }
    fs.writeFileSync(target, fs.readFileSync(source));
}

function copyFolderRecursiveSync(source, target) {
    let files = [];

    if (!fs.existsSync(target)) {
        fs.mkdirSync(target);
    }
    if (fs.lstatSync(source).isDirectory()) {
        files = fs.readdirSync(source);
        files.forEach(function (file) {
            var curSource = path.join(source, file);
            var targetPath = path.join(target, file);
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursiveSync(curSource, targetPath);
            } else {
                copyFileSync(curSource, targetPath);
            }
        });
    }
}

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
                    resolve();
                }
            });
        });
    });
}

async function checkChecksum(url, local_file) {
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
    const tarballPath = path + "source.tgz"
    return new Promise((resolve, reject) => {
        downloadFile(sourceURL, tarballPath).then(() => {
            // Download checksum
            const sourceChecksumURL = `${url}/aws-crt-${version}-source.sha256`
            checkChecksum(sourceChecksumURL, tarballPath)
            fs.createReadStream(tarballPath)
                .on("error", () => { reject() })
                .pipe(tar.x({
                    C: path
                }))
                .on("end", () => {
                    try {
                        copyFolderRecursiveSync(`${path}/aws-crt-nodejs/crt`, "./crt");
                        resolve();
                    }
                    catch (err) { reject(err); }
                });
        }).catch((err) => {
            reject(err)
        })
    });
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
    buildSystem.build();
}

// Makes sure the work directory is what we need
const workDir = path.join(__dirname, "../")
process.chdir(workDir);

if (!fs.existsSync("crt/")) {
    const tmpPath = path.join(__dirname, `temp${crypto.randomBytes(16).toString("hex")}/`);
    fs.mkdirSync(tmpPath);

    // There is no native code, we are not building from source.
    (async () => {
        // AWS common runtime aws-crt-nodejs cloudfront distribution.
        let host = "https://d332vdhbectycy.cloudfront.net";
        if (process.env.CRT_BINARY_HOST) {
            // Use the host specified by user
            host = process.env.CRT_BINARY_HOST;
        }
        let rawData = fs.readFileSync('package.json');
        let package = JSON.parse(rawData);
        const version = package["version"];
        fetchNativeCode(host, version, tmpPath).then(() => {
            // Clean up temp directory
            fs.rmSync(tmpPath, { recursive: true });
            // Kick off local build
            buildLocally();
        })
    })();
} else {
    // Kick off local build
    buildLocally();
}
