/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as cancel from "./cancel";

jest.setTimeout(10000);

test('Simple cancel test', async () => {
    let controller : cancel.CancelController = new cancel.CancelController();

    let emptyPromise : Promise<void> = new Promise<void>((resolve, reject) => {
       controller.registerListener(() => { resolve(); });
    });

    setTimeout(() => {controller.cancel();}, 1000);

    await emptyPromise;
});
