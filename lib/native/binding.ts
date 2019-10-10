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
import * as async_hooks from 'async_hooks';

let binding: any;
try { /* when in the lib folder, it's in the dist directory */
    const binding_path: string = path.resolve(__dirname, '..', '..', 'dist', 'native', 'aws-crt-nodejs');
    binding = require(binding_path);
}
catch (err) { /* When in the dist/lib folder, just leave lib */
    const binding_path: string = path.resolve(__dirname, '..', '..', 'native', 'aws-crt-nodejs');
    binding = require(binding_path);
}

// Skip the stream abstraction and any async writing, write directly to the C++
// bound function for writing to stderr
function crt_log(message: string) {
    (process as any)._rawDebug(message);
}

// https://nodejs.org/api/async_hooks.html
class AsyncMonitor {
    private active_handles = new Map<number, any>();
    private async_hook: async_hooks.AsyncHook;
    private ignore = false; // flag used to prevent re-entrant/recursive registration
    private log = (message: string) => { };
    private jest = (test && typeof (test) === 'function'); // is JestJS present?

    private constructor(private on_done: () => void, private debug = false) {
        if (this.debug) {
            this.log = (message: string) => {
                this.ignore = true;
                crt_log(message);
                this.ignore = false;
            }
        }
        this.async_hook = async_hooks.createHook({
            init: (async_id, type, trigger_async_id, resource) => {
                if (type === 'TIMERWRAP' || type == 'PROMISE' || this.ignore) return;
                const handle = {
                    type: type,
                    resource: resource,
                    trigger_async_id: trigger_async_id,
                    execution_id: async_hooks.executionAsyncId()
                };
                this.active_handles.set(async_id, handle);
                this.log(`NEW id: ${async_id} type: ${handle.type} resource: ${handle.resource} execution_id: ${handle.execution_id}`);
            },
            destroy: (async_id) => {
                if (this.ignore) return;
                const handle = this.active_handles.get(async_id);
                if (handle) {
                    this.log(`DEL id: ${async_id} type: ${handle.type} resource: ${handle.resource} execution_id: ${handle.execution_id}`);
                    this.active_handles.delete(async_id);
                    this.check_complete();
                }
            }
        });

        this.async_hook.enable();
    }

    private check_complete() {
        this.log(`HANDLES: ${this.active_handles.size}`);
        if (this.jest && this.active_handles.size <= 8) {
            for (const handle of this.active_handles.values()) {
                this.log(`HANDLE: type: ${handle.type} resource: ${handle.resource} execution_id: ${handle.execution_id}`);
            }
        }
        if (this.jest && this.active_handles.size == 2) {
            let found_log = false;
            let found_jest = false;
            for (const handle of this.active_handles.values()) {
                if (handle.type == 'console.log') {
                    found_log = true;
                }
                // Jest jams a 1 second timeout after the last test runs looking for
                // open handles.
                if (handle.type === 'Timeout' && handle.resource._idleTimeout === 1000) {
                    found_jest = true;
                }
                if (found_log && found_jest) {
                    this.on_done();
                }
            }
        }
        if (this.active_handles.size == 1) {
            for (const handle of this.active_handles.values()) {
                if (handle.type == 'console.log') {
                    this.on_done();
                }
            }
        }
    }

    static instance: AsyncMonitor;
    static install(on_done: () => void, debug = false) {
        AsyncMonitor.instance = new AsyncMonitor(on_done, debug);
    }
}

function clean_up() {
    binding.logger_clean_up();
}

AsyncMonitor.install(clean_up, true);

// Initialize the native module state once we've set up clean up
binding.logger_init(crt_log);

export = binding;

