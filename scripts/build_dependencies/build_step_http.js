/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 *
 * This module provides HTTP download and checksum verification utilities for the
 * build process.
 */
const fs = require("fs");
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

/**
 * Honor HTTP_PROXY/HTTPS_PROXY/NO_PROXY like the previous axios-based downloader did.
 * When a proxy is configured, failure to construct the proxy agent (undici missing or
 * a malformed proxy URL) is an error: silently downloading directly would bypass the
 * configured egress path.
 */
let dispatcher = undefined;
function getDispatcher() {
    if (dispatcher === undefined) {
        const env = process.env;
        const proxy_configured = env.HTTP_PROXY || env.http_proxy || env.HTTPS_PROXY || env.https_proxy;
        if (proxy_configured) {
            try {
                dispatcher = new (require('undici').EnvHttpProxyAgent)();
            } catch (e) {
                throw new Error(`A proxy is configured via environment variables, but it could not be used: ${e.message}`);
            }
        } else {
            dispatcher = null;
        }
    }
    return dispatcher || undefined;
}

async function httpGet(url) {
    const response = await fetch(url, { dispatcher: getDispatcher() });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response;
}

module.exports = {

    /**
     * Downloads the file from the given file URL and places it in the given output location path.
     * @param {string} fileUrl The file to download
     * @param {string} outputLocationPath The location to store the downloaded file
     * @returns A promise for the file download
     */
    downloadFile: async function (fileUrl, outputLocationPath) {
        try {
            const response = await httpGet(fileUrl);
            await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(outputLocationPath));
            console.log("Source file download succeed!");
        } catch (err) {
            console.log("Source file download failed " + err);
            throw err;
        }
    },

    /**
     * Performs a checksum check on the given file. The checksum is downloaded from the given URL
     * and then the file given is checked using said checksum.
     * @param {string} url The URL containing the checksum
     * @param {string} local_file The file to check
     * @returns A promise for the result of the check
     */
    checkChecksum: async function (url, local_file) {
        const response = await httpGet(url);
        const expectedChecksum = (await response.text()).trim();
        const hash = crypto.createHash('sha256');
        await new Promise((resolve, reject) => {
            const filestream = fs.createReadStream(local_file);
            filestream.on('data', chunk => hash.update(chunk));
            filestream.on('end', resolve);
            filestream.on('error', reject);
        });
        if (hash.digest('hex') !== expectedChecksum) {
            throw new Error("source code checksum mismatch");
        }
    }
}
