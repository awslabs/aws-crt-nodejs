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

#include <aws/common/common.h>

#include <aws/io/channel_bootstrap.h>
#include <aws/io/host_resolver.h>

struct aws_nodejs_client_bootstrap {
    struct aws_client_bootstrap *bootstrap;
    struct aws_host_resolver resolver;
};

AWS_EXTERN_C_BEGIN

/**
 * Returns the string associated with the error code.
 */
napi_value aws_napi_error_code_to_string(napi_env env, napi_callback_info info);

/**
 * Returns true if ALPN is available, false if it is not.
 */
napi_value aws_napi_is_alpn_available(napi_env env, napi_callback_info info);

/**
 * Create a new aws_client_bootstrap to be managed by an napi_external.
 */
napi_value aws_napi_io_client_bootstrap_new(napi_env env, napi_callback_info info);

/**
 * Create a new aws_tls_ctx to be managed by a napi_external.
 */
napi_value aws_napi_io_client_tls_ctx_new(napi_env env, napi_callback_info info);

/**
 * Create a new aws_socket_options to be managed by a napi_external
 */
napi_value aws_napi_io_socket_options_new(napi_env env, napi_callback_info info);

AWS_EXTERN_C_END

#endif /* AWS_CRT_NODEJS_IO_H */
