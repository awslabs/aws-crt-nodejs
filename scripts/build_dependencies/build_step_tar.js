/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
 const process = require("process");
 const build_step_axios = require("./build_step_axios");
 const utils = require('./build_utils');

module.exports = {

    tar : null,

    /**
     * Will download the file at the given url with the given version to the given path using tar.
     * Will automatically either use or download the runtime-package for tar as needed.
     */
    performStep: async function (url, version, path) {
        if (utils.npmCheckIfPackageExists("tar") == true) {
            await this.buildSource(url, version, path);
        } else {
            await this.getModuleAndBuildSource(url, version, path);
        }
    },

    /**
     * Will download the file at the given url with the given version to the given path using tar.
     * Will ALWAYS download tar to the node_modules in scripts/build_dependencies/node_modules.
     */
    getPackageAndFetchNativeCode : async function (url, version, path) {
        const workDir = path.join(__dirname, "../../")

        process.chdir(__dirname);
        let remove_tar_at_end = false;
        if (this.tar == null) {
            try {
                remove_tar_at_end = utils.npmDownloadAndInstallRuntimePackage("tar", tar_version);
                this.tar = require('tar');
            } catch (error) {
                console.log("ERROR: Could not download tar! Cannot build CRT");
                process.exit(1);
            }
        }
        process.chdir(workDir);

        fetchNativeCode(url, version, path);

        // Optional: To remove the dependency once you are finish with it, uncomment below
        // but note that you will may need to download it again upon a rebuild.
        // if (remove_tar_at_end == true) {
        //     process.chdir(__dirname);
        //     utils.npmDeleteRuntimePackage("tar");
        //     process.chdir(workDir);
        //     this.tar = null;
        // }

    },

    /**
     * Will download the file at the given url with the given version to the given path using tar.
     * Will NOT download or check to see if cmake-js is in the node_modules or otherwise exists.
     */
    fetchNativeCode: async function (url, version, path) {

        build_step_axios.loadAxios();

        const sourceURL = `${url}/aws-crt-${version}-source.tgz`
        const tarballPath = path + "source.tgz";
        await build_step_axios.downloadFile(sourceURL, tarballPath);
        const sourceChecksumURL = `${url}/aws-crt-${version}-source.sha256`;
        await build_step_axios.checkChecksum(sourceChecksumURL, tarballPath);
        await this.tar.x({ file: tarballPath, strip: 2, C: nativeSourceDir });

        build_step_axios.unloadAxios();
    }
}
