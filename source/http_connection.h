#ifndef AWS_CRT_NODEJS_HTTP_CONNECTION_H
#define AWS_CRT_NODEJS_HTTP_CONNECTION_H

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

struct http_proxy_options_binding;

napi_value aws_napi_http_proxy_options_new(napi_env env, napi_callback_info info);
struct aws_http_proxy_options *aws_napi_get_http_proxy_options(struct http_proxy_options_binding *binding);

napi_value aws_napi_http_connection_new(napi_env env, napi_callback_info info);
napi_value aws_napi_http_connection_close(napi_env env, napi_callback_info info);

struct http_connection_binding;
struct aws_http_connection;

struct aws_http_connection *aws_napi_get_http_connection(struct http_connection_binding *binding);
napi_value aws_napi_http_connection_from_manager(napi_env env, struct aws_http_connection *connection);

#endif /* AWS_CRT_NODEJS_HTTP_CONNECTION_H */
