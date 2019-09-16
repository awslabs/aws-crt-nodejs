/* Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

type Ctor<T> = new (...args: any[]) => T;

/** Represents an object allocated natively inside the AWS CRT. */
export class NativeResource {
    constructor(private handle: any) { }

    native_handle() {
        return this.handle;
    }
}

/** Represents an object allocated natively inside the AWS CRT which also
 * needs a node/TS base class
 */
export function NativeResourceMixin<T extends Ctor<{}>>(Base: T) {
    return class extends Base {
        _handle: any;
        constructor(...args: any[]) {
            const handle = args.shift();
            super(...args);
            this._handle = handle;
        }

        _super(handle: any) {
            this._handle = handle;
        }

        native_handle() {
            return this._handle;
        }
    }
}
