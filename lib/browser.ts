/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

// This is the entry point for the browser AWS CRT shim library

/* common libs */
import * as platform from './common/platform';
import * as resource_safety from './common/resource_safety';
import { ICrtError } from './common/error';
import * as mqtt5_packet from './common/mqtt5_packet';

/* browser specific libs */
import * as io from './browser/io';
import * as mqtt from './browser/mqtt';
import * as mqtt5 from './browser/mqtt5';
import * as http from './browser/http';
import * as crypto from './browser/crypto';
import * as iot from './browser/aws_iot';
import * as auth from './browser/auth';
import { CrtError } from './browser/error';

export {
    io,
    mqtt,
    mqtt5,
    mqtt5_packet,
    http,
    crypto,
    auth,
    iot,
    platform,
    resource_safety,
    ICrtError,
    CrtError
};
