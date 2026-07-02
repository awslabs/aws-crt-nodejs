/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Module for base types related to event emission
 *
 * @packageDocumentation
 * @module event
 */

import { EventEmitter } from 'events';

/**
 * Events are named via string or symbol
 *
 * @category Events
 */
export type EventKey = string | symbol;

export type EventEmissionCallback = () => void

/**
 * @internal
 */
class BufferedEvent {
    public callback?: EventEmissionCallback;
    public next?: BufferedEvent;
    public args: any[];
    constructor(public event: EventKey, args: any[]) {
        this.args = args;
    }

    static newWithEmissionCallback(key: EventKey, callback: EventEmissionCallback, args: any[]) : BufferedEvent {
        let bufferedEvent : BufferedEvent = new BufferedEvent(key, args);
        bufferedEvent.callback = callback;

        return bufferedEvent;
    }
}

/**
 * Provides buffered event emitting semantics, similar to many Node-style streams.
 * Subclasses will override EventEmitter.on() and trigger uncorking.
 * NOTE: It is HIGHLY recommended that uncorking should always be done via
 * ```process.nextTick()```, not during the EventEmitter.on() call.
 *
 * See also: [Node writable streams](https://nodejs.org/api/stream.html#stream_writable_cork)
 *
 * @category Events
 */
export class BufferedEventEmitter extends EventEmitter {
    private corked = false;
    private eventQueue?: BufferedEvent;
    private lastQueuedEvent?: BufferedEvent;

    constructor() {
        super();
    }

    /**
     * Forces all written events to be buffered in memory. The buffered data will be
     * flushed when {@link BufferedEventEmitter.uncork} is called.
     */
    cork() {
        this.corked = true;
    }

    /**
     * Flushes all data buffered since {@link BufferedEventEmitter.cork} was called.
     *
     * NOTE: It is HIGHLY recommended that uncorking should always be done via
     * ``` process.nextTick```, not during the ```EventEmitter.on()``` call.
     */
    uncork() {
        this.corked = false;
        while (this.eventQueue) {
            const event = this.eventQueue;
            super.emit(event.event, ...event.args);
            if (event.callback) {
                event.callback();
            }
            this.eventQueue = this.eventQueue.next;
        }
        this.lastQueuedEvent = undefined;
    }

    /**
     * Synchronously calls each of the listeners registered for the event key supplied
     * in registration order. If the {@link BufferedEventEmitter} is currently corked,
     * the event will be buffered until {@link BufferedEventEmitter.uncork} is called.
     * @param event The name of the event
     * @param args Event payload
     */
    emit(event: EventKey, ...args: any[]): boolean {
        if (this.corked) {
            // queue requests in order
            let last = this.lastQueuedEvent;
            this.lastQueuedEvent = new BufferedEvent(event, args);
            if (last) {
                last.next = this.lastQueuedEvent;
            } else {
                this.eventQueue = this.lastQueuedEvent;
            }
            return this.listeners(event).length > 0;
        }

        return super.emit(event, ...args);
    }

    emitWithCallback(event: EventKey, emissionCallback: EventEmissionCallback, ...args: any[]) : boolean {
        if (this.corked) {
            // queue requests in order
            let last = this.lastQueuedEvent;
            this.lastQueuedEvent = BufferedEvent.newWithEmissionCallback(event, emissionCallback, args);
            if (last) {
                last.next = this.lastQueuedEvent;
            } else {
                this.eventQueue = this.lastQueuedEvent;
            }
            return this.listeners(event).length > 0;
        }

        let result = super.emit(event, ...args);
        emissionCallback();
        return result;
    }
}
