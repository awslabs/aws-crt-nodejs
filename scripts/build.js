/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const os = require('os');
const fs = require("fs");
const crypto = require('crypto');
const child_process = require("child_process");
const process = require("process");
const path = require("path");

const axios = require("axios");
const cmake = require("cmake-js");

// Versions of dyanmic modules if we need to load them:
let tar_version = "6.1.11"

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

/**
 * Downloads an NPM package for use dynamically - so it will only be loaded and used for this single script.
 * What it does under the hood is check for the npm package in the node modules, then in the npm list, and if
 * it does not find it in either location, it will download the package at that point, adding it as a dev-dependency.
 *
 * It it downloads it dynamically, then it will return true. This is so you can delete the package once you are done,
 * so it doesn't leave a zombie package in your node_modules. To remove the package, call npmDeleteRuntimePackage
 *
 * @param {*} package_name The name of the package you want to download (example: 'cmake-js')
 * @param {*} package_version The version of the package to download - leave blank for latest. (example: '6.3.2')
 * @returns True if the package was downloaded dynamically, otherwise false.
 */
function npmDownloadAndInstallRuntimePackage(package_name, package_version=null) {
    console.log("Looking for " + package_name + " as a dependency...");

    // Do we have it in node modules? If so, then use that!
    try {
        if (fs.existsSync("./node_modules/" + package_name)) {
            console.log("Found " + package_name + " in node_modules!");
            return false;
        }
    } catch (error) {}

    // Do we have it in our node list? If so, then use that!
    try {
        var list_output = child_process.execSync("npm list " + package_name, {encoding: "utf8"});
        if (list_output.indexOf(package_name) !== -1) {
            console.log("Found " + package_name + " in npm list!");
            return false;
        }
    } catch (error) {}

    // If it is not found in either, then download it into our node_modules
    try {
        console.log("Could not find " + package_name);
        console.log("Downloading " + package_name + " from npm for build...");
        // Try to intall the given package and ONLY the given package. Will throw an exception if there is an error.
        if (package_version != null) {
            child_process.execSync("npm install --no-package-lock --save-dev --ignore-scripts " + package_name + "@" + package_version);
        } else {
            child_process.execSync("npm install --no-package-lock --save-dev --ignore-scripts " + package_name);
        }
        return true;

    } catch (err) {
        console.log("ERROR - npm could not download " + package_name + "! " + package_name + " is required to build the CRT");
        throw err;
    }
}

/**
 * Tells NPM to uninstall a package. This should only be used to clean up a dynamic package downloaded with the
 * npmDownloadAndInstallRuntimePackage function, as otherwise it could remove a non-dynamic package.
 * @param {*} package_name The name of the package you want to delete (example 'cmake-js')
 */
function npmDeleteRuntimePackage(package_name) {
    console.log("Removing " + package_name + "...");
    try {
        child_process.execSync("npm uninstall " + package_name);
    } catch (err) {
        console.log("ERROR - npm could not remove " + package_name + "!");
        throw err;
    }
}


async function fetchNativeCode(url, version, path) {
    // Get tar if it doesn't exist
    var remove_tar_at_end = npmDownloadAndInstallRuntimePackage("tar", tar_version);
    var tar = require('tar');

    const sourceURL = `${url}/aws-crt-${version}-source.tgz`
    const tarballPath = path + "source.tgz";
    await downloadFile(sourceURL, tarballPath);
    const sourceChecksumURL = `${url}/aws-crt-${version}-source.sha256`;
    await checkChecksum(sourceChecksumURL, tarballPath);
    await tar.x({ file: tarballPath, strip: 2, C: nativeSourceDir });

    if (remove_tar_at_end == true) {
        npmDeleteRuntimePackage("tar");
        tar = null;
    }
}

function buildLocally() {
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
    return buildSystem.build();
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
        rmRecursive(tmpPath);
        rmRecursive(nativeSourceDir);
        throw err;
    }
} else {
    // Kick off local build
    buildLocally();
}
