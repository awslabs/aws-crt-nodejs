/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

// TODO: browser connection timeouts will have different error messages, but we need to wait for them to occur in order
// to find out what they are
function isTimeout(e : Error) {
    return e.message.includes("AWS_IO_TLS_NEGOTIATION_TIMEOUT") ||
        e.message.includes("AWS_IO_SOCKET_TIMEOUT") ||
        e.message.includes("AWS_IO_DNS_INVALID_NAME");
}

export async function basicRetryWrapper(maxAttempts: number, isRetryablePredicate: (err: Error) => boolean, testFunction: () => Promise<void>) : Promise<void> {
    let attempt = 0;
    while (attempt < maxAttempts) {
        attempt += 1;
        try {
            await testFunction();
            return;
        } catch (e) {
            if (!isRetryablePredicate(e as Error) || attempt >= maxAttempts) {
                throw e;
            }

            // pause for a second before retrying
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

export async function networkTimeoutRetryWrapper(testFunction: () => Promise<void>)  {
    await basicRetryWrapper(5, isTimeout, testFunction);
}