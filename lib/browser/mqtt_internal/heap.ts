/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";

export class MinHeap<T> {

    private heap : Array<T | undefined> = [];
    private currentSize: number = 0;

    constructor(private lessThanOperator: (lhs: T, rhs: T) => boolean) {
        // @ts-ignore
        this.heap.push({});
    }

    push(value: T) {
        this.currentSize++;
        this.heap[this.currentSize] = value;
        this.heapifyUp(this.currentSize);
    }

    peek() : T | undefined {
        if (this.currentSize == 0) {
            return undefined;
        }

        // guaranteed to be a T
        return this.heap[1];
    }

    pop() : T {
        if (this.empty()) {
            throw new CrtError("Heap is empty");
        }

        let returnValue = this.heap[1];
        let lastElement = this.heap[this.currentSize];
        this.heap[this.currentSize--] = undefined; // erase the reference; unclear if this is overkill rather than simply removing from an array (or an indexed map for that matter)
        this.heap[1] = lastElement;
        this.heapifyDown(1);

        // @ts-ignore - guaranteed to be a T
        return returnValue;
    }

    empty() : boolean {
        return this.currentSize == 0;
    }

    private swapElements(index1: number, index2: number) {
        let temp = this.heap[index1];
        this.heap[index1] = this.heap[index2];
        this.heap[index2] = temp;
    }

    private heapifyDown(startIndex: number) {
        let currentIndex : number = startIndex;

        while (true) {
            let leftIndex = currentIndex << 1;
            let rightIndex = currentIndex + 1;
            let swapIndex = undefined;

            // @ts-ignore - heap element guaranteed to be a T
            if (leftIndex <= this.currentSize && this.lessThanOperator(this.heap[leftIndex], this.heap[currentIndex])) {
                swapIndex = leftIndex;
            // @ts-ignore - heap element guaranteed to be a T
            } else if (rightIndex <= this.currentSize && this.lessThanOperator(this.heap[rightIndex], this.heap[currentIndex])) {
                swapIndex = rightIndex;
            } else {
                break;
            }

            this.swapElements(currentIndex, swapIndex);
            currentIndex = swapIndex;
        }
    }

    private heapifyUp(index: number) {
        let parentIndex = index >> 1;
        // @ts-ignore - heap element guaranteed to be a T
        while (parentIndex > 0 && this.lessThanOperator(this.heap[index], this.heap[parentIndex])) {
            this.swapElements(index, parentIndex);
            index = parentIndex;
            parentIndex = parentIndex >> 1;
        }
    }
}