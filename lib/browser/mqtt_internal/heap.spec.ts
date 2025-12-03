/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as heap from "./heap";

interface ElementType {
    timestamp: number;
    id: number;
}

function compareElements(lhs: ElementType, rhs: ElementType) {
    if (lhs.timestamp < rhs.timestamp) {
        return true;
    } else if (lhs.timestamp > rhs.timestamp) {
        return false;
    } else {
        return lhs.id < rhs.id;
    }
}

test('empty', async () => {
    let testHeap : heap.MinHeap<ElementType> = new heap.MinHeap<ElementType>(compareElements);
    expect(testHeap.empty()).toBeTruthy();
    expect(testHeap.peek()).toBeUndefined();

    testHeap.push({timestamp: 0, id: 1});
    expect(testHeap.empty()).toBeFalsy();
    expect(testHeap.peek()).toBeDefined();

    testHeap.pop();
    expect(testHeap.empty()).toBeTruthy();
    expect(testHeap.peek()).toBeUndefined();
});

function doSimplePushPopTest(testHeap : heap.MinHeap<ElementType>, timestamps: Array<number>) {
    let currentId = 1;
    for (let timestamp of timestamps) {
        testHeap.push({timestamp: timestamp, id: currentId++});
    }

    let poppedTimestamps : Array<number> = [];
    let peekedTimestamps : Array<number> = [];
    while (!testHeap.empty()) {
        // @ts-ignore
        peekedTimestamps.push(testHeap.peek().timestamp);
        poppedTimestamps.push(testHeap.pop().timestamp);
    }

    let sortedTimestamps = timestamps.sort((lhs, rhs) => {
        if (lhs < rhs) {
            return -1;
        } else if (lhs > rhs) {
            return 1;
        } else {
            return 0;
        }
    });

    expect(poppedTimestamps).toEqual(sortedTimestamps);
    expect(peekedTimestamps).toEqual(sortedTimestamps);
}

test('reverseOrderPushPop', async () => {
    let testHeap : heap.MinHeap<ElementType> = new heap.MinHeap<ElementType>(compareElements);

    let timestamps = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    doSimplePushPopTest(testHeap, timestamps);
});

test('alternatingOrderPushPop', async () => {
    let testHeap : heap.MinHeap<ElementType> = new heap.MinHeap<ElementType>(compareElements);

    let timestamps = [10, -10, 9, -9, 8, -8, 7, -7, 6, -6, 5, -5, 4, -4, 3, -3, 2, -2, 1, -1, 0];
    doSimplePushPopTest(testHeap, timestamps);
});

test('randomOrderPushPop', async () => {
    let testHeap : heap.MinHeap<ElementType> = new heap.MinHeap<ElementType>(compareElements);

    let timestamps = [];

    for (let i = 0; i < 100; i++) {
        timestamps.push(Math.floor(Math.random() * 1000 + .5));
    }

    doSimplePushPopTest(testHeap, timestamps);
});

test('peek empty', async () => {
    let testHeap : heap.MinHeap<ElementType> = new heap.MinHeap<ElementType>(compareElements);

    expect(() => { testHeap.pop(); }).toThrow("empty");
});

test('clear', async () => {
    let testHeap : heap.MinHeap<ElementType> = new heap.MinHeap<ElementType>(compareElements);

    let timestamps = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    let currentId = 1;
    for (let timestamp of timestamps) {
        testHeap.push({timestamp: timestamp, id: currentId++});
    }

    expect(testHeap.empty()).toBeFalsy();

    testHeap.clear();

    expect(testHeap.empty()).toBeTruthy();
    expect(() => { testHeap.pop(); }).toThrow("empty");
});