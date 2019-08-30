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
#include "io.h"
#include "module.h"
#include "uv_interop.h"

#include <aws/common/logging.h>
#include <aws/http/connection.h>
#include <aws/io/tls_channel_handler.h>

struct http_connection_binding {
    struct aws_http_connection *connection;
    napi_ref node_external;
    napi_env env;
    struct aws_napi_callback on_setup;
    struct aws_napi_callback on_shutdown;
    struct aws_uv_context *uv_context;
};

struct on_connection_args {
    struct http_connection_binding *binding;
    int error_code;
    napi_env env;
};

int s_http_on_connection_setup_params(napi_env env, napi_value *params, size_t *num_params, void *user_data) {
    struct on_connection_args *args = user_data;

    if (napi_get_reference_value(env, args->binding->node_external, &params[0])) {
        return AWS_OP_ERR;
    }

    if (napi_create_uint32(env, args->error_code, &params[1])) {
        return AWS_OP_ERR;
    }

    *num_params = 2;
    return AWS_OP_SUCCESS;
}

void s_http_on_connection_setup_dispatch(void *user_data) {
    struct on_connection_args *args = user_data;
    aws_napi_callback_dispatch(&args->binding->on_setup, args);
    aws_mem_release(aws_default_allocator(), args);
}

void s_http_on_connection_setup(struct aws_http_connection *connection, int error_code, void *user_data) {
    struct http_connection_binding *binding = user_data;
    binding->connection = connection;
    if (binding->on_setup.callback) {
        struct on_connection_args *args = aws_mem_calloc(aws_default_allocator(), 1, sizeof(struct on_connection_args));
        args->binding = binding;
        args->error_code = error_code;
        aws_uv_context_enqueue(binding->uv_context, s_http_on_connection_setup_dispatch, args);
    }
}

int s_http_on_connection_shutdown_params(napi_env env, napi_value *params, size_t *num_params, void *user_data) {
    struct on_connection_args *args = user_data;

    if (napi_get_reference_value(env, args->binding->node_external, &params[0])) {
        return AWS_OP_ERR;
    }

    if (napi_create_uint32(env, args->error_code, &params[1])) {
        return AWS_OP_ERR;
    }

    *num_params = 2;
    return AWS_OP_SUCCESS;
}

void s_http_connection_binding_finalize(void *user_data) {
    struct http_connection_binding *binding = user_data;
    struct aws_allocator *allocator = aws_default_allocator();
    napi_env env = binding->env;

    napi_handle_scope handle_scope = NULL;
    if (napi_open_handle_scope(env, &handle_scope)) {
        napi_throw_error(env, NULL, "Unable to open handle scope for callback");
        goto cleanup;
    }
    napi_delete_reference(env, binding->node_external);
    aws_napi_callback_clean_up(&binding->on_setup);
    aws_napi_callback_clean_up(&binding->on_shutdown);

    aws_uv_context_release(binding->uv_context);

    aws_mem_release(allocator, binding);
cleanup:
    napi_close_handle_scope(env, handle_scope);
}

void s_http_on_connection_shutdown_dispatch(void *user_data) {
    struct on_connection_args *args = user_data;
    aws_napi_callback_dispatch(&args->binding->on_shutdown, args);
    struct http_connection_binding *binding = args->binding;
    aws_mem_release(aws_default_allocator(), args);
    aws_uv_context_enqueue(binding->uv_context, s_http_connection_binding_finalize, binding);
}

void s_http_on_connection_shutdown(struct aws_http_connection *connection, int error_code, void *user_data) {
    struct http_connection_binding *binding = user_data;
    binding->connection = connection;
    if (binding->on_setup.callback) {
        struct on_connection_args *args = aws_mem_calloc(aws_default_allocator(), 1, sizeof(struct on_connection_args));
        args->binding = binding;
        args->error_code = error_code;
        aws_uv_context_enqueue(binding->uv_context, s_http_on_connection_shutdown_dispatch, args);
    }
}

napi_value aws_napi_http_connection_new(napi_env env, napi_callback_info info) {
    (void)info;
    struct aws_allocator *allocator = aws_default_allocator();

    struct aws_tls_ctx *tls_ctx = NULL;
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

    struct aws_nodejs_client_bootstrap *node_bootstrap = NULL;
    if (napi_get_value_external(env, node_args[0], (void **)&node_bootstrap)) {
        napi_throw_error(env, NULL, "Unable to extract bootstrap from external");
        return NULL;
    }

    struct aws_napi_callback on_connection_setup;
    AWS_ZERO_STRUCT(on_connection_setup);
    if (aws_napi_is_null_or_undefined(env, node_args[1])) {
        napi_throw_error(env, NULL, "2nd argument (on_connection_setup) must be a callback");
        return NULL;
    }
    if (aws_napi_callback_init(
            &on_connection_setup,
            env,
            node_args[1],
            "aws_http_connection_on_connection_setup",
            s_http_on_connection_setup_params)) {
        return NULL;
    }

    struct aws_napi_callback on_connection_shutdown;
    AWS_ZERO_STRUCT(on_connection_shutdown);
    if (!aws_napi_is_null_or_undefined(env, node_args[2])) {
        if (aws_napi_callback_init(
                &on_connection_shutdown,
                env,
                node_args[2],
                "aws_http_connection_on_connection_shutdown",
                s_http_on_connection_shutdown_params)) {
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

    if (!aws_napi_is_null_or_undefined(env, node_args[6])) {
        if (napi_get_value_external(env, node_args[6], (void **)&tls_ctx)) {
            napi_throw_error(env, NULL, "Failed to extract tls_ctx from external");
            goto argument_error;
        }
    }

    /* create node external to hold the connection wrapper, cleanup is required from here on out */
    struct http_connection_binding *binding = aws_mem_calloc(allocator, 1, sizeof(struct http_connection_binding));
    if (!binding) {
        aws_napi_throw_last_error(env);
        goto alloc_failed;
    }

    napi_value node_external;
    if (napi_create_external(env, binding, NULL, NULL, &node_external)) {
        napi_throw_error(env, NULL, "Failed to create napi external for http_connection_binding");
        goto create_external_failed;
    }

    if (napi_create_reference(env, node_external, 1, &binding->node_external)) {
        napi_throw_error(env, NULL, "Failed to reference node_external");
        goto create_external_failed;
    }

    binding->env = env;
    binding->uv_context = aws_uv_context_get_default();
    aws_uv_context_acquire(binding->uv_context, env);
    binding->on_setup = on_connection_setup;
    binding->on_shutdown = on_connection_shutdown;

    options.bootstrap = node_bootstrap->bootstrap;
    options.host_name = aws_byte_cursor_from_string(host_name);
    options.on_setup = s_http_on_connection_setup;
    options.on_shutdown = s_http_on_connection_shutdown;
    options.user_data = binding;
    struct aws_tls_connection_options tls_options;
    AWS_ZERO_STRUCT(tls_options);
    if (tls_ctx) {
        aws_tls_connection_options_init_from_ctx(&tls_options, tls_ctx);
        tls_options.server_name = host_name;
        options.tls_options = &tls_options;
    }

    options.user_data = binding;

    if (aws_http_client_connect(&options)) {
        aws_napi_throw_last_error(env);
        goto connect_failed;
    }

    goto done;

connect_failed:
create_external_failed:
    aws_mem_release(allocator, binding);
alloc_failed:
argument_error:
done:
    /* the tls connection options own the host name string and kill it */
    if (tls_ctx) {
        aws_tls_connection_options_clean_up(&tls_options);
    } else {
        aws_string_destroy(host_name);
    }

    return NULL;
}

napi_value aws_napi_http_connection_close(napi_env env, napi_callback_info info) {
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

    struct http_connection_binding *binding = NULL;
    if (napi_get_value_external(env, node_args[0], (void **)&binding)) {
        napi_throw_error(env, NULL, "Failed to extract http_connection_binding from external");
        return NULL;
    }

    if (binding->connection) {
        aws_http_connection_close(binding->connection);
        aws_http_connection_release(binding->connection);
    }

    /* the rest of cleanup happens in s_http_connection_binding_finalize() */

    return NULL;
}
