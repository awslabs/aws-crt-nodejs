/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

// This is the entry point for the AWS CRT nodejs native libraries

/* common libs */
import * as platform from './common/platform';
import * as resource_safety from './common/resource_safety';
import * as mqtt5_packet from './common/mqtt5_packet';
import { ICrtError } from './common/error';

/* node specific libs */
import * as crt from './native/crt';
import * as io from './native/io';
import * as mqtt from './native/mqtt';
import * as mqtt5 from './native/mqtt5';
import * as http from './native/http';
import * as crypto from './native/crypto';
import * as auth from './native/auth';
import * as iot from './native/aws_iot';
import * as checksums from './native/checksums';
import { CrtError } from './native/error';

export {
    crt,
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
    checksums,
    ICrtError,
    CrtError
};
