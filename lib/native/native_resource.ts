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

/** 
 * Represents an object allocated natively inside the AWS CRT. 
 * @internal
 */
export class NativeResource {
    constructor(private handle: any) { }

    native_handle() {
        return this.handle;
    }
}

/** @internal */
type Ctor<T> = new (...args: any[]) => T;

/** 
 * Represents an object allocated natively inside the AWS CRT which also
 * needs a node/TS base class
 * @internal
 */
export function NativeResourceMixin<T extends Ctor<{}>>(Base: T) {
    /** @internal */
    return class extends Base {
        /** @internal */
        _handle: any;
        /** @internal */
        constructor(...args: any[]) {
            const handle = args.shift();
            super(...args);
            this._handle = handle;
        }

        /** @internal */
        _super(handle: any) {
            this._handle = handle;
        }

        /** @internal */
        native_handle() {
            return this._handle;
        }
    }
}
