/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * To suppress this message:
 * @example
 * require('aws-crt/dist/common/node_deprecation_warning').suppress = true;
 * @example
 * globalThis.AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING = true;
 */

import * as platform from './platform';

/**
 * Minimum Node.js major version that aws-crt will continue to support.
 */
const MINIMUM_SUPPORTED_NODE_MAJOR_VERSION = 22;

/**
 * Tracks whether the warning has already been emitted so that creating many
 * clients only ever produces a single warning per process.
 */
let hasWarned = false;

/** @internal */
interface NodeDeprecationWarningController {
    /**
     * Set to `true` to suppress the Node.js deprecation warning. Defaults to
     * `false`. Mutating this flag is the supported way for customers to opt
     * out of the warning.
     */
    suppress: boolean;

    /**
     * Emits the Node.js deprecation warning if all of the following are true:
     * - {@link suppress} is `false`
     * - `globalThis.AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING` is not truthy
     * - `AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING` env var is not set to a truthy value
     * - the code is running under Node.js
     * - the current Node.js major version is below the minimum supported version
     * - the warning has not already been emitted in this process
     *
     * Called internally on native resource creation; customers do not
     * normally need to call it directly.
     */
    emitWarning(): void;
}

const node_deprecation_warning: NodeDeprecationWarningController = {
    suppress: false,

    emitWarning(): void {
        // In-process opt-out via the exported controller.
        if (node_deprecation_warning.suppress) {
            return;
        }

        // Backwards-compatible global opt-out (set before requiring aws-crt).
        if ((globalThis as any).AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING) {
            return;
        }

        if (!platform.is_nodejs() || typeof process.emitWarning !== 'function') {
            return;
        }

        // Environment-variable opt-out, e.g.
        // `AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING=1 node app.js`.
        // Any non-empty value other than "0"/"false" suppresses the warning.
        const envSuppress = process.env.AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING;
        if (envSuppress !== undefined && envSuppress !== '' && envSuppress !== '0' && envSuppress.toLowerCase() !== 'false') {
            return;
        }

        if (hasWarned) {
            return;
        }

        const nodeVersion = process.versions.node;
        const parsedNodeVersion = parseInt(nodeVersion.split('.')[0], 10);
        if (Number.isNaN(parsedNodeVersion) || parsedNodeVersion >= MINIMUM_SUPPORTED_NODE_MAJOR_VERSION) {
            return;
        }

        hasWarned = true;

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
