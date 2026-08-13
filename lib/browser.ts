/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

// This is the entry point for the browser AWS CRT shim library

import './browser/polyfills';

/* common libs */
import * as cancel from './common/cancel';
import * as platform from './common/platform';
import * as promise from './common/promise';
import * as resource_safety from './common/resource_safety';

/* browser specific libs */
import * as io from './browser/io';
import * as mqtt from './browser/mqtt';
import * as mqtt5 from './browser/mqtt5';
import * as http from './browser/http';
import * as crypto from './browser/crypto';
import * as iot from './browser/iot';
import * as auth from './browser/auth';
import * as mqtt_request_response from './browser/mqtt_request_response';
import { ICrtError, CrtError } from './browser/error';

export {
    auth,
    cancel,
    crypto,
    http,
    io,
    iot,
    mqtt,
    mqtt_request_response,
    mqtt5,
    platform,
    promise,
    resource_safety,
    ICrtError,
    CrtError
};

/**
 * Emit a one-time runtime deprecation warning when running on a Node.js version
 * that aws-crt will stop supporting (Node.js < 20). Starting October 2026,
 * aws-crt follows the Node.js release schedule and requires Node.js 20.x or later.
 *
 * The browser entry point can still be executed under Node.js (bundlers, SSR,
 * react-native tooling, etc.), so we surface the same notice here. It is fully
 * guarded by platform.is_nodejs() and an emitWarning capability check, so it is a
 * no-op in an actual browser where `process`/`process.emitWarning` do not exist.
 * Fires at most once per process.
 */
(function warnUnsupportedNodeVersion() {
    if ((globalThis as any).AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING) {
        return;
    }
    if (!platform.is_nodejs() || typeof process.emitWarning !== 'function') {
        return;
    }
    const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
    if (Number.isNaN(nodeMajor) || nodeMajor >= 20) {
        return;
    }
    process.emitWarning(
         `\n\nStarting from October 2026, the AWS CRT for JavaScript (aws-crt-nodejs) will require Node.js 20.x or later.\n` +
        `Support for Node.js 14.x, 16.x, and 18.x will be dropped.\n\n` +
        `You are currently on Node.js v${process.versions.node}.\n\n` +
        `To continue receiving updates for AWS CRT NodeJs, bug fixes, and security ` +
        `updates, please upgrade to a supported version of Node.js (ideally the latest LTS).\n\n` +
        `More information: https://github.com/awslabs/aws-crt-nodejs`,
        { type: 'NodeDeprecationWarning' }
    );
})();
