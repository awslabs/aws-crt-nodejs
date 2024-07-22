/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 *
 * A module containing a grab bag of support for core network I/O functionality, including sockets, TLS, DNS, logging,
 * error handling, streams, and connection -> thread mapping.
 *
 * Categories include:
 * - Network: socket configuration
 * - TLS: tls configuration
 * - Logging: logging controls and configuration
 * - IO: everything else
 *
 * @packageDocumentation
 * @module io
 */

/**
 * TLS Version
 *
 * @category TLS
 */
export enum TlsVersion {
    SSLv3 = 0,
    TLSv1 = 1,
    TLSv1_1 = 2,
    TLSv1_2 = 3,
    TLSv1_3 = 4,
    Default = 128,
}

/**
 * @category Network
 */
export enum SocketType {
    /**
     * A streaming socket sends reliable messages over a two-way connection.
     * This means TCP when used with {@link SocketDomain.IPV4}/{@link SocketDomain.IPV6},
     * and Unix domain sockets when used with {@link SocketDomain.LOCAL }
      */
    STREAM = 0,
    /**
     * A datagram socket is connectionless and sends unreliable messages.
     * This means UDP when used with {@link SocketDomain.IPV4}/{@link SocketDomain.IPV6}.
     * {@link SocketDomain.LOCAL} is not compatible with {@link DGRAM}
     */
    DGRAM = 1,
}

/**
 * @category Network
 */
export enum SocketDomain {
    /** IPv4 sockets */
    IPV4 = 0,

    /** IPv6 sockets */
    IPV6 = 1,

    /** UNIX domain socket/Windows named pipes */
    LOCAL = 2,
}

/**
 * The amount of detail that will be logged
 * @category Logging
 */
export enum LogLevel {
    /** No logging whatsoever. */
    NONE = 0,
    /** Only fatals. In practice, this will not do much, as the process will log and then crash (intentionally) if a fatal condition occurs */
    FATAL = 1,
    /** Only errors */
    ERROR = 2,
    /** Only warnings and errors */
    WARN = 3,
    /** Information about connection/stream creation/destruction events */
    INFO = 4,
    /** Enough information to debug the chain of events a given network connection encounters */
    DEBUG = 5,
    /** Everything. Only use this if you really need to know EVERY single call */
    TRACE = 6
}

let logLevel : LogLevel = LogLevel.NONE;

export function setLogLevel(level: LogLevel) {
    logLevel = level;
}

export type LogLineGenerator = () => string;

export function logFatal(subject: string, generator: LogLineGenerator) {
    if (logLevel < LogLevel.FATAL) {
        return;
    }

    let currentTime = new Date().toISOString();
    console.log(`[FATAL] [${currentTime}] [${subject}] - ${generator()}`);
}

export function logError(subject: string, generator: LogLineGenerator) {
    if (logLevel < LogLevel.ERROR) {
        return;
    }

    let currentTime = new Date().toISOString();
    console.log(`[ERROR] [${currentTime}] [${subject}] - ${generator()}`);
}

export function logWarn(subject: string, generator: LogLineGenerator) {
    if (logLevel < LogLevel.WARN) {
        return;
    }

    let currentTime = new Date().toISOString();
    console.log(`[WARN] [${currentTime}] [${subject}] - ${generator()}`);
}

export function logInfo(subject: string, generator: LogLineGenerator) {
    if (logLevel < LogLevel.INFO) {
        return;
    }

    let currentTime = new Date().toISOString();
    console.log(`[INFO] [${currentTime}] [${subject}] - ${generator()}`);
}

export function logDebug(subject: string, generator: LogLineGenerator) {
    if (logLevel < LogLevel.DEBUG) {
        return;
    }

    let currentTime = new Date().toISOString();
    console.log(`[DEBUG] [${currentTime}] [${subject}] - ${generator()}`);
}

export function logTrace(subject: string, generator: LogLineGenerator) {
    if (logLevel < LogLevel.TRACE) {
        return;
    }

    let currentTime = new Date().toISOString();
    console.log(`[TRACE] [${currentTime}] [${subject}] - ${generator()}`);
}