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

import * as path from 'path';

let binding: any;
try { /* when in the lib folder, it's in the dist directory */
    const binding_path: string = path.resolve(__dirname, '..', '..', 'dist', 'native', 'aws-crt-nodejs');
    binding = require(binding_path);
}
catch (err) { /* When in the dist/lib folder, just leave lib */
    const binding_path: string = path.resolve(__dirname, '..', '..', 'native', 'aws-crt-nodejs');
    binding = require(binding_path);
}

export = binding;
