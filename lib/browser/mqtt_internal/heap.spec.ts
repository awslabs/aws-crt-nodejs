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

test('isEmpty', async () => {
    let testHeap : heap.MinHeap<ElementType> = new heap.MinHeap<ElementType>(compareElements);
    expect(testHeap.empty()).toBeTruthy();

    testHeap.push({timestamp: 0, id: 1});
    expect(testHeap.empty()).toBeFalsy();

    testHeap.pop();
    expect(testHeap.empty()).toBeTruthy();
});

function doSimplePushPopTest(testHeap : heap.MinHeap<ElementType>, timestamps: Array<number>) {
    let currentId = 1;
    for (let timestamp of timestamps) {
        testHeap.push({timestamp: timestamp, id: currentId++});
    }

    let poppedTimestamps = [];
    while (!testHeap.empty()) {
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
}

test('reverseOrderPushPop', async () => {
    let testHeap : heap.MinHeap<ElementType> = new heap.MinHeap<ElementType>(compareElements);

    let timestamps = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    doSimplePushPopTest(testHeap, timestamps);
});