/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 *
 * A module containing some miscellaneous crt native memory queries
 *
 * @packageDocumentation
 * @module crt
 * @mergeTarget
 */

/**
 * Memory reporting is controlled by the AWS_CRT_MEMORY_TRACING environment
 * variable. Possible values are:
 * * 0 - No tracing
 * * 1 - Track active memory usage. Incurs a small performance penalty.
 * * 2 - Track active memory usage, and also track callstacks for every allocation.
 *   This incurs a performance penalty, depending on the cost of the platform's
 *   stack unwinding/backtrace API.
 * @category System
 */

import crt_native from './binding';

/**
 * If the ```AWS_CRT_MEMORY_TRACING``` is environment variable is set to 1 or 2,
 * will return the native memory usage in bytes. Otherwise, returns 0.
 * @returns The total allocated native memory, in bytes.
 *
 * @category System
 */
export function native_memory() {
    return crt_native.native_memory();
}

/**
 * Dumps outstanding native memory allocations. If the ```AWS_CRT_MEMORY_TRACING```
 * environment variable is set to 1 or 2, will dump all active native memory to
 * the console log.
 *
 * @category System
 */
export function native_memory_dump() {
    return crt_native.native_memory_dump();
}

/** Minimum Node.js major version aws-crt will continue to support. */
const MINIMUM_SUPPORTED_NODE_MAJOR_VERSION = 22;

/** Environment variable name for the suppression opt-out. */
const SUPPRESS_FLAG = 'AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING';

// Ensures the warning is emitted at most once per process.
let hasWarned = false;

// True if suppressed via the environment variable (any non-empty value
// other than "0"/"false" counts).
function isSuppressedExternally(): boolean {
    const envValue = process.env[SUPPRESS_FLAG];
    if (envValue === undefined || envValue === '') {
        return false;
    }
    return envValue !== '0' && envValue.toLowerCase() !== 'false';
}

// True if the current Node.js major version is below the supported minimum.
// Unparseable versions are treated as supported.
function isUnsupportedNodeVersion(): boolean {
    const majorVersion = parseInt(process.versions.node.split('.')[0], 10);
    return !Number.isNaN(majorVersion) && majorVersion < MINIMUM_SUPPORTED_NODE_MAJOR_VERSION;
}

/**
 * Emits a one-time warning when aws-crt runs on a Node.js version that will be unsupported starting January 2027.
 * Suppress it by setting the AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING environment variable, e.g.
 * @example
 * process.env.AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING=true
 * @example
 * AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING=1 node app.js
 * @internal
 */
export function emitNodeDeprecationWarning(): void{
    if(isSuppressedExternally()){
        return;
    }

    if(hasWarned || !isUnsupportedNodeVersion()){
        return;
    }

    hasWarned = true;
    const nodeVersion = process.versions.node;
    process.emitWarning(
        `\n\nStarting in January 2027, the AWS CRT for JavaScript will require Node.js 22.x or later.\n` +
        `Support for Node.js 14.x, 16.x, 18.x and 20.x will be dropped.\n\n` +
        `You are currently on Node.js v${nodeVersion}.\n\n` +
        `To continue receiving updates for AWS CRT for JavaScript, bug fixes, and security updates, ` +
        `please upgrade to a supported version of Node.js (ideally the latest LTS).\n\n` +
        `More information: https://github.com/awslabs/aws-crt-nodejs`,
        'NodeDeprecationWarning'
        );
}
