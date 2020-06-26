/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
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
