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

/**
 * Returns true if this script is running under nodejs
 *
 * @module aws-crt
 * @category System
 */
export function is_nodejs() {
    return (typeof process === 'object' &&
        typeof process.versions === 'object' &&
        typeof process.versions.node !== 'undefined');
}

/**
 * Returns true if this script is running in a browser
 *
 * @module aws-crt
 * @category System
 */
export function is_browser() {
    return !is_nodejs();
}

/**
 * Returns the package information for aws-crt-nodejs
 *
 * @module aws-crt
 * @category System
 */
export function package_info() {
    try {
        const pkg = require('../../package.json');
        return pkg;
    }
    catch (err) {
        return {
            name: 'aws-crt-nodejs',
            version: 'UNKNOWN'
        };
    }
}

/**
 * Returns the AWS CRT version
 *
 * @module aws-crt
 * @category System
 */
export function crt_version() {
    const pkg = package_info();
    return pkg.version;
}
