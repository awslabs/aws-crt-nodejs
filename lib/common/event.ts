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

import { EventEmitter } from 'events';

type EventKey = string | symbol;

class BufferedEvent {
    public next?: BufferedEvent;
    public args: any[];
    constructor(public event: EventKey, ...args: any[]) {
        this.args = args;
    }
}

export class BufferedEventEmitter extends EventEmitter {
    private corked = false;
    private eventQueue?: BufferedEvent;
    private lastQueuedEvent?: BufferedEvent;

    constructor() {
        super();
    }

    cork() {
        this.corked = true;
    }

    uncork() {
        this.corked = false;
        while (this.eventQueue) {
            const event = this.eventQueue;
            super.emit(event.event, ...event.args);
            this.eventQueue = this.eventQueue.next;
        }
    }

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
}
