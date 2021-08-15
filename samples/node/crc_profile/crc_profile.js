/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

const randomBytes = require('crypto').randomBytes;
const hrtime = require('process').hrtime;
const crt = require('aws-crt');

function crc_profile_size(size, profile_name, fn_name, checksum_fn) {
    console.log(`********************* ${fn_name} Profile ${profile_name} ************************************\n\n`);
    buffer = randomBytes(size);
    console.log('****** 128 byte chunks ******');
    crc_profile_chunks(buffer, 128, checksum_fn);
    console.log('****** 256 byte chunks ******');
    crc_profile_chunks(buffer, 256, checksum_fn);
    console.log('****** 512 byte chunks ******');
    crc_profile_chunks(buffer, 512, checksum_fn);
    console.log('******** oneshot run ********');
    start = hrtime()[1];
    checksum_fn(buffer);
    end = hrtime()[1];
    console.log(f`CRC streaming computation took ${end - start} ns\n`);
}

function crc_profile_chunks(buffer, chunk_size, checksum_fn) {
    output = 0;
    i = 0;
    prev = 0;
    start = hrtime()[1];
    while (i + chunk_size < len(buffer)) {
        prev = checksum_fn(buffer.slice(i, i + chunk_size), prev);
        i = i + chunk_size;
    }
    prev = checksum_fn(buffer.slice(i), prev);
    end = hrtime()[1];
    console.log(f`CRC streaming computation took ${end - start} ns\n`);
}

console.log("Starting profile run for Crc32 using implementation \n\n");
console.log(crt);
// crc_profile_size(1024, "1 KB", "CRC32", checksums.crc32);
// crc_profile_size(1024 * 64, "64 KB", "CRC32", checksums.crc32);
// crc_profile_size(1024 * 128, "128 KB", "CRC32", checksums.crc32);
// crc_profile_size(1024 * 512, "512 KB", "CRC32", checksums.crc32);
// console.log("Starting profile run for Crc32C using implementation \n\n");
// crc_profile_size(1024, "1 KB", "CRC32C", checksums.crc32c);
// crc_profile_size(1024 * 64, "64 KB", "CRC32C", checksums.crc32c);
// crc_profile_size(1024 * 128, "128 KB", "CRC32C", checksums.crc32c);
// crc_profile_size(1024 * 512, "512 KB", "CRC32C", checksums.crc32c);
