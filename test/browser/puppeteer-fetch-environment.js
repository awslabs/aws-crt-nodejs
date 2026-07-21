/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * Custom Jest test environment for the browser test suite.
 *
 * `jest-environment-puppeteer` extends `jest-environment-node`, which in
 * Jest 27 creates a fresh `vm.createContext()` and only copies a small
 * allowlist of globals into it (setTimeout, Buffer, URL, TextEncoder, ...).
 * Node's built-in `fetch` global (Node 18+) is not in that allowlist, so
 * bare `fetch(...)` calls in lib/browser/http.ts throw
 * `ReferenceError: fetch is not defined` inside the sandbox.
 *
 * By extending the puppeteer environment and assigning to `this.global`
 * (which IS the sandbox's `globalThis`) during `setup()`, we inject
 * Node's real fetch (and its companion classes) into the sandbox — no
 * external polyfill required.
 *
 * Note: `jest-environment-puppeteer@5.x` default-exports the class itself
 * (not a `TestEnvironment` named export — that's Jest 28+).
 */
const PuppeteerEnvironment = require('jest-environment-puppeteer');

class PuppeteerFetchEnvironment extends PuppeteerEnvironment {
    async setup() {
        await super.setup();
        // TextDecoder is used by the HTTP error path; the others back fetch().
        // The web-stream classes are required for undici (proxy support) to load
        // inside the sandbox — require('undici') throws "ReadableStream is not
        // defined" without them.
        Object.assign(this.global, {
            fetch, Headers, Request, Response, TextDecoder,
            ReadableStream, WritableStream, TransformStream,
            MessageChannel, MessagePort, performance,
        });
    }
}

module.exports = PuppeteerFetchEnvironment;
