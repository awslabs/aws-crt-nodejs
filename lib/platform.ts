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

export function is_nodejs() {
    /* when bundling for webpack, always pretend to be the browser 
       NODE_ENV is set to 'webpack' by webpack.config.js */
    if (typeof process === 'object' &&
        typeof process.env === 'object' &&
        process.env.NODE_ENV === 'webpack') {
        return false;
    }
    return (typeof process === 'object' &&
        typeof process.versions === 'object' &&
        typeof process.versions.node !== 'undefined');
}

export function is_browser() {
    return !is_nodejs();
}
