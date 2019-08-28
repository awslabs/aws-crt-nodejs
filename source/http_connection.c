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

#include "http_connection.h"
#include "module.h"
#include "uv_interop.h"

#include <aws/http/connection.h>
#include <aws/io/tls_channel_handler.h>

struct http_nodejs_connection {
    struct aws_http_connection *connection;
    struct aws_tls_connection_options tls_options;
    struct aws_napi_callback on_setup;
    struct aws_napi_callback on_shutdown;
    struct aws_uv_context *uv_context;
};

void s_dispatch_http_on_connection_setup(void *user_data) {
    (void)user_data;
}

void s_http_on_connection_setup(struct aws_http_connection *connection, int error_code, void *user_data) {
    (void)error_code;
    struct http_nodejs_connection *node_connection = user_data;
    node_connection->connection = connection;
    if (node_connection->on_setup.callback) {
        aws_uv_context_enqueue(node_connection->uv_context, s_dispatch_http_on_connection_setup, node_connection);
    }
}

void s_http_on_connection_shutdown(struct aws_http_connection *connection, int error_code, void *user_data) {
    (void)connection;
    (void)error_code;
    (void)user_data;
}

napi_value aws_napi_http_connection_new(napi_env env, napi_callback_info info) {
    (void)info;
    struct aws_allocator *allocator = aws_default_allocator();

    struct aws_http_client_connection_options options = AWS_HTTP_CLIENT_CONNECTION_OPTIONS_INIT;
    options.allocator = allocator;

    /* parse/validate arguments */
    napi_value node_args[7];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retrieve callback information");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "http_connection_new needs exactly 7 arguments");
        return NULL;
    }

    if (napi_get_value_external(env, node_args[0], (void **)&options.bootstrap)) {
        napi_throw_error(env, NULL, "Unable to extract bootstrap from external");
        return NULL;
    }

    struct aws_napi_callback on_connection_setup;
    AWS_ZERO_STRUCT(on_connection_setup);
    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        if (aws_napi_callback_init(
                &on_connection_setup, env, node_args[1], "aws_http_connection_on_connection_setup")) {
            return NULL;
        }
    }

    struct aws_napi_callback on_connection_shutdown;
    AWS_ZERO_STRUCT(on_connection_shutdown);
    if (!aws_napi_is_null_or_undefined(env, node_args[2])) {
        if (aws_napi_callback_init(
                &on_connection_shutdown, env, node_args[2], "aws_http_connection_on_connection_shutdown")) {
            return NULL;
        }
    }

    /* will be owned by tls_options */
    struct aws_string *host_name = aws_string_new_from_napi(env, node_args[3]);
    if (!host_name) {
        napi_throw_type_error(env, NULL, "4th argument (host_name) must be a String");
        goto argument_error;
    }

    uint32_t port = 0;
    if (napi_get_value_uint32(env, node_args[4], &port)) {
        napi_throw_type_error(env, NULL, "5th argument (port) must be a Number");
        goto argument_error;
    }
    options.port = (uint16_t)port;

    if (napi_get_value_external(env, node_args[5], (void **)&options.socket_options)) {
        napi_throw_error(env, NULL, "Unable to extract socket_options from external");
        goto argument_error;
    }

    struct aws_tls_ctx *tls_ctx = NULL;
    if (napi_get_value_external(env, node_args[6], (void **)&tls_ctx)) {
        napi_throw_error(env, NULL, "Failed to extract tls_ctx from external");
        goto argument_error;
    }

    /* create node external to hold the connection wrapper, cleanup is required from here on out */
    struct http_nodejs_connection *node_connection =
        aws_mem_calloc(allocator, 1, sizeof(struct http_nodejs_connection));
    if (!node_connection) {
        aws_napi_throw_last_error(env);
        goto alloc_failed;
    }

    napi_value node_external;
    if (napi_create_external(env, node_connection, NULL, NULL, &node_external)) {
        napi_throw_error(env, NULL, "Failed to create napi external for http_nodejs_connection");
        goto create_external_failed;
    }

    node_connection->uv_context = aws_uv_context_get_default();
    aws_uv_context_acquire(node_connection->uv_context, env);
    node_connection->on_setup = on_connection_setup;
    node_connection->on_shutdown = on_connection_shutdown;

    options.host_name = aws_byte_cursor_from_string(host_name);
    options.on_setup = s_http_on_connection_setup;
    options.on_shutdown = s_http_on_connection_shutdown;
    options.user_data = node_connection;
    aws_tls_connection_options_init_from_ctx(&node_connection->tls_options, tls_ctx);
    node_connection->tls_options.server_name = host_name;
    options.tls_options = &node_connection->tls_options;

    // if (aws_http_client_connect(&options)) {
    //     aws_napi_throw_last_error(env);
    //     goto connect_failed;
    // }

    return node_external;

// connect_failed:
create_external_failed:
    aws_mem_release(allocator, node_connection);
alloc_failed:
argument_error:
    aws_string_destroy(host_name);

    return NULL;
}

napi_value aws_napi_http_connection_close(napi_env env, napi_callback_info info) {
    struct aws_allocator *allocator = aws_default_allocator();

    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to extract arguments");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "http_connection_close takes exactly 1 argument");
        return NULL;
    }

    struct http_nodejs_connection *node_connection = NULL;
    if (napi_get_value_external(env, node_args[0], (void **)&node_connection)) {
        napi_throw_error(env, NULL, "Failed to extract http_nodejs_connection from external");
        return NULL;
    }

    if (node_connection->connection) {
        aws_http_connection_close(node_connection->connection);
    }

    aws_napi_callback_clean_up(&node_connection->on_setup);
    aws_napi_callback_clean_up(&node_connection->on_shutdown);
    aws_tls_connection_options_clean_up(&node_connection->tls_options);

    aws_uv_context_release(node_connection->uv_context);

    aws_mem_release(allocator, node_connection);

    return NULL;
}
