/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const fs = require("fs");
const crypto = require('crypto');
const utils = require('./build_utils');

module.exports = {

    // TODO - document this and only download axios if it does not already exist.

    axios: null,
    clean_up_axios: false,
    axios_version: "0.24.0",

    loadAxios: function () {
        const workDir = path.join(__dirname, "../../")

        process.chdir(__dirname);
        if (this.axios == null) {
            try {
                this.clean_up_axios = utils.npmDownloadAndInstallRuntimePackage("axios", this.axios_version);
                this.axios = require('axios');
            } catch (error) {
                console.log("ERROR: Could not download axios! Cannot build CRT");
                process.exit(1);
            }
        }
        process.chdir(workDir);
    },

    unloadAxios: function () {
        const workDir = path.join(__dirname, "../../")

        // Optional: To remove the dependency once you are finish with it, uncomment below
        // but note that you will may need to download it again upon a rebuild.
        // if (this.clean_up_axios) {
        //     process.chdir(__dirname);
        //     utils.npmDeleteRuntimePackage("axios");
        //     process.chdir(workDir);
        //     this.axios = null;
        // }
    },

    downloadFile: function (fileUrl, outputLocationPath) {
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
    },

    checkChecksum: function (url, local_file) {
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

}
