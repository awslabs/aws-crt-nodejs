/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {EventEmitter} from "events";

/**
 * Abstract interface for an object capable of cancelling asynchronous operations.
 *
 * Modern browsers and Node 15+ include an AbortController which essentially does the same thing.  But our baseline
 * is still node 10, so we provide our own implementation.  Also, Abort is, unfortunately, a problematic term, so we
 * stick to Cancel.
 */
export interface ICancelController {

    /**
     * API to invoke to cancel all asynchronous operations connected to this controller
     */
    cancel() : void;

    /**
     * Checks whether or not the controller is in the cancelled state
     */
    hasBeenCancelled() : boolean;

    /**
     * Registers a callback to be notified when cancel() is invoked externally.  In general, the callback
     * will cancel an asynchronous operation by rejecting the associated promise.
     *
     * IMPORTANT: The listener is invoked synchronously if the controller has already been cancelled.
     *
     * @param listener - function to invoke on cancel; invoked synchronously if the controller has been cancelled
     *
     * @return false if the controller has already been cancelled, true otherwise.  This is important because the
     * usage pattern requires an early out (because the listener callback gets invoked, cancelling the promise)
     * when the controller has already been cancelled.
     *
     */
    registerListener(listener: () => void) : boolean;
}

const EVENT_NAME = 'cancelled';

/**
 * CRT implementation of the ICancelController interface
 */
export class CancelController implements ICancelController {

    private cancelled : boolean;
    private emitter : EventEmitter;

    public constructor() {
        this.cancelled = false;
        this.emitter = new EventEmitter();
    }

    /**
     * Cancels all asynchronous operations associated with this controller
     */
    public cancel() {
        if (!this.cancelled) {
            this.cancelled = true;
            this.emitter.emit(EVENT_NAME);
        }
    }

    /**
     * Checks whether or not the controller is in the cancelled state
     */
    public hasBeenCancelled() {
        return this.cancelled;
    }

    /**
     * Registers a callback to be notified when cancel() is invoked externally.  In general, the callback
     * will cancel an asynchronous operation by rejecting the associated promise.
     *
     * IMPORTANT: The listener is invoked synchronously if the controller has already been cancelled.
     *
     * @param listener - function to invoke on cancel; invoked synchronously if the controller has been cancelled
     *
     * @return false if the controller has already been cancelled, true otherwise.  This is important because the
     * usage pattern requires an early out (because the listener callback gets invoked, cancelling the promise)
     * when the controller has already been cancelled.
     *
     */
    public registerListener(listener: () => void) : boolean {
        if (this.cancelled) {
            listener();
            return false;
        }

        this.emitter.on(EVENT_NAME, listener);
        return true;
    }
}