/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 * @packageDocumentation
 * @module mqtt_request_response
 */

export enum StreamingOperationState {
    None,
    Open,
    Closed,
}

export enum RequestResponseClientState {
    Ready,
    Closed
}