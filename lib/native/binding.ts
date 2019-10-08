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

// Ensure that clean up will be called before the process exits for any reason to
// allow us to avoid GC/uv handle hangs
// function clean_up() {
//     console.log("SHUTDOWN");
//     context_scope = null;
//     global.gc();
// }

// process.on('SIGABRT', clean_up);
// process.on('SIGTERM', clean_up);
// process.on('SIGUSR1', clean_up);
// process.on('SIGUSR2', clean_up);
// process.on('exit', clean_up)
// process.on('beforeExit', clean_up);

// // Because we install an uncaughtException handler, node will change the exit code to 0
// // We override that and force it to 1 (the default when an uncaughtException occurs) and
// // report the error ourselves before we clean up
// process.on('uncaughtException', (error) => {
//     console.error(error);
//     clean_up();
//     process.exitCode = 1;
// });

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
                console.log(message);
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

AsyncMonitor.install(clean_up);

// Initialize the native module state once we've set up clean up
binding.logger_init((message: string) => { console.log(message) });

export = binding;

