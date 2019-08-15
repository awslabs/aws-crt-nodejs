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

/// @preserve <reference path="browser" />

/* common libs */
import * as platform from './platform';
import * as resource_safety from './resource_safety';

/* platform specific libs */
import * as io from './browser/io';
import * as mqtt from './browser/mqtt';
import * as crypto from './browser/crypto';

export {
    io,
    mqtt,
    crypto,
    platform,
    resource_safety,
};
