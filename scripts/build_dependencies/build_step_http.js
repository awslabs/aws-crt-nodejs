/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 *
 * This module provides HTTP download and checksum verification utilities for the
 * build process.
 */
const fs = require("fs");
const crypto = require('crypto');
const https = require('https');
const http = require('http');

function getClient(url) {
    return url.startsWith('https') ? https : http;
}

function httpGet(url, redirectCount = 0) {
    if (redirectCount > 5) {
        return Promise.reject(new Error(`Too many redirects (max 5) for ${url}`));
    }
    return new Promise((resolve, reject) => {
        getClient(url).get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume(); // drain socket before following redirect
                return httpGet(response.headers.location, redirectCount + 1).then(resolve, reject);
            }
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                response.resume();
                return;
            }
            resolve(response);
        }).on('error', reject);
    });
}

module.exports = {

    /**
     * Downloads the file from the given file URL and places it in the given output location path.
     * @param {string} fileUrl The file to download
     * @param {string} outputLocationPath The location to store the downloaded file
     * @returns A promise for the file download
     */
    downloadFile: function (fileUrl, outputLocationPath) {
        return httpGet(fileUrl).then(response => {
            return new Promise((resolve, reject) => {
                const writer = fs.createWriteStream(outputLocationPath);
                response.pipe(writer);
                writer.on('error', err => {
                    console.log("Source file download failed " + err);
                    writer.close();
                    reject(err);
                });
                writer.on('close', () => {
                    console.log("Source file download succeed!");
                    resolve();
                });
            });
        });
    },

    /**
     * Performs a checksum check on the given file. The checksum is downloaded from the given URL
     * and then the file given is checked using said checksum.
     * @param {string} url The URL containing the checksum
     * @param {string} local_file The file to check
     * @returns A promise for the result of the check
     */
    checkChecksum: function (url, local_file) {
        return httpGet(url).then(response => {
            return new Promise((resolve, reject) => {
                let data = '';
                response.on('data', chunk => { data += chunk; });
                response.on('end', () => {
                    const expectedChecksum = data.trim();
                    const filestream = fs.createReadStream(local_file);
                    const hash = crypto.createHash('sha256');
                    filestream.on('data', chunk => hash.update(chunk));
                    filestream.on('end', () => {
                        const checksum = hash.digest('hex');
                        if (checksum === expectedChecksum) {
                            resolve();
                        } else {
                            reject(new Error("source code checksum mismatch"));
                        }
                    });
                    filestream.on('error', reject);
                });
                response.on('error', reject);
            });
        });
    }
}
