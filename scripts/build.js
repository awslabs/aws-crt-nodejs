/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const os = require("os")
const fs = require("fs");
const crypto = require('crypto');
const process = require("process");
const path = require("path");

const cmake = require("cmake-js");
const axios = require("axios");
const tar = require("tar");

const nativeSourceDir = "crt/";

function rmRecursive(rmPath) {
    let rmBasePath = path.basename(rmPath);
    if (rmBasePath == "." || rmBasePath == "..") {
        throw new Error("\".\" and \"..\" may not be removed");
    }
    var files = [];
    if (fs.existsSync(rmPath)) {
        if (fs.lstatSync(rmPath).isDirectory()) {
            files = fs.readdirSync(rmPath);
            files.forEach(function (file,) {
                var curPath = rmPath + "/" + file;
                if (fs.lstatSync(curPath).isDirectory()) {
                    rmRecursive(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(rmPath);
        }
        else {
            fs.unlinkSync(rmPath);
        }
    }
};

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

async function buildLocally() {
    const platform = os.platform();
    let arch = os.arch();

    // Allow cross-compile (so OSX can do arm64 or x64 builds) via:
    // --target-arch ARCH
    if (process.argv.includes('--target-arch')) {
        arch = process.argv[process.argv.indexOf('--target-arch') + 1];
    }

    // options for cmake.BuildSystem
    let options = {
        target: "install",
        debug: process.argv.includes('--debug'),
        arch: arch,
        out: path.join('build', `${platform}-${arch}`),
        cMakeOptions: {
            CMAKE_EXPORT_COMPILE_COMMANDS: true,
            CMAKE_JS_PLATFORM: platform,
            BUILD_TESTING: 'OFF',
            CMAKE_INSTALL_PREFIX: 'crt/install',
            CMAKE_PREFIX_PATH: 'crt/install',
        }
    }

    // We need to pass some extra flags to pull off cross-compiling
    // because cmake-js doesn't set everything we need.
    //
    // See the docs on `arch`: https://github.com/cmake-js/cmake-js/blob/v6.1.0/README.md?#runtimes
    // > Notice: on non-Windows systems the C++ toolset's architecture's gonna be used despite this setting.
    if (platform === 'darwin') {
        // What Node calls "x64", Apple calls "x86_64". They both agree on the term "arm64" though.
        options.cMakeOptions.CMAKE_OSX_ARCHITECTURES = (arch === 'x64') ? 'x86_64' : arch;
        options.cMakeOptions.CMAKE_OSX_DEPLOYMENT_TARGET = "10.9";
    }

    // Convert any -D arguments to this script to cmake -D arguments
    for (const arg of process.argv) {
        if (arg.startsWith('-D')) {
            const option = arg.substring(2).split('=')
            options.cMakeOptions[option[0]] = option[1]
        }
    }

    // Enable parallel build (ignored by cmake older than 3.12)
    process.env.CMAKE_BUILD_PARALLEL_LEVEL = `${Math.max(os.cpus().length, 1)}`;

    // Run the build
    var buildSystem = new cmake.BuildSystem(options);
    await buildSystem.build();
}

async function buildFromRemoteSource(tmpPath) {
    if (fs.existsSync(nativeSourceDir)) {
        //teardown the local source code
        rmRecursive(nativeSourceDir);
    }
    fs.mkdirSync(tmpPath);
    fs.mkdirSync(nativeSourceDir);
    // AWS common runtime aws-crt-nodejs cloudfront distribution.
    let host = "https://d332vdhbectycy.cloudfront.net";
    if (process.env.AWS_CRT_BINARY_HOST) {
        // Use the host specified by user
        host = process.env.AWS_CRT_BINARY_HOST;
    }
    let rawData = fs.readFileSync('package.json');
    const version = JSON.parse(rawData)["version"];
    await fetchNativeCode(host, version, tmpPath);
    // Clean up temp directory
    rmRecursive(tmpPath);
    // Kick off local build
    await buildLocally();
    // Local build finished successfully, we don't need source anymore.
    rmRecursive(nativeSourceDir);
}

function checkDoDownload() {
    if (!fs.existsSync(".git/") || process.argv.includes('--source_download')) {
        return true;
    }
    return false;
}

(async function main() {
    // Makes sure the work directory is what we need
    const workDir = path.join(__dirname, "../")
    process.chdir(workDir);

    if (checkDoDownload()) {
        const tmpPath = path.join(__dirname, `temp${crypto.randomBytes(16).toString("hex")}/`);
        try {
            buildFromRemoteSource(tmpPath);
        }
        catch (err) {
            // teardown tmpPath and source directory on failure
            rmRecursive(tmpPath);
            rmRecursive(nativeSourceDir);
            throw err;
        }
    } else {
        // kick off local build
        await buildLocally();
    }
})().catch((reason) => {
    console.error(reason)
    process.exitCode = 1
})
