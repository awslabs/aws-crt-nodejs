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
     * Initializes the fetch polyfill for Node.js if needed
     */
    loadFetch: function () {
        // Node.js 18+ has fetch built-in, for older versions we'd need a polyfill
        if (typeof fetch === 'undefined') {
            global.fetch = require('node-fetch');
        }
    },

    /**
     * Downloads the file from the given file URL and places it in the given output location path.
     * @param {*} fileUrl The file to download
     * @param {*} outputLocationPath The location to store the downloaded file
     * @returns A promise for the file download
     */
    downloadFile: function (fileUrl, outputLocationPath) {
        const https = require('https');
        const http = require('http');
        const url = require('url');
        
        const writer = fs.createWriteStream(outputLocationPath);
        const parsedUrl = new url.URL(fileUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        return new Promise((resolve, reject) => {
            const request = client.get(fileUrl, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP error! status: ${response.statusCode}`));
                    return;
                }
                
                response.pipe(writer);
                let error = null;
                writer.on('error', err => {
                    error = err;
                    console.log("Source file download failed " + err);
                    writer.close();
                    reject(err);
                });
                writer.on('close', () => {
                    if (!error) {
                        console.log("Source file download succeed!");
                        resolve();
                    } else {
                        console.log("Source file download failed " + error);
                        reject(error);
                    }
                });
            });
            
            request.on('error', (err) => {
                reject(err);
            });
        });
    },

    /**
     * Performs a checksum check on the given file. The checksum is downloaded from the given URL
     * and then the file given is checked using said checksum.
     * @param {*} url The URL containing the checksum
     * @param {*} local_file The file to check
     * @returns A promise for the result of the check
     */
    checkChecksum: function (url, local_file) {
        const https = require('https');
        const http = require('http');
        const urlModule = require('url');
        
        const parsedUrl = new urlModule.URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        return new Promise((resolve, reject) => {
            const request = client.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP error! status: ${response.statusCode}`));
                    return;
                }
                
                let checksumData = '';
                response.on('data', (chunk) => {
                    checksumData += chunk;
                });
                
                response.on('end', () => {
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
                            if (checksum === checksumData.trim()) {
                                resolve()
                            }
                            else {
                                reject(new Error("source code checksum mismatch"))
                            }
                        }
                    });
                });
            });
            
            request.on('error', (err) => {
                reject(err);
            });
        });
    }

}
