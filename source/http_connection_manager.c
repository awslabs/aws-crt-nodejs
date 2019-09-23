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

#include "http_connection_manager.h"
#include "module.h"
#include "uv_interop.h"

#include <aws/http/connection_manager.h>
#include <aws/io/socket.h>
#include <aws/io/tls_channel_handler.h>

struct http_connection_manager_binding {
    struct aws_http_connection_manager *manager;
    struct aws_allocator *allocator;
    napi_env env;
    napi_ref node_external;
    struct aws_napi_callback on_shutdown;
    struct aws_uv_context *uv_context;
};

struct aws_http_connection_manager *aws_napi_get_http_connection_manager(
    struct http_connection_manager_binding *binding) {
    return binding->manager;
}

static void s_http_connection_manager_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;
    struct http_connection_manager_binding *binding = finalize_data;
    aws_mem_release(binding->allocator, binding);
}

static int s_http_connection_manager_shutdown_params(
    napi_env env,
    napi_value *params,
    size_t *num_params,
    void *user_data) {
    (void)env;
    (void)params;
    (void)user_data;
    *num_params = 0;
    return AWS_OP_SUCCESS;
}

static void s_http_connection_manager_on_shutdown_dispatch(void *user_data) {
    struct http_connection_manager_binding *binding = user_data;
    aws_napi_callback_dispatch(&binding->on_shutdown, binding);

    /* no more node callbacks will be done, so clean up node stuff now */
    napi_env env = binding->env;
    napi_handle_scope handle_scope = NULL;
    if (napi_open_handle_scope(env, &handle_scope)) {
        napi_throw_error(env, NULL, "Unable to open handle scope for callback");
        goto cleanup;
    }
    napi_delete_reference(env, binding->node_external);
    aws_napi_callback_clean_up(&binding->on_shutdown);
    napi_close_handle_scope(env, handle_scope);

    aws_uv_context_release(binding->uv_context);

cleanup:
    napi_close_handle_scope(env, handle_scope);
}

static void s_http_connection_manager_shutdown_complete(void *user_data) {
    struct http_connection_manager_binding *binding = user_data;
    aws_uv_context_enqueue(binding->uv_context, s_http_connection_manager_on_shutdown_dispatch, binding);
}

napi_value aws_napi_http_connection_manager_new(napi_env env, napi_callback_info info) {

    napi_value result = NULL;

    napi_value node_args[8];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Unable to get callback info");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "http_connection_manager_new takes exactly 8 arguments");
        return NULL;
    }

    struct aws_allocator *allocator = aws_default_allocator();
    struct aws_http_connection_manager_options options;
    AWS_ZERO_STRUCT(options);
    struct aws_byte_buf host_buf;
    AWS_ZERO_STRUCT(host_buf);
    struct aws_tls_connection_options tls_connection_options;
    AWS_ZERO_STRUCT(tls_connection_options);

    napi_value node_bootstrap = *arg++;
    if (napi_get_value_external(env, node_bootstrap, (void **)&options.bootstrap)) {
        napi_throw_type_error(env, NULL, "bootstrap must be a ClientBootstrap");
        return NULL;
    }

    napi_value node_host = *arg++;
    if (aws_byte_buf_init_from_napi(&host_buf, env, node_host)) {
        napi_throw_type_error(env, NULL, "host must be a string");
        return NULL;
    }
    options.host = aws_byte_cursor_from_buf(&host_buf);

    napi_value node_port = *arg++;
    uint32_t port = 0;
    if (napi_get_value_uint32(env, node_port, &port) || port > UINT16_MAX) {
        napi_throw_type_error(env, NULL, "port must be a number between 0 and 65535");
        goto cleanup;
    }
    options.port = (uint16_t)port;

    napi_value node_max_conns = *arg++;
    uint32_t max_connections = 0;
    if (napi_get_value_uint32(env, node_max_conns, &max_connections)) {
        napi_throw_type_error(env, NULL, "max_connections must be a number");
        goto cleanup;
    }
    options.max_connections = (size_t)max_connections;

    napi_value node_window_size = *arg++;
    uint32_t window_size = 16 * 1024;
    if (napi_get_value_uint32(env, node_window_size, &window_size)) {
        napi_throw_type_error(env, NULL, "initial_window_size must be a number");
        goto cleanup;
    }
    options.initial_window_size = (size_t)window_size;

    napi_value node_socket_options = *arg++;
    const struct aws_socket_options *socket_options = NULL;
    if (!aws_napi_is_null_or_undefined(env, node_socket_options)) {
        if (napi_get_value_external(env, node_socket_options, (void **)&socket_options)) {
            napi_throw_type_error(env, NULL, "socket_options must be undefined or a valid SocketOptions");
            goto cleanup;
        }
    }
    options.socket_options = socket_options;

    napi_value node_tls = *arg++;
    struct aws_tls_ctx *tls_ctx = NULL;
    if (!aws_napi_is_null_or_undefined(env, node_tls)) {
        if (napi_get_value_external(env, node_tls, (void **)&tls_ctx)) {
            napi_throw_type_error(env, NULL, "tls_ctx must be undefined or a valid ClientTlsContext");
            goto cleanup;
        }
    }
    if (tls_ctx) {
        aws_tls_connection_options_init_from_ctx(&tls_connection_options, tls_ctx);
        options.tls_connection_options = &tls_connection_options;
    }

    napi_value node_on_shutdown = *arg++;
    struct aws_napi_callback on_shutdown;
    AWS_ZERO_STRUCT(on_shutdown);
    if (!aws_napi_is_null_or_undefined(env, node_on_shutdown)) {
        if (aws_napi_callback_init(
                &on_shutdown,
                env,
                node_on_shutdown,
                "http_connection_manager_on_shutdown",
                s_http_connection_manager_shutdown_params)) {
            napi_throw_type_error(env, NULL, "on_shutdown must be a valid callback or undefined");
            goto cleanup;
        }
    }

    /* TODO: Insert Proxy here */

    struct http_connection_manager_binding *binding =
        aws_mem_calloc(allocator, 1, sizeof(struct http_connection_manager_binding));

    binding->allocator = allocator;
    binding->env = env;
    binding->uv_context = aws_uv_context_new(env, allocator);
    if (!binding->uv_context) {
        aws_napi_throw_last_error(env);
        goto binding_failed;
    }
    options.shutdown_complete_callback = s_http_connection_manager_shutdown_complete;
    options.shutdown_complete_user_data = binding;
    binding->manager = aws_http_connection_manager_new(allocator, &options);
    if (!binding->manager) {
        aws_napi_throw_last_error(env);
        goto binding_failed;
    }
    binding->on_shutdown = on_shutdown;
    napi_value node_external = NULL;
    if (napi_create_external(env, binding, s_http_connection_manager_finalize, NULL, &node_external)) {
        napi_throw_error(env, NULL, "Unable to create node external");
        goto external_failed;
    }
    if (napi_create_reference(env, node_external, 1, &binding->node_external)) {
        napi_throw_error(env, NULL, "Unable to create reference to node external");
        goto external_failed;
    }

    /* success, set the return value */
    result = node_external;
    goto done;

external_failed:
    aws_http_connection_manager_release(binding->manager);

binding_failed:
    aws_napi_callback_clean_up(&on_shutdown);

cleanup:
done:
    aws_tls_connection_options_clean_up(&tls_connection_options);
    aws_byte_buf_clean_up(&host_buf);

    return result;
}

napi_value aws_napi_http_connection_manager_close(napi_env env, napi_callback_info info) {

    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Unable to get callback info");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "http_connection_manager_close takes exactly 1 argument");
        return NULL;
    }

    napi_value node_external = *arg++;
    struct http_connection_manager_binding *binding = NULL;
    if (napi_get_value_external(env, node_external, (void **)&binding) || !binding) {
        napi_throw_type_error(env, NULL, "connection_manager must be a valid HttpConnectionManager");
        return NULL;
    }

    aws_http_connection_manager_release(binding->manager);

    return NULL;
}
