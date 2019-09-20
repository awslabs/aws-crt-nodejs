/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

// This is the entry point for the browser AWS CRT shim library

/* common libs */
import * as platform from './common/platform';
import * as resource_safety from './common/resource_safety';

/* browser specific libs */
import * as io from './browser/io';
import * as mqtt from './browser/mqtt';
import * as http from './browser/http';
import * as crypto from './browser/crypto';
import * as iot from './browser/aws_iot';
import { CrtError } from './browser/error';

export {
    io,
    mqtt,
    http,
    crypto,
    iot,
    platform,
    resource_safety,
    CrtError
};
