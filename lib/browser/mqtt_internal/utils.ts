/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

export function foldTimeMin(lhs : number | undefined, rhs : number | undefined) : number | undefined {
    if (lhs == undefined) {
        return rhs;
    }

    if (rhs == undefined) {
        return lhs;
    }

    return Math.min(lhs, rhs);
}

export function foldTimeMax(lhs : number | undefined, rhs : number | undefined) : number | undefined {
    if (lhs == undefined) {
        return rhs;
    }

    if (rhs == undefined) {
        return lhs;
    }

    return Math.max(lhs, rhs);
}
