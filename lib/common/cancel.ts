/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {EventEmitter} from "events";

/**
 * Callback signature for when cancel() has been invoked on a CancelController
 */
export type CancelListener = () => void;

/**
 * Signature for a function that will remove a listener from a CancelController's event emiiter
 */
export type RemoveListenerFunctor = () => void;

/**
 * A helper function that takes a promise (presumably one that has been made cancellable by attaching a listener to
 * a CancelController) and creates a wrapper promise that removes the listener automatically when the inner promise
 * is completed for any reason.  This allows us to keep the number of listeners on a CancelController bounded by
 * the number of incomplete promises associated with it.  If we didn't clean up, the listener set would grow
 * without limit.
 *
 * This leads to an internal usage pattern that is strongly recommended:
 *
 * ```
 * async doSomethingCancellable(...) : Promise<...> {
 *    removeListenerFunctor = undefined;
 *
 *    innerPromise = new Promise(async (resolve, reject) => {
 *       ...
 *
 *       cancelListenerFunction = () => { clean up and reject innerPromise };
 *       removeListenerFunctor = cancelController.addListener(cancelListenerFunction);
 *
 *       ...
 *    }
 *
 *    return makeSelfCleaningPromise(innerPromise, removeListenerFunctor);
 * }
 * ```
 *
 * @param promise cancel-instrumented promise to automatically clean up for
 * @param cleaner cleaner function to invoke when the promise is completed
 *
 * @return a promise with matching result/err, that invokes the cleaner function on inner promise completion
 */
export function makeSelfCleaningPromise<ResultType>(promise: Promise<ResultType>, cleaner? : RemoveListenerFunctor) : Promise<ResultType> {
    if (!cleaner) {
        return promise;
    }

    return promise.then(
        (response) => {
            cleaner();
            return new Promise<ResultType>((resolve, reject) => {
                resolve(response);
            }); },
        (err) => {
            cleaner();
            return new Promise<ResultType>((resolve,reject) => {
                reject(err);
            }); }
    );
}

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
     * @param listener - function to invoke on cancel; invoked synchronously if the controller has already been
     * cancelled
     *
     * @return undefined if the controller has already been cancelled, otherwise a function object whose invocation
     * will remove the listener from the controller's event emitter.
     *
     */
    addListener(listener: CancelListener) : RemoveListenerFunctor | undefined;

}

export const EVENT_NAME = 'cancelled';

/**
 * Signature for a factory function that can create EventEmitter objects
 */
export type EventEmitterFactory = () => EventEmitter;

/**
 * Configuration options for the CRT implementation of ICancelController
 */
export interface CancelControllerOptions {

    /**
     * Event emitters have, by default, a small maximum number of listeners.  When that default is insufficient for
     * a use case, this factory option allows for customization of how the internal event emitter is created.
     */
    emitterFactory? : EventEmitterFactory;
}

/**
 * CRT implementation of the ICancelController interface
 */
export class CancelController implements ICancelController {

    private cancelled : boolean;
    private emitter : EventEmitter;

    public constructor(options?: CancelControllerOptions) {
        this.cancelled = false;

        if (options && options.emitterFactory) {
            this.emitter = options.emitterFactory();
        } else {
            this.emitter = new EventEmitter();
        }
    }

    /**
     * Cancels all asynchronous operations associated with this controller
     */
    public cancel() {
        if (!this.cancelled) {
            this.cancelled = true;
            this.emitter.emit(EVENT_NAME);
            this.emitter.removeAllListeners(EVENT_NAME);
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
     * @return undefined if the controller has already been cancelled, otherwise a function object whose invocation
     * will remove the listener from the controller's event emitter.
     *
     */
    public addListener(listener: CancelListener) : RemoveListenerFunctor | undefined {
        if (this.cancelled) {
            listener();
            return undefined;
        }

        this.emitter.on(EVENT_NAME, listener);

        return () => { this.emitter.removeListener(EVENT_NAME, listener); };
    }

}