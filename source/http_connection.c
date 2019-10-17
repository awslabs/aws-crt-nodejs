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

#include <aws/http/connection.h>
#include <aws/io/tls_channel_handler.h>

struct http_connection_binding {
    struct aws_http_connection *connection;
    struct aws_allocator *allocator;
    napi_ref node_external;
    napi_env env;
    napi_threadsafe_function on_setup;
    napi_threadsafe_function on_shutdown;
};

/* finalizer called when node cleans up this object */
static void s_http_connection_from_manager_binding_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;
    struct http_connection_binding *binding = finalize_data;

    /* no release call, the http_client_connection_manager has already released it */
    aws_mem_release(binding->allocator, binding);
}

struct aws_http_connection *aws_napi_get_http_connection(struct http_connection_binding *binding) {
    return binding->connection;
}

napi_value aws_napi_http_connection_from_manager(napi_env env, struct aws_http_connection *connection) {
    struct http_connection_binding *binding =
        aws_mem_calloc(aws_default_allocator(), 1, sizeof(struct http_connection_binding));
    if (!binding) {
        aws_napi_throw_last_error(env);
        return NULL;
    }
    binding->env = env;
    binding->connection = connection;
    napi_value node_external = NULL;
    AWS_NAPI_CALL(
        env,
        napi_create_external(env, binding, s_http_connection_from_manager_binding_finalize, NULL, &node_external),
        {
            napi_throw_error(env, NULL, "Unable to create external for managed connection");
            aws_mem_release(aws_default_allocator(), binding);
            return NULL;
        });
    return node_external;
}

struct on_connection_args {
    struct http_connection_binding *binding;
    int error_code;
};

static void s_http_on_connection_setup_call(napi_env env, napi_value on_setup, void *context, void *user_data) {
    struct http_connection_binding *binding = context;
    struct on_connection_args *args = user_data;

    napi_value params[2];
    const size_t num_params = AWS_ARRAY_SIZE(params);

    AWS_NAPI_ENSURE(env, napi_get_reference_value(env, args->binding->node_external, &params[0]));
    AWS_NAPI_ENSURE(env, napi_create_uint32(env, args->error_code, &params[1]));

    AWS_NAPI_ENSURE(
        env, aws_napi_dispatch_threadsafe_function(env, binding->on_setup, NULL, on_setup, num_params, params));

    aws_mem_release(binding->allocator, args);
}

static void s_http_on_connection_setup(struct aws_http_connection *connection, int error_code, void *user_data) {
    struct http_connection_binding *binding = user_data;
    binding->connection = connection;
    if (binding->on_setup) {
        struct on_connection_args *args = aws_mem_calloc(aws_default_allocator(), 1, sizeof(struct on_connection_args));
        args->binding = binding;
        args->error_code = error_code;
        AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_setup, args));
    }
}

static void s_http_on_connection_shutdown_call(napi_env env, napi_value on_shutdown, void *context, void *user_data) {
    struct http_connection_binding *binding = context;
    struct on_connection_args *args = user_data;

    napi_value params[2];
    const size_t num_params = AWS_ARRAY_SIZE(params);

    AWS_NAPI_ENSURE(env, napi_get_reference_value(env, args->binding->node_external, &params[0]));
    AWS_NAPI_ENSURE(env, napi_create_uint32(env, args->error_code, &params[1]));

    AWS_NAPI_ENSURE(
        env, aws_napi_dispatch_threadsafe_function(env, binding->on_shutdown, NULL, on_shutdown, num_params, params));

    aws_mem_release(binding->allocator, args);
}

static void s_http_on_connection_shutdown(struct aws_http_connection *connection, int error_code, void *user_data) {
    struct http_connection_binding *binding = user_data;
    binding->connection = connection;
    if (binding->on_shutdown) {
        struct on_connection_args *args = aws_mem_calloc(aws_default_allocator(), 1, sizeof(struct on_connection_args));
        args->binding = binding;
        args->error_code = error_code;
        AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_shutdown, args));
    }
}

/* finalizer called when node cleans up this object */
static void s_http_connection_binding_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;
    struct http_connection_binding *binding = finalize_data;

    aws_http_connection_release(binding->connection);
    aws_mem_release(binding->allocator, binding);
}

napi_value aws_napi_http_connection_new(napi_env env, napi_callback_info info) {
    struct aws_allocator *allocator = aws_default_allocator();

    napi_value result = NULL;
    struct aws_tls_ctx *tls_ctx = NULL;
    struct aws_http_client_connection_options options = AWS_HTTP_CLIENT_CONNECTION_OPTIONS_INIT;
    options.allocator = allocator;

    /* parse/validate arguments */
    napi_value node_args[7];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retrieve callback information");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "http_connection_new needs exactly 7 arguments");
        return NULL;
    }

    napi_value node_bootstrap = *arg++;
    struct client_bootstrap_binding *bootstrap_binding = NULL;
    if (napi_get_value_external(env, node_bootstrap, (void **)&bootstrap_binding)) {
        napi_throw_error(env, NULL, "Unable to extract bootstrap from external");
        return NULL;
    }

    /* create node external to hold the connection wrapper, cleanup is required from here on out */
    struct http_connection_binding *binding = aws_mem_calloc(allocator, 1, sizeof(struct http_connection_binding));
    if (!binding) {
        aws_napi_throw_last_error(env);
        goto alloc_failed;
    }

    binding->allocator = allocator;
    binding->env = env;

    napi_value node_on_setup = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_on_setup)) {
        napi_throw_error(env, NULL, "on_connection_setup must be a callback");
        return NULL;
    }
    AWS_NAPI_CALL(
        env,
        aws_napi_create_threadsafe_function(
            env,
            node_on_setup,
            "aws_http_connection_on_connection_setup",
            s_http_on_connection_setup_call,
            binding,
            &binding->on_setup),
        { goto failed_callbacks; });

    napi_value node_on_shutdown = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_on_shutdown)) {
        AWS_NAPI_CALL(
            env,
            aws_napi_create_threadsafe_function(
                env,
                node_on_shutdown,
                "aws_http_connection_on_connection_shutdown",
                s_http_on_connection_shutdown_call,
                binding,
                &binding->on_shutdown),
            { goto failed_callbacks; });
    }

    /* will be owned by tls_options */
    napi_value node_host_name = *arg++;
    struct aws_string *host_name = aws_string_new_from_napi(env, node_host_name);
    if (!host_name) {
        napi_throw_type_error(env, NULL, "host_name must be a String");
        goto argument_error;
    }

    napi_value node_port = *arg++;
    uint32_t port = 0;
    if (napi_get_value_uint32(env, node_port, &port)) {
        napi_throw_type_error(env, NULL, "port must be a Number");
        goto argument_error;
    }
    options.port = (uint16_t)port;

    napi_value node_socket_options = *arg++;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_socket_options, (void **)&options.socket_options), {
        napi_throw_error(env, NULL, "Unable to extract socket_options from external");
        goto argument_error;
    });

    napi_value node_tls_ctx = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_tls_ctx)) {
        AWS_NAPI_CALL(env, napi_get_value_external(env, node_tls_ctx, (void **)&tls_ctx), {
            napi_throw_error(env, NULL, "Failed to extract tls_ctx from external");
            goto argument_error;
        });
    }

    napi_value node_external = NULL;
    if (napi_create_external(env, binding, s_http_connection_binding_finalize, binding, &node_external)) {
        napi_throw_error(env, NULL, "Failed to create napi external for http_connection_binding");
        goto create_external_failed;
    }

    if (napi_create_reference(env, node_external, 1, &binding->node_external)) {
        napi_throw_error(env, NULL, "Failed to reference node_external");
        goto create_external_failed;
    }

    options.bootstrap = aws_napi_get_client_bootstrap(bootstrap_binding);
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

    if (aws_http_client_connect(&options)) {
        aws_napi_throw_last_error(env);
        goto connect_failed;
    }

    result = node_external;
    goto done;

connect_failed:
create_external_failed:
failed_callbacks:
    if (binding) {
        if (binding->on_setup) {
            AWS_NAPI_ENSURE(env, napi_release_threadsafe_function(binding->on_setup, napi_tsfn_abort));
        }
        if (binding->on_shutdown) {
            AWS_NAPI_ENSURE(env, napi_release_threadsafe_function(binding->on_shutdown, napi_tsfn_abort));
        }
    }
    aws_mem_release(allocator, binding);
alloc_failed:
argument_error:
done:
    /* the tls connection options own the host name string and kill it */
    aws_tls_connection_options_clean_up(&tls_options);
    if (!tls_ctx) {
        aws_string_destroy(host_name);
    }

    return result;
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
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_args[0], (void **)&binding), {
        napi_throw_error(env, NULL, "Failed to extract http_connection_binding from external");
        return NULL;
    });

    if (binding->connection) {
        aws_http_connection_close(binding->connection);
    }

    /* the rest of cleanup happens in s_http_connection_binding_finalize() */
    return NULL;
}
