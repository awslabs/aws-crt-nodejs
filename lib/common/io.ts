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

/**
 * Sets the amount of detail that will be logged
 * @param level - maximum level of logging detail.  Log invocations at a higher level of detail will be ignored.
 *
 * @category Logging
 */
export function setLogLevel(level: LogLevel) {
    logLevel = level;
}

/*
 * The logging API is exported to library-internal, but stays private beyond the package boundary, so the following API
 * decisions are not binding.
 */

function log(level: LogLevel, subject: string, logLine: string) {
    if (logLevel < level) {
        return;
    }

    let currentTime = new Date().toISOString();
    console.log(`[${LogLevel[level]}] [${currentTime}] [${subject}] - ${logLine}`);
}


export function logFatal(subject: string, logLine: string) {
    log(LogLevel.FATAL, subject, logLine);
}

export function logError(subject: string, logLine: string) {
    log(LogLevel.ERROR, subject, logLine);
}

export function logWarn(subject: string, logLine: string) {
    log(LogLevel.WARN, subject, logLine);
}

export function logInfo(subject: string, logLine: string) {
    log(LogLevel.INFO, subject, logLine);
}

export function logDebug(subject: string, logLine: string) {
    log(LogLevel.DEBUG, subject, logLine);
}

export function logTrace(subject: string, logLine: string) {
    log(LogLevel.TRACE, subject, logLine);
}

export type LogLineGenerator = () => string;

function flog(level: LogLevel, subject: string, logLineGenerator: LogLineGenerator) {
    if (logLevel < level) {
        return;
    }

    let currentTime = new Date().toISOString();
    console.log(`[${LogLevel[level]}] [${currentTime}] [${subject}] - ${logLineGenerator()}`);
}

export function flogFatal(subject: string, logLineGenerator: LogLineGenerator) {
    flog(LogLevel.FATAL, subject, logLineGenerator);
}

export function flogError(subject: string, logLineGenerator: LogLineGenerator) {
    flog(LogLevel.ERROR, subject, logLineGenerator);
}

export function flogWarn(subject: string, logLineGenerator: LogLineGenerator) {
    flog(LogLevel.WARN, subject, logLineGenerator);
}

export function flogInfo(subject: string, logLineGenerator: LogLineGenerator) {
    flog(LogLevel.INFO, subject, logLineGenerator);
}

export function flogDebug(subject: string, logLineGenerator: LogLineGenerator) {
    flog(LogLevel.DEBUG, subject, logLineGenerator);
}

export function flogTrace(subject: string, logLineGenerator: LogLineGenerator) {
    flog(LogLevel.TRACE, subject, logLineGenerator);
}