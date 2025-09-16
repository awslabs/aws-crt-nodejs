/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const path = require("path");
const fs = require("fs");
const crypto = require('crypto');
const utils = require('./build_utils');

module.exports = {

    /**
     * Initializes the fetch API for Node.js if needed
     */
    loadFetch: function () {
        const workDir = path.join(__dirname, "../../")
        process.chdir(workDir);
        // fetch is available globally in Node.js 18+, for older versions we'd need a polyfill
        if (typeof fetch === 'undefined') {
            console.warn('fetch API not available, please use Node.js 18+ or install a fetch polyfill');
        }
    },

    /**
     * Downloads the file from the given file URL and places it in the given output location path.
     * @param {*} fileUrl The file to download
     * @param {*} outputLocationPath The location to store the downloaded file
     * @returns A promise for the file download
     */
    downloadFile: async function (fileUrl, outputLocationPath) {
        try {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const writer = fs.createWriteStream(outputLocationPath);
            const reader = response.body.getReader();
            
            return new Promise((resolve, reject) => {
                let error = null;
                
                const pump = async () => {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            writer.write(Buffer.from(value));
                        }
                        writer.end();
                    } catch (err) {
                        error = err;
                        writer.destroy(err);
                    }
                };
                
                writer.on('error', err => {
                    error = err;
                    console.log("Source file download failed " + err);
                    reject(err);
                });
                
                writer.on('finish', () => {
                    if (!error) {
                        console.log("Source file download succeed!");
                        resolve();
                    }
                });
                
                pump();
            });
        } catch (error) {
            console.log("Source file download failed " + error);
            throw error;
        }
    },

    /**
     * Performs a checksum check on the given file. The checksum is downloaded from the given URL
     * and then the file given is checked using said checksum.
     * @param {*} url The URL containing the checksum
     * @param {*} local_file The file to check
     * @returns A promise for the result of the check
     */
    checkChecksum: async function (url, local_file) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const expectedChecksum = (await response.text()).trim();
            
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
                        if (checksum === expectedChecksum) {
                            resolve()
                        }
                        else {
                            reject(new Error("source code checksum mismatch"))
                        }
                    }
                });
            });
        } catch (error) {
            throw new Error(`Failed to fetch checksum: ${error.message}`);
        }
    }

}
