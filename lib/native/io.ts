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

import crt_native = require('./binding');
import { NativeResource } from "./native_resource";

export function error_code_to_string(error_code: number): string {
    return crt_native.error_code_to_string(error_code);
}

export function is_alpn_available(): boolean {
    return crt_native.is_alpn_available();
}

export class ClientBootstrap extends NativeResource {
    constructor() {
        super(crt_native.io_client_bootstrap_new());
    }
}

export enum TlsVersion {
    SSLv3 = 0,
    TLSv1 = 1,
    TLSv1_1 = 2,
    TLSv1_2 = 3,
    TLSv1_3 = 4,
    Default = 128,
}

export class TlsContextOptions {
    public min_tls_version: TlsVersion = TlsVersion.Default;
    public ca_file?: string = undefined;
    public ca_path?: string = undefined;
    public alpn_list?: string = undefined;
    public certificate_path?: string = undefined;
    public private_key_path?: string = undefined;
    public pkcs12_path?: string = undefined;
    public pkcs12_password?: string = undefined;
    public verify_peer: boolean = false;

    override_default_trust_store(ca_path?: string, ca_file?: string): void {
        this.ca_path = ca_path;
        this.ca_file = ca_file;
    }

    static create_client_with_mtls(certificate_path: string, private_key_path: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.certificate_path = certificate_path;
        opt.private_key_path = private_key_path;
        opt.verify_peer = true;
        return opt;
    }

    static create_client_with_mtls_pkcs(pkcs12_path: string, pkcs12_password: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.pkcs12_path = pkcs12_path;
        opt.pkcs12_password = pkcs12_password;
        opt.verify_peer = true;
        return opt;
    }

    static create_server_with_mtls(certificate_path: string, private_key_path: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.certificate_path = certificate_path;
        opt.private_key_path = private_key_path;
        opt.verify_peer = false;
        return opt;
    }

    static create_server_with_mtls_pkcs(pkcs12_path: string, pkcs12_password: string): TlsContextOptions {
        let opt = new TlsContextOptions();
        opt.pkcs12_path = pkcs12_path;
        opt.pkcs12_password = pkcs12_password;
        opt.verify_peer = false;
        return opt;
    }
}

export class ClientTlsContext extends NativeResource {
    constructor(ctx_opt: TlsContextOptions) {
        super(crt_native.io_client_tls_ctx_new(
            ctx_opt.min_tls_version,
            ctx_opt.ca_file,
            ctx_opt.ca_path,
            ctx_opt.alpn_list,
            ctx_opt.certificate_path,
            ctx_opt.private_key_path,
            ctx_opt.pkcs12_path,
            ctx_opt.pkcs12_password,
            ctx_opt.verify_peer));
    }
}
