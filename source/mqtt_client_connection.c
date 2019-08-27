/*
 * Copyright 2010-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

#include "module.h"
#include "mqtt_client.h"
#include "mqtt_client_connection.h"
#include "uv_interop.h"

#include <aws/mqtt/client.h>

#include <aws/io/socket.h>
#include <aws/io/tls_channel_handler.h>

#include <aws/common/linked_list.h>
#include <aws/common/mutex.h>

#include <uv.h>

static const char *s_handle_scope_open_failed = "Failed to open handle scope";
static const char *s_resource_creation_failed = "Failed to create resource object for callback";
static const char *s_callback_scope_open_failed = "Failed to open callback scope";
static const char *s_load_arguments_failed = "Failed to load callback arguments";
static const char *s_callback_invocation_failed = "Callback invocation failed";

struct mqtt_nodejs_connection {
    struct aws_allocator *allocator;
    struct aws_socket_options socket_options;
    struct aws_tls_connection_options tls_options;
    struct mqtt_nodejs_client *node_client;
    struct aws_mqtt_client_connection *connection;

    struct aws_uv_context *uv_context;
    napi_env env;
    int last_error_code; /* used to store the error code for dispatching an error */

    struct aws_napi_callback on_connect;
    struct aws_napi_callback on_connection_interrupted;
    struct aws_napi_callback on_connection_resumed;
};

static void s_dispatch_error(void *user_data) {
    struct mqtt_nodejs_connection *connection = user_data;
    napi_env env = connection->env;

    napi_handle_scope handle_scope = NULL;
    aws_raise_error(connection->last_error_code);

    napi_open_handle_scope(env, &handle_scope);
    /* assumption, error code is thread local, and this always runs on the libuv thread
       so raise it here.  */
    aws_napi_throw_last_error(env);
    napi_close_handle_scope(env, handle_scope);
}

static void s_on_error(struct mqtt_nodejs_connection *connection, int error_code) {
    connection->last_error_code = error_code;
    aws_uv_context_enqueue(connection->uv_context, s_dispatch_error, connection);
}

static void s_raise_napi_error(napi_env env, const char *message) {
    napi_throw_error(env, "Runtime Error", message);
}

napi_value aws_napi_mqtt_client_connection_close(napi_env env, napi_callback_info info) {
    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    struct mqtt_nodejs_connection *node_connection = NULL;

    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "mqtt_client_connection_close needs exactly 1 arguments");
    }

    if (napi_get_value_external(env, node_args[0], (void **)&node_connection)) {
        napi_throw_error(env, NULL, "Failed to extract connection from first argument");
    }

    aws_napi_callback_clean_up(&node_connection->on_connection_interrupted);
    aws_napi_callback_clean_up(&node_connection->on_connection_resumed);

    aws_uv_context_release(node_connection->uv_context);
    aws_mqtt_client_connection_destroy(node_connection->connection);
    aws_mem_release(node_connection->allocator, node_connection);

    return NULL;
}

/*******************************************************************************
 * on_connection_interrupted
 ******************************************************************************/
struct connection_interrupted_args {
    struct mqtt_nodejs_connection *connection;
    int error_code;
};

static void s_dispatch_on_interrupt(void *user_data) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct connection_interrupted_args *args = user_data;
    struct mqtt_nodejs_connection *node_connection = args->connection;
    napi_env env = args->connection->env;

    if (node_connection->on_connection_interrupted.callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_connection_interrupted = NULL;
        napi_get_reference_value(env, node_connection->on_connection_interrupted.callback, &on_connection_interrupted);
        if (on_connection_interrupted) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(
                    env, resource_object, node_connection->on_connection_interrupted.async_context, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[1];
            if (napi_get_global(env, &recv) || napi_create_int32(env, args->error_code, &params[0])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(
                    env,
                    node_connection->on_connection_interrupted.async_context,
                    recv,
                    on_connection_interrupted,
                    AWS_ARRAY_SIZE(params),
                    params,
                    NULL)) {
                s_raise_napi_error(env, s_callback_invocation_failed);
            }
        }
    }

cleanup:
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }

    aws_mem_release(node_connection->allocator, args);
}

static void s_on_connection_interrupted(
    struct aws_mqtt_client_connection *connection,
    int error_code,
    void *user_data) {
    (void)connection;

    struct mqtt_nodejs_connection *nodejs_connection = user_data;

    struct connection_interrupted_args *args =
        aws_mem_calloc(nodejs_connection->allocator, 1, sizeof(struct connection_interrupted_args));

    if (!args) {
        s_on_error(args->connection, aws_last_error());
        return;
    }
    args->connection = nodejs_connection;
    args->error_code = error_code;

    aws_uv_context_enqueue(nodejs_connection->uv_context, s_dispatch_on_interrupt, args);
}

/*******************************************************************************
 * on_connection_resumed
 ******************************************************************************/
struct connection_resumed_args {
    struct mqtt_nodejs_connection *connection;
    enum aws_mqtt_connect_return_code return_code;
    bool session_present;
};

static void s_dispatch_on_resumed(void *user_data) {

    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct connection_resumed_args *args = user_data;
    struct mqtt_nodejs_connection *node_connection = args->connection;
    napi_env env = node_connection->env;

    if (node_connection->on_connection_resumed.callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_connection_resumed = NULL;
        napi_get_reference_value(env, node_connection->on_connection_resumed.callback, &on_connection_resumed);
        if (on_connection_resumed) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(
                    env, resource_object, node_connection->on_connection_resumed.async_context, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[2];
            if (napi_get_global(env, &recv) || napi_create_int32(env, args->return_code, &params[0]) ||
                napi_get_boolean(env, args->session_present, &params[1])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(
                    env,
                    node_connection->on_connection_resumed.async_context,
                    recv,
                    on_connection_resumed,
                    AWS_ARRAY_SIZE(params),
                    params,
                    NULL)) {
                s_raise_napi_error(env, s_callback_invocation_failed);
            }
        }
    }

cleanup:
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }

    aws_mem_release(node_connection->allocator, args);
}

static void s_on_connection_resumed(
    struct aws_mqtt_client_connection *connection,
    enum aws_mqtt_connect_return_code return_code,
    bool session_present,
    void *user_data) {
    (void)connection;

    struct mqtt_nodejs_connection *nodejs_connection = user_data;

    struct connection_resumed_args *args =
        aws_mem_calloc(nodejs_connection->allocator, 1, sizeof(struct connection_resumed_args));

    if (!args) {
        s_on_error(nodejs_connection, aws_last_error());
        return;
    }

    args->connection = nodejs_connection;
    args->return_code = return_code;
    args->session_present = session_present;
    aws_uv_context_enqueue(nodejs_connection->uv_context, s_dispatch_on_resumed, args);
}

napi_value aws_napi_mqtt_client_connection_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    napi_value result = NULL;

    struct mqtt_nodejs_connection *node_connection =
        aws_mem_calloc(allocator, 1, sizeof(struct mqtt_nodejs_connection));
    if (!node_connection) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    node_connection->socket_options.type = AWS_SOCKET_STREAM;

    napi_value node_args[3];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "mqtt_client_connection_new needs exactly 3 arguments");
        goto cleanup;
    }

    if (napi_get_value_external(env, node_args[0], (void **)&node_connection->node_client)) {
        napi_throw_error(env, NULL, "Failed to extract client from external");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        if (aws_napi_callback_init(
                &node_connection->on_connection_interrupted,
                env,
                node_args[1],
                "aws_mqtt_client_connection_on_connection_interrupted")) {
            goto cleanup;
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[2])) {
        if (aws_napi_callback_init(
                &node_connection->on_connection_resumed,
                env,
                node_args[2],
                "aws_mqtt_client_connection_on_connection_resumed")) {
            goto cleanup;
        }
    }

    /* CREATE THE THING */
    node_connection->allocator = allocator;
    node_connection->connection = aws_mqtt_client_connection_new(&node_connection->node_client->native_client);
    if (!node_connection->connection) {
        napi_throw_error(env, NULL, "Failed create native connection object");
        goto cleanup;
    }

    node_connection->env = env;

    if (node_connection->on_connection_interrupted.callback || node_connection->on_connection_resumed.callback) {
        aws_mqtt_client_connection_set_connection_interruption_handlers(
            node_connection->connection,
            s_on_connection_interrupted,
            node_connection,
            s_on_connection_resumed,
            node_connection);
    }

    napi_value node_external;
    if (napi_create_external(env, node_connection, NULL, NULL, &node_external)) {
        napi_throw_error(env, NULL, "Failed create n-api external");
        goto cleanup;
    }
    result = node_external;

    node_connection->uv_context = aws_uv_context_get_default();
    aws_uv_context_acquire(node_connection->uv_context, env);

cleanup:
    if (!result) {
        if (node_connection->connection) {
            aws_mqtt_client_connection_destroy(node_connection->connection);
        }

        aws_napi_callback_clean_up(&node_connection->on_connection_interrupted);
        aws_napi_callback_clean_up(&node_connection->on_connection_resumed);
        aws_mem_release(allocator, node_connection);
    }

    return result;
}

/*******************************************************************************
 * Connect
 ******************************************************************************/
struct connect_args {
    struct mqtt_nodejs_connection *connection;
    enum aws_mqtt_connect_return_code return_code;
    int error_code;
    bool session_present;
};

static void s_dispatch_on_connect(void *user_data) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct connect_args *args = user_data;
    struct mqtt_nodejs_connection *node_connection = args->connection;
    napi_env env = node_connection->env;

    if (node_connection->on_connect.callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_connect = NULL;
        napi_get_reference_value(env, node_connection->on_connect.callback, &on_connect);
        if (on_connect) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, node_connection->on_connect.async_context, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[3];
            if (napi_get_global(env, &recv) || napi_create_int32(env, args->error_code, &params[0]) ||
                napi_create_int32(env, args->return_code, &params[1]) ||
                napi_get_boolean(env, args->session_present, &params[2])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(
                    env,
                    node_connection->on_connect.async_context,
                    recv,
                    on_connect,
                    AWS_ARRAY_SIZE(params),
                    params,
                    NULL)) {
                s_raise_napi_error(env, s_callback_invocation_failed);
            }
        }
    }

cleanup:
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }

    aws_napi_callback_clean_up(&node_connection->on_connect);
    aws_mem_release(node_connection->allocator, args);
}

static void s_on_connected(
    struct aws_mqtt_client_connection *connection,
    int error_code,
    enum aws_mqtt_connect_return_code return_code,
    bool session_present,
    void *user_data) {
    (void)connection;

    struct mqtt_nodejs_connection *nodejs_connection = user_data;

    struct connect_args *args = aws_mem_calloc(nodejs_connection->allocator, 1, sizeof(struct connect_args));

    if (!args) {
        s_on_error(nodejs_connection, aws_last_error());
        return;
    }
    args->connection = nodejs_connection;
    args->error_code = error_code;
    args->return_code = return_code;
    args->session_present = session_present;

    aws_uv_context_enqueue(nodejs_connection->uv_context, s_dispatch_on_connect, args);
}

napi_value aws_napi_mqtt_client_connection_connect(napi_env env, napi_callback_info info) {

    napi_value result = NULL;

    struct aws_tls_ctx *tls_ctx = NULL;
    struct mqtt_nodejs_connection *node_connection = NULL;

    napi_value node_args[14];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "mqtt_client_connection_connect needs exactly 14 arguments");
        goto cleanup;
    }

    if (napi_get_value_external(env, node_args[0], (void **)&node_connection)) {
        napi_throw_error(env, NULL, "Failed to extract connection from first argument");
        goto cleanup;
    }

    struct aws_byte_buf client_id;
    AWS_ZERO_STRUCT(client_id);
    if (aws_byte_buf_init_from_napi(&client_id, env, node_args[1])) {
        napi_throw_type_error(env, NULL, "Second argument (client_id) must be a String");
        goto cleanup;
    }

    struct aws_byte_buf server_name;
    AWS_ZERO_STRUCT(server_name);
    if (aws_byte_buf_init_from_napi(&server_name, env, node_args[2])) {
        napi_throw_type_error(env, NULL, "Third argument (server_name) must be a String");
        goto cleanup;
    }

    uint32_t port_number = 0;
    if (napi_get_value_uint32(env, node_args[3], &port_number)) {
        napi_throw_type_error(env, NULL, "Fourth argument (port) must be a Number");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[4])) {
        if (napi_get_value_external(env, node_args[4], (void **)&tls_ctx)) {
            napi_throw_error(env, NULL, "Failed to extract tls_ctx from external");
            goto cleanup;
        }
    }

    uint32_t connect_timeout = 0;
    if (!aws_napi_is_null_or_undefined(env, node_args[5])) {
        if (napi_get_value_uint32(env, node_args[5], &connect_timeout)) {
            napi_throw_type_error(env, NULL, "Sixth argument (connect_timeout) must be a Number");
            goto cleanup;
        }
    }

    uint32_t keep_alive_time = 0;
    if (!aws_napi_is_null_or_undefined(env, node_args[6])) {
        if (napi_get_value_uint32(env, node_args[6], &keep_alive_time)) {
            napi_throw_type_error(env, NULL, "Seventh argument (keep_alive) must be a Number");
            goto cleanup;
        }
    }

    uint32_t timeout = 0;
    if (!aws_napi_is_null_or_undefined(env, node_args[7])) {
        if (napi_get_value_uint32(env, node_args[7], &timeout)) {
            napi_throw_type_error(env, NULL, "Eigth argument (timeout) must be a Number");
            goto cleanup;
        }
    }

    /* TODO: Handle Will */

    struct aws_byte_buf username;
    AWS_ZERO_STRUCT(username);
    if (!aws_napi_is_null_or_undefined(env, node_args[9])) {
        if (aws_byte_buf_init_from_napi(&username, env, node_args[9])) {
            napi_throw_type_error(env, NULL, "Tenth argument (username) must be a String");
            goto cleanup;
        }
    }

    struct aws_byte_buf password;
    AWS_ZERO_STRUCT(password);
    if (!aws_napi_is_null_or_undefined(env, node_args[10])) {
        if (aws_byte_buf_init_from_napi(&password, env, node_args[10])) {
            napi_throw_type_error(env, NULL, "eleventh argument (password) must be a String");
            goto cleanup;
        }
    }

    bool use_websocket = false;
    if (!aws_napi_is_null_or_undefined(env, node_args[11])) {
        if (napi_get_value_bool(env, node_args[11], &use_websocket)) {
            napi_throw_type_error(env, NULL, "twelfth argument (use_websocket) must be a boolean");
            goto cleanup;
        }
    }

    bool clean_session = false;
    if (!aws_napi_is_null_or_undefined(env, node_args[12])) {
        if (napi_get_value_bool(env, node_args[12], &clean_session)) {
            napi_throw_type_error(env, NULL, "thirteenth argument (clean_session) must be a boolean");
            goto cleanup;
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[13])) {
        if (aws_napi_callback_init(
                &node_connection->on_connect, env, node_args[13], "aws_mqtt_client_connection_on_connect")) {
            aws_napi_callback_clean_up(&node_connection->on_connect);
            goto cleanup;
        }
    }

    if (tls_ctx) {
        aws_tls_connection_options_init_from_ctx(&node_connection->tls_options, tls_ctx);
    }

    struct aws_byte_cursor client_id_cur = aws_byte_cursor_from_buf(&client_id);
    struct aws_byte_cursor server_name_cur = aws_byte_cursor_from_buf(&server_name);

    struct aws_mqtt_connection_options options;
    options.clean_session = clean_session;
    options.client_id = client_id_cur;
    options.host_name = server_name_cur;
    options.keep_alive_time_secs = keep_alive_time;
    options.on_connection_complete = s_on_connected;
    options.ping_timeout_ms = timeout;
    options.port = port_number;
    options.socket_options = &node_connection->socket_options;

    struct aws_socket_options socket_options = node_connection->socket_options;
    socket_options.connect_timeout_ms = connect_timeout;
    options.socket_options = &socket_options;
    options.tls_options = tls_ctx ? &node_connection->tls_options : NULL;
    options.user_data = node_connection;

    if (aws_mqtt_client_connection_connect(node_connection->connection, &options)) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

cleanup:
    aws_byte_buf_clean_up(&client_id);
    aws_byte_buf_clean_up(&server_name);
    aws_byte_buf_clean_up(&username);
    aws_byte_buf_clean_up(&password);

    return result;
}

/*******************************************************************************
 * Reconnect
 ******************************************************************************/

napi_value aws_napi_mqtt_client_connection_reconnect(napi_env env, napi_callback_info info) {

    napi_value result = NULL;
    struct mqtt_nodejs_connection *node_connection = NULL;

    napi_value node_args[2];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "mqtt_client_connection_reconnect needs exactly 2 arguments");
        goto cleanup;
    }

    if (napi_get_value_external(env, node_args[0], (void **)&node_connection)) {
        napi_throw_error(env, NULL, "Failed to extract connection from first argument");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {

        /* Destroy any existing callback info */
        if (node_connection->on_connect.callback) {
            aws_napi_callback_clean_up(&node_connection->on_connect);
        }

        if (aws_napi_callback_init(
                &node_connection->on_connect, env, node_args[1], "mqtt_client_connection_on_reconnect")) {
            goto cleanup;
        }
    }

    if (aws_mqtt_client_connection_reconnect(node_connection->connection, s_on_connected, node_connection)) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

    return NULL;

cleanup:
    aws_napi_callback_clean_up(&node_connection->on_connect);
    return result;
}

/*******************************************************************************
 * Publish
 ******************************************************************************/
struct publish_args {
    struct mqtt_nodejs_connection *connection;
    uint16_t packet_id;
    int error_code;
    struct aws_byte_buf topic;   /* stored here until the publish completes */
    struct aws_byte_buf payload; /* stored here until the publish completes */
    struct aws_napi_callback callback;
};

static void s_dispatch_on_publish_complete(void *user_data) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct publish_args *args = user_data;
    struct mqtt_nodejs_connection *node_connection = args->connection;
    napi_env env = node_connection->env;
    if (args->callback.callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_publish = NULL;
        napi_get_reference_value(env, args->callback.callback, &on_publish);
        if (on_publish) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, args->callback.async_context, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[2];
            if (napi_get_global(env, &recv) || napi_create_uint32(env, args->packet_id, &params[0]) ||
                napi_create_int32(env, args->error_code, &params[1])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(
                    env, args->callback.async_context, recv, on_publish, AWS_ARRAY_SIZE(params), params, NULL)) {
                s_raise_napi_error(env, s_callback_invocation_failed);
            }
        }
    }

cleanup:
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }

    aws_napi_callback_clean_up(&args->callback);
    aws_mem_release(node_connection->allocator, args);
}

static void s_on_publish_complete(
    struct aws_mqtt_client_connection *connection,
    uint16_t packet_id,
    int error_code,
    void *user_data) {

    (void)connection;

    struct publish_args *args = user_data;

    args->packet_id = packet_id;
    args->error_code = error_code;

    /* Clean up publish params */
    aws_byte_buf_clean_up(&args->topic);
    aws_byte_buf_clean_up(&args->payload);

    aws_uv_context_enqueue(args->connection->uv_context, s_dispatch_on_publish_complete, args);
}

napi_value aws_napi_mqtt_client_connection_publish(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();

    struct publish_args *args = aws_mem_calloc(allocator, 1, sizeof(struct publish_args));

    if (!args) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    napi_value node_args[6];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "mqtt_client_connection_publish needs exactly 6 arguments");
        goto cleanup;
    }

    struct mqtt_nodejs_connection *node_connection = NULL;
    if (napi_get_value_external(env, node_args[0], (void **)&node_connection)) {
        napi_throw_error(env, NULL, "Failed to extract connection from first argument");
        goto cleanup;
    }

    args->connection = node_connection;

    if (aws_byte_buf_init_from_napi(&args->topic, env, node_args[1])) {
        napi_throw_type_error(env, NULL, "Second argument (topic) must be a String");
        goto cleanup;
    }

    if (aws_byte_buf_init_from_napi(&args->payload, env, node_args[2])) {
        napi_throw_type_error(env, NULL, "Third argument (payload) must be a String");
        goto cleanup;
    }

    enum aws_mqtt_qos qos = 0;
    if (napi_get_value_uint32(env, node_args[3], &qos)) {
        napi_throw_type_error(env, NULL, "Fourth argument (qos) must be a number");
        goto cleanup;
    }

    bool retain = false;
    if (napi_get_value_bool(env, node_args[4], &retain)) {
        napi_throw_type_error(env, NULL, "Fifth argument (retain) must be a bool");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[5])) {
        if (aws_napi_callback_init(&args->callback, env, node_args[5], "aws_mqtt_client_connection_on_publish")) {
            goto cleanup;
        }
    }

    const struct aws_byte_cursor topic_cur = aws_byte_cursor_from_buf(&args->topic);
    const struct aws_byte_cursor payload_cur = aws_byte_cursor_from_buf(&args->payload);
    uint16_t pub_id = aws_mqtt_client_connection_publish(
        node_connection->connection, &topic_cur, qos, retain, &payload_cur, s_on_publish_complete, args);
    if (!pub_id) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

    return NULL;

cleanup:
    aws_byte_buf_clean_up(&args->payload);
    aws_byte_buf_clean_up(&args->topic);

    aws_napi_callback_clean_up(&args->callback);
    aws_mem_release(allocator, args);

    return NULL;
}

/*******************************************************************************
 * Subscribe
 ******************************************************************************/
struct suback_args {
    struct mqtt_nodejs_connection *connection;
    uint16_t packet_id;
    enum aws_mqtt_qos qos;
    int error_code;
    struct aws_byte_buf topic; /* owned by subscription */
    struct aws_napi_callback callback;
};

static void s_dispatch_on_suback(void *user_data) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct suback_args *args = user_data;
    struct mqtt_nodejs_connection *node_connection = args->connection;
    napi_env env = node_connection->env;
    if (args->callback.callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_suback = NULL;
        napi_get_reference_value(env, args->callback.callback, &on_suback);
        if (on_suback) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, args->callback.async_context, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[4];
            if (napi_get_global(env, &recv) || napi_create_int32(env, args->packet_id, &params[0]) ||
                napi_create_string_utf8(env, (const char *)args->topic.buffer, args->topic.len, &params[1]) ||
                napi_create_int32(env, args->qos, &params[2]) || napi_create_int32(env, args->error_code, &params[3])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(
                    env, args->callback.async_context, recv, on_suback, AWS_ARRAY_SIZE(params), params, NULL)) {
                s_raise_napi_error(env, s_callback_invocation_failed);
                goto cleanup;
            }
        }
    }

cleanup:
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }

    aws_napi_callback_clean_up(&args->callback);
    aws_mem_release(node_connection->allocator, args);
}

static void s_on_suback(
    struct aws_mqtt_client_connection *connection,
    uint16_t packet_id,
    const struct aws_byte_cursor *topic,
    enum aws_mqtt_qos qos,
    int error_code,
    void *user_data) {
    (void)connection;
    (void)topic;

    struct suback_args *args = user_data;

    args->error_code = error_code;
    args->qos = qos;
    args->packet_id = packet_id;

    aws_uv_context_enqueue(args->connection->uv_context, s_dispatch_on_suback, args);
}

/* user data which describes a subscription, passed to aws_mqtt_connection_subscribe */
struct subscription {
    struct mqtt_nodejs_connection *connection;
    struct aws_byte_buf topic; /* stored here as long as the sub is active, referenced by callbacks */
    struct aws_napi_callback callback;
};

/* deleting these callbacks has to happen in the node thread */
static void s_dispatch_free_on_publish_data(void *user_data) {
    struct subscription *args = user_data;
    aws_napi_callback_clean_up(&args->callback);
    aws_byte_buf_clean_up(&args->topic);
    aws_mem_release(args->connection->allocator, args);
}

static void s_on_publish_user_data_clean_up(void *user_data) {
    struct subscription *args = user_data;
    aws_uv_context_enqueue(args->connection->uv_context, s_dispatch_free_on_publish_data, args);
}

/* arguments for publish callbacks */
struct on_publish_args {
    struct mqtt_nodejs_connection *connection;
    struct aws_byte_buf topic;         /* owned by subscription */
    struct aws_byte_buf payload;       /* owned by this */
    struct aws_napi_callback callback; /* owned by subscription */
};

static void s_dispatch_on_publish(void *user_data) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct on_publish_args *args = user_data;
    struct mqtt_nodejs_connection *node_connection = args->connection;
    napi_env env = node_connection->env;
    if (args->callback.callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_publish = NULL;
        napi_get_reference_value(env, args->callback.callback, &on_publish);
        if (on_publish) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, args->callback.async_context, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[2];
            if (napi_get_global(env, &recv) ||
                napi_create_string_utf8(env, (const char *)args->topic.buffer, args->topic.len, &params[0]) ||
                napi_create_external_arraybuffer(
                    env, args->payload.buffer, args->payload.len, NULL, NULL, &params[1])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(
                    env, args->callback.async_context, recv, on_publish, AWS_ARRAY_SIZE(params), params, NULL)) {
                s_raise_napi_error(env, s_callback_invocation_failed);
            }

            aws_byte_buf_clean_up(&args->payload);
        }
    }

cleanup:
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }

    aws_mem_release(args->connection->allocator, args);
}

static void s_on_publish(
    struct aws_mqtt_client_connection *connection,
    const struct aws_byte_cursor *topic,
    const struct aws_byte_cursor *payload,
    void *user_data) {

    (void)connection;
    (void)topic;

    struct subscription *sub = user_data;
    struct on_publish_args *args = aws_mem_calloc(sub->connection->allocator, 1, sizeof(struct on_publish_args));

    if (!args) {
        s_on_error(sub->connection, aws_last_error());
        return;
    }

    args->connection = sub->connection;
    args->topic = sub->topic;
    args->callback = sub->callback;
    if (aws_byte_buf_init_copy_from_cursor(&args->payload, args->connection->allocator, *payload)) {
        aws_mem_release(args->connection->allocator, args);
        s_on_error(sub->connection, aws_last_error());
        return;
    }

    aws_uv_context_enqueue(args->connection->uv_context, s_dispatch_on_publish, args);
}

napi_value aws_napi_mqtt_client_connection_subscribe(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    struct subscription *sub = aws_mem_calloc(allocator, 1, sizeof(struct subscription));
    struct suback_args *suback = aws_mem_calloc(allocator, 1, sizeof(struct suback_args));

    if (!sub || !suback) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    napi_value node_args[5];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "mqtt_client_connection_subscribe needs exactly 5 arguments");
        goto cleanup;
    }

    struct mqtt_nodejs_connection *node_connection = NULL;
    if (napi_get_value_external(env, node_args[0], (void **)&node_connection)) {
        napi_throw_error(env, NULL, "Failed to extract connection from first argument");
        goto cleanup;
    }

    sub->connection = node_connection;
    suback->connection = node_connection;

    if (aws_byte_buf_init_from_napi(&sub->topic, env, node_args[1])) {
        napi_throw_type_error(env, NULL, "Second argument (topic) must be a String");
        goto cleanup;
    }

    suback->topic = sub->topic;

    enum aws_mqtt_qos qos = 0;
    if (napi_get_value_uint32(env, node_args[2], &qos)) {
        napi_throw_type_error(env, NULL, "Third argument (qos) must be a number");
        goto cleanup;
    }

    if (aws_napi_is_null_or_undefined(env, node_args[3])) {
        napi_throw_type_error(env, NULL, "on_message callback is required");
        goto cleanup;
    }
    if (aws_napi_callback_init(&sub->callback, env, node_args[3], "aws_mqtt_client_connection_on_message")) {
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[4])) {
        if (aws_napi_callback_init(&suback->callback, env, node_args[4], "aws_mqtt_client_connection_on_suback")) {
            goto cleanup;
        }
    }

    struct aws_byte_cursor topic_cur = aws_byte_cursor_from_buf(&sub->topic);
    uint16_t sub_id = aws_mqtt_client_connection_subscribe(
        node_connection->connection,
        &topic_cur,
        qos,
        s_on_publish,
        sub,
        s_on_publish_user_data_clean_up,
        s_on_suback,
        suback);

    if (!sub_id) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

    return NULL;

cleanup:
    if (sub->topic.buffer) {
        aws_byte_buf_clean_up(&sub->topic);
    }

    aws_napi_callback_clean_up(&sub->callback);
    aws_napi_callback_clean_up(&suback->callback);

    aws_mem_release(allocator, sub);
    aws_mem_release(allocator, suback);

    return NULL;
}

/*******************************************************************************
 * Unsubscribe
 ******************************************************************************/

struct unsuback_args {
    struct mqtt_nodejs_connection *connection;
    struct aws_byte_buf topic; /* stored here until unsub completes */
    uint16_t packet_id;
    int error_code;
    struct aws_napi_callback callback;
};

static void s_dispatch_on_unsub_ack(void *user_data) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct unsuback_args *args = user_data;
    struct mqtt_nodejs_connection *node_connection = args->connection;
    napi_env env = node_connection->env;
    if (args->callback.callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_unsub_ack = NULL;
        napi_get_reference_value(env, args->callback.callback, &on_unsub_ack);
        if (on_unsub_ack) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, args->callback.async_context, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[2];
            if (napi_get_global(env, &recv) || napi_create_uint32(env, args->packet_id, &params[0]) ||
                napi_create_int32(env, args->error_code, &params[1])) {
                goto cleanup;
            }

            if (napi_make_callback(
                    env, args->callback.async_context, recv, on_unsub_ack, AWS_ARRAY_SIZE(params), params, NULL)) {
                s_raise_napi_error(env, s_callback_invocation_failed);
            }
        }
    }

cleanup:
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }

    aws_byte_buf_clean_up(&args->topic);
    aws_napi_callback_clean_up(&args->callback);
    aws_mem_release(node_connection->allocator, args);
}

static void s_on_unsubscribe_complete(
    struct aws_mqtt_client_connection *connection,
    uint16_t packet_id,
    int error_code,
    void *user_data) {
    (void)connection;

    struct unsuback_args *args = user_data;
    args->packet_id = packet_id;
    args->error_code = error_code;

    aws_uv_context_enqueue(args->connection->uv_context, s_dispatch_on_unsub_ack, args);
}

napi_value aws_napi_mqtt_client_connection_unsubscribe(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();

    struct unsuback_args *args = aws_mem_calloc(allocator, 1, sizeof(struct unsuback_args));
    if (!args) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    napi_value node_args[3];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "mqtt_client_connection_publish needs exactly 3 arguments");
        goto cleanup;
    }

    struct mqtt_nodejs_connection *node_connection = NULL;
    if (napi_get_value_external(env, node_args[0], (void **)&node_connection)) {
        napi_throw_error(env, NULL, "Failed to extract connection from external");
        goto cleanup;
    }

    args->connection = node_connection;

    if (aws_byte_buf_init_from_napi(&args->topic, env, node_args[1])) {
        napi_throw_type_error(env, NULL, "Second argument (topic) must be a String");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[2])) {
        if (aws_napi_callback_init(&args->callback, env, node_args[2], "aws_mqtt_client_connection_on_unsuback")) {
            goto cleanup;
        }
    }

    const struct aws_byte_cursor topic_cur = aws_byte_cursor_from_buf(&args->topic);
    uint16_t unsub_id = aws_mqtt_client_connection_unsubscribe(
        node_connection->connection, &topic_cur, s_on_unsubscribe_complete, args);

    if (!unsub_id) {
        napi_throw_error(env, NULL, "Failed to initiate subscribe request");
        goto cleanup;
    }

    args->packet_id = unsub_id;

    return NULL;
cleanup:
    aws_byte_buf_clean_up(&args->topic);
    aws_napi_callback_clean_up(&args->callback);
    aws_mem_release(allocator, args);

    return NULL;
}

/*******************************************************************************
 * Disconnect
 ******************************************************************************/

struct disconnect_args {
    struct mqtt_nodejs_connection *connection;
    struct aws_napi_callback callback;
};

static void s_dispatch_on_disconnect(void *user_data) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct disconnect_args *args = user_data;
    struct mqtt_nodejs_connection *node_connection = args->connection;
    napi_env env = node_connection->env;
    if (args->callback.callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_disconnect = NULL;
        napi_get_reference_value(env, args->callback.callback, &on_disconnect);
        if (on_disconnect) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, args->callback.async_context, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            if (napi_get_global(env, &recv)) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(env, args->callback.async_context, recv, on_disconnect, 0, NULL, NULL)) {
                s_raise_napi_error(env, s_callback_invocation_failed);
            }
        }
    }

cleanup:
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }

    aws_napi_callback_clean_up(&args->callback);
    aws_mem_release(node_connection->allocator, args);
}

static void s_on_disconnected(struct aws_mqtt_client_connection *connection, void *user_data) {
    (void)connection;

    struct disconnect_args *args = user_data;
    aws_uv_context_enqueue(args->connection->uv_context, s_dispatch_on_disconnect, args);
}

napi_value aws_napi_mqtt_client_connection_disconnect(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    struct mqtt_nodejs_connection *node_connection = NULL;
    struct disconnect_args *args = aws_mem_calloc(allocator, 1, sizeof(struct disconnect_args));

    if (!args) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    napi_value node_args[2];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "mqtt_client_connection_disconnect needs exactly 2 arguments");
        goto cleanup;
    }

    if (napi_get_value_external(env, node_args[0], (void **)&node_connection)) {
        napi_throw_error(env, NULL, "Failed to extract connection from first argument");
        goto cleanup;
    }

    args->connection = node_connection;

    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        if (aws_napi_callback_init(&args->callback, env, node_args[1], "aws_mqtt_client_connection_on_disconnect")) {
            goto cleanup;
        }
    }

    if (aws_mqtt_client_connection_disconnect(node_connection->connection, s_on_disconnected, args)) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

    return NULL;
cleanup:
    aws_napi_callback_clean_up(&args->callback);
    aws_mem_release(allocator, args);

    return NULL;
}
