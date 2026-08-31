/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import node_deprecation_warning from '../common/node_deprecation_warning';

/**
 * Represents an object allocated natively inside the AWS CRT.
 * @internal
 */
export class NativeResource {
    constructor(private handle: any) {
        node_deprecation_warning.emitWarning();
    }

    /** @internal */
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
            node_deprecation_warning.emitWarning();
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
