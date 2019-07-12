/*
 * Copyright 2010-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

/*
 * If you have a resource that you want typescript to enforce close is implemented
 * and/or you want to use the below 'using' function, then implement this interface.
 */ 
export interface ResourceSafe {
    close(): void;
}

/*
 * Use this function to create a resource in an async context. This will make sure the 
 * resources are cleaned up before returning.
 * 
 * example:   await using(res = new SomeResource()) {
 *                res.do_the_thing();
 *            }
 */
export async function using<T extends ResourceSafe>(resource : T, func: (resource: T) => void) {
    try {
        await func(resource);
    } finally {
        resource.close();
    }
}