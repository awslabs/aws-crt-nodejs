/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as checksums from './checksums';
const hrtime = require('process').hrtime;
const randomBytes = require('crypto').randomBytes;
import { Hashable } from "../common/crypto";


// test('crc32_zeros_one_shot', () => {
//     const arr = new Uint8Array(32);
//     const output = checksums.crc32(arr);
//     const expected = 0x190A55AD
//     expect(output).toEqual(expected);
// });

// test('crc32_zeros_iterated', () => {
//     let output = 0
//     for (let i = 0; i < 32; i++) {
//         output = checksums.crc32(new Uint8Array(1), output)
//     }
//     const expected = 0x190A55AD;
//     expect(output).toEqual(expected);
// });

// test('crc32_values_one_shot', () => {
//     const arr = Uint8Array.from(Array(32).keys());
//     const output = checksums.crc32(arr);
//     const expected = 0x91267E8A
//     expect(output).toEqual(expected);
// });

// test('crc32_values_iterated', () => {
//     let output = 0
//     for (let i = 0; i < 32; i++) {
//         output = checksums.crc32(Uint8Array.from([i]), output);
//     }
//     const expected = 0x91267E8A;
//     expect(output).toEqual(expected);
// });

// test('crc32_large_buffer', () => {
//     const arr = new Uint8Array(25 * 2 ** 20);
//     const output = checksums.crc32(arr);
//     const expected = 0x72103906
//     expect(output).toEqual(expected);
// });

// test('crc32c_zeros_one_shot', () => {
//     const arr = new Uint8Array(32);
//     const output = checksums.crc32c(arr);
//     const expected = 0x8A9136AA
//     expect(output).toEqual(expected);
// });

// test('crc32c_zeros_iterated', () => {
//     let output = 0
//     for (let i = 0; i < 32; i++) {
//         output = checksums.crc32c(new Uint8Array(1), output)
//     }
//     const expected = 0x8A9136AA;
//     expect(output).toEqual(expected);
// });

// test('crc32c_values_one_shot', () => {
//     const arr = Uint8Array.from(Array(32).keys());
//     const output = checksums.crc32c(arr);
//     const expected = 0x46DD794E
//     expect(output).toEqual(expected);
// });

// test('crc32c_values_iterated', () => {
//     let output = 0
//     for (let i = 0; i < 32; i++) {
//         output = checksums.crc32c(Uint8Array.from([i]), output);
//     }
//     const expected = 0x46DD794E;
//     expect(output).toEqual(expected);
// });

// test('crc32c_large_buffer', () => {
//     const arr = new Uint8Array(25 * 2 ** 20);
//     const output = checksums.crc32c(arr);
//     const expected = 0xfb5b991d
//     expect(output).toEqual(expected);
// });

test('crc benchmark', () => {
    console.log("crc32")
    profile(2 ** 22, [2 ** 22, 2 ** 20, 2 ** 10, 2 ** 9, 2 ** 8, 2 ** 7], 1000, 1, checksums.crc32)
    console.log("crc32c")
    profile(2 ** 22, [2 ** 22, 2 ** 20, 2 ** 10, 2 ** 9, 2 ** 8, 2 ** 7], 1000, 1, checksums.crc32c)
    expect(1).toEqual(1);
});

//  Welfords online algorithm
let update_summary = (count: number, { "mean": mean, "M2": M2, "min": my_min, "max": my_max }: { "mean": number, "M2": number, "min": number, "max": number }, new_value: number) => {
    let delta = new_value - mean;
    mean += delta / count;
    let delta2 = new_value - mean;
    M2 += delta * delta2;
    my_min = Math.min(my_min, new_value);
    my_max = Math.max(my_max, new_value);
    return { "mean": mean, "M2": M2, "min": my_min, "max": my_max };
}

let finalize_summary = (count: number, M2: number) => {
    return M2 / count;
}
// # mean, variance, min, max, chunk_size, num_chunks

// { "chunk_size": number, "mean": number, "variance": number, "min": number, "max": number }
let print_stats = (stats: Array<Object>) => {
    for (let i = 0; i < stats.length; i++) {
        console.log(`chunk size: ${stats[i]["chunk_size"]}, min: ${stats[i]["min"]}, max: ${stats[i]["max"]}, mean: ${stats[i]["mean"]}, variance: ${stats[i]["variance"]}`);
    }
}


let profile_sequence_chunks = (to_hash: string, chunk_size: number, iterations: number, checksum_fn: (data: Hashable, previous?: number) => number) => {
    let stats = { "mean": 0, "M2": 0, "min": Number.MAX_SAFE_INTEGER, "max": 0 };
    for (let x = 0; x < iterations; x++) {
        let start = hrtime()[1];
        let i = 0;
        let prev = 0;
        while (i + chunk_size < to_hash.length) {
            prev = checksum_fn(to_hash.slice(i, i + chunk_size), prev);
            i = i + chunk_size;
        }
        prev = checksum_fn(to_hash.slice(i), prev);
        let end = hrtime()[1];
        stats = update_summary(x + 1, stats, end - start);
    }
    return stats["mean"];
}

let donothing = (n: number) => {
    n + 1;
}

let profile_sequence = (to_hash: string, chunk_sizes: Array<number>, iterations_per_sequence: number, checksum_fn: (data: Hashable, previous?: number) => number) => {
    let times = [];
    // for (const size in chunk_sizes) {
    for (let i = 0; i < chunk_sizes.length; i++) {
        let toss = profile_sequence_chunks(to_hash, chunk_sizes[i], iterations_per_sequence, checksum_fn);
        donothing(toss);

        times.push(profile_sequence_chunks(to_hash, chunk_sizes[i], iterations_per_sequence, checksum_fn));
    }
    return times
}

let profile = (size: number, chunk_sizes: Array<number>, num_sequences: number, iterations_per_sequence: number, checksum_fn: (data: Hashable, previous?: number) => number) => {
    let stats = [];
    for (let i = 0; i < chunk_sizes.length; i++) {
        stats.push({ "mean": 0, "M2": 0, "min": Number.MAX_SAFE_INTEGER, "max": 0 });
    }
    for (let x = 0; x < num_sequences; x++) {
        let buffer = randomBytes(size);
        // if (x % 100 == 0) {
        //     console.log(`count: ${x}`)
        // }
        let times = profile_sequence(buffer, chunk_sizes, iterations_per_sequence, checksum_fn);
        for (let i = 0; i < stats.length; i++) {
            stats[i] = update_summary(x + 1, stats[i], times[i]);
        }
    }
    for (let i = 0; i < stats.length; i++) {
        stats[i]["variance"] = finalize_summary(num_sequences, stats[i]["M2"])
        stats[i]["chunk_size"] = chunk_sizes[i];
    }
    print_stats(stats)
}
