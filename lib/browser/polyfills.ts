/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/** This file contains polyfills for possibly missing browser features */

var window: any = (global ?? self ?? this);

/** @internal */
export const TextEncoder = window['TextEncoder'] ?? require('fastestsmallesttextencoderdecoder').TextEncoder;

/** @internal */
export const TextDecoder = window['TextDecoder'] ?? require('fastestsmallesttextencoderdecoder').TextDecoder;
