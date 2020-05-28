/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

/**
 * TLS Version
 *
 * @module aws-crt
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
 * @module aws-crt
 * @category I/O
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
 * @module aws-crt
 * @category I/O
 */
export enum SocketDomain {
    IPV4 = 0,
    IPV6 = 1,
    LOCAL = 2, /** UNIX domain socket/Windows named pipes */
}
