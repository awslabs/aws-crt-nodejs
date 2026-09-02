/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Emits a one-time warning when aws-crt runs on a Node.js version that will be
 * unsupported starting January 2027. Suppress it in any of these ways:
 * @example
 * require('aws-crt').node_deprecation_warning.suppress = true;
 * @example
 * globalThis.AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING = true;
 * @example
 * // AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING=1 node app.js
 */

import * as platform from './platform';

/** Minimum Node.js major version aws-crt will continue to support. */
const MINIMUM_SUPPORTED_NODE_MAJOR_VERSION = 22;

/** Flag name shared by the global and environment-variable opt-outs. */
const SUPPRESS_FLAG = 'AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING';

// Ensures the warning is emitted at most once per process.
let hasWarned = false;

// True if suppressed via the global flag or env var (any non-empty value
// other than "0"/"false" counts).
function isSuppressedExternally(): boolean {
    if ((globalThis as any)[SUPPRESS_FLAG]) {
        return true;
    }
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

/** @internal */
interface NodeDeprecationWarningController {
    /** Set to `true` to suppress the warning in-process. Defaults to `false`. */
    suppress: boolean;

    /** Emits the warning once per process unless suppressed. Called internally. */
    emitWarning(): void;
}

const node_deprecation_warning: NodeDeprecationWarningController = {
    suppress: false,

    emitWarning(): void {
        if (node_deprecation_warning.suppress || isSuppressedExternally()) {
            return;
        }
        if (!platform.is_nodejs() || typeof process.emitWarning !== 'function') {
            return;
        }
        if (hasWarned || !isUnsupportedNodeVersion()) {
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
    },
};

export = node_deprecation_warning;
