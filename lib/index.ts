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
    platform,
    promise,
    resource_safety,
    ICrtError,
    CrtError
};
