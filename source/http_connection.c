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

#include <aws/http/connection.h>

struct aws_nodejs_callback {
    napi_async_context ctx;
    napi_ref callback;
};

struct http_nodejs_connection {
    struct aws_http_connection *connection;
};

napi_value aws_napi_http_connection_new(napi_env env, napi_callback_info info) {
    (void)info;
    struct aws_allocator *allocator = aws_default_allocator();
    napi_value result = NULL;

    struct http_nodejs_connection *node_connection =
        aws_mem_calloc(allocator, 1, sizeof(struct http_nodejs_connection));
    if (!node_connection) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    napi_value node_external;
    if (napi_create_external(env, node_connection, NULL, NULL, &node_external)) {
        napi_throw_error(env, NULL, "Failed to create napi external for http_nodejs_connection");
        goto cleanup;
    }
    result = node_external;

cleanup:
    if (!result) {
        if (node_connection->connection) {
            aws_http_connection_close(node_connection->connection);
        }

        aws_mem_release(allocator, node_connection);
    }

    return result;
}

napi_value aws_napi_http_connection_close(napi_env env, napi_callback_info info) {
    struct aws_allocator *allocator = aws_default_allocator();

    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to extract arguments");
        return NULL;
    }

    struct http_nodejs_connection *node_connection = NULL;
    if (napi_get_value_external(env, node_args[0], (void **)&node_connection)) {
        napi_throw_error(env, NULL, "Failed to extract http_nodejs_connection from external");
        return NULL;
    }

    if (node_connection->connection) {
        aws_mem_release(allocator, node_connection->connection);
    }

    aws_mem_release(allocator, node_connection);

    return NULL;
}
