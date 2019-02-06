#ifndef AWS_CRT_NODEJS_IO_H
#define AWS_CRT_NODEJS_IO_H
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

#include <node_api.h>

/**
 * Returns the string associated with the error code.
 */
napi_value aws_nodejs_error_code_to_string(napi_env env, napi_callback_info info);

/**
 * Returns true if ALPN is available, false if it is not.
 */
napi_value aws_nodejs_is_alpn_available(napi_env env, napi_callback_info info);

/**
 * Create a new client_bootstrap to be managed by an napi_externl.
 */
napi_value aws_nodejs_io_client_bootstrap_new(napi_env env, napi_callback_info info);

/**
 * Create a new tls_ctx to be managed by a Python Capsule.
 */
napi_value aws_nodejs_io_client_tls_ctx_new(napi_env env, napi_callback_info info);

#endif /* AWS_CRT_NODEJS_IO_H */
