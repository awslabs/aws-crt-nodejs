/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

// This is the entry point for the AWS CRT nodejs native libraries

/* common libs */
import * as cancel from './common/cancel';
import * as platform from './common/platform';
import * as promise from './common/promise';
import * as resource_safety from './common/resource_safety';

/* node specific libs */
import * as auth from './native/auth';
import * as checksums from './native/checksums';
import * as crt from './native/crt';
import * as crypto from './native/crypto';
import * as eventstream from './native/eventstream';
import * as http from './native/http';
import * as io from './native/io';
import * as iot from './native/iot';
import * as mqtt from './native/mqtt';
import * as mqtt5 from './native/mqtt5';
import * as mqtt_request_response from './native/mqtt_request_response';
import { ICrtError, CrtError } from './native/error';

export {
    auth,
    cancel,
    checksums,
    crypto,
    crt,
    eventstream,
    http,
    io,
    iot,
    mqtt,
    mqtt5,
    mqtt_request_response,
    platform,
    promise,
    resource_safety,
    ICrtError,
    CrtError
};

/**
 * Emit a one-time runtime deprecation warning when running on a Node.js version
 * that aws-crt will stop supporting. Starting October 2026, aws-crt follows the
 * Node.js release schedule and requires Node.js 20.x or later.
 *
 * This runs at import time (rather than only at install time) because package
 * managers such as npm 7+ suppress dependency install-script output by default,
 * so an install-time notice is rarely seen. Using process.emitWarning with the
 * standard 'NodeDeprecationWarning' type lets consumers silence it with
 * --no-deprecation or escalate with --throw-deprecation, and mirrors the AWS SDK
 * for JavaScript (v3) runtime notice. It fires at most once per process.
 */
(function warnUnsupportedNodeVersion() {
    if ((globalThis as any).AWS_CRT_NODEJS_SUPPRESS_NODE_DEPRECATION_WARNING) {
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
