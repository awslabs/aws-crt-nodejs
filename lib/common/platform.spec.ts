/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as platform from './platform'

test('platform.is_nodejs is correct', () => {
    expect(platform.is_nodejs()).not.toEqual(platform.is_browser());
});

test('platform.is_browser is correct', () => {
    expect(platform.is_browser()).not.toEqual(platform.is_nodejs());
});
