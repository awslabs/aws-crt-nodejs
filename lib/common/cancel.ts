/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {EventEmitter} from "events";

export interface ICancelController {
    cancel() : void;

    hasBeenCancelled() : boolean;

    registerListener(listener: () => void) : boolean;
}

const EVENT_NAME = 'cancelled';

export class CancelController implements ICancelController {

    private cancelled : boolean;
    private emitter : EventEmitter;

    public constructor() {
        this.cancelled = false;
        this.emitter = new EventEmitter();
    }

    public cancel() {
        if (!this.cancelled) {
            this.cancelled = true;
            this.emitter.emit(EVENT_NAME);
        }
    }

    public hasBeenCancelled() {
        return this.cancelled;
    }

    public registerListener(listener: () => void) : boolean {
        if (this.cancelled) {
            listener();
            return false;
        }

        this.emitter.on(EVENT_NAME, listener);
        return true;
    }
}