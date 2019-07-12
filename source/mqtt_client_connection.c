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

/* A few notes on what's going on here:
 * 1. We can only talk to javascript from the main uv loop.
 * 2. Our IO and associated callbacks are invoked on aws-c-io's event-loop(s)
 * So, what we do is in each callback from aws-c-mqtt, we add data to a queue
 * and then thump the main uv loop to process the message so that we can
 * then get back into javascript land.
 *
 * The various callback types are enum mqtt_nodejs_cb_type. Each uv loop callback
 * receives an instance of struct mqtt_nodejs_callback_context.
 *
 * aws-c-mqtt callbacks invoke s_queue_dispatch_callback which queues the message
 * and thumps uv loop.
 *
 * s_mqtt_uv_async_cb, received the message in the correct thread and then dispatches
 * the message based on its enum mqtt_nodejs_cb_type. See the table below:
 *
 * s_mqtt_callback_fns.
 */
enum mqtt_nodejs_cb_type {
    MQTT_NODEJS_CB_ON_CONNECT,
    MQTT_NODEJS_CB_ON_INTERRUPTED,
    MQTT_NODEJS_CB_ON_RESUMED,
    MQTT_NODEJS_CB_ON_DISCONNECTED,
    MQTT_NODEJS_CB_ON_PUBLISH_COMPLETE,
    MQTT_NODEJS_CB_ON_PUBLISH,
    MQTT_NODEJS_CB_ON_SUBACK,
    MQTT_NODEJS_CB_ON_UNSUBACK,
    MQTT_NODEJS_CB_ON_ERROR,
    MQTT_NODEJS_FREE_ON_PUBLISH_DATA,
};

struct mqtt_nodejs_connection;

struct mqtt_nodejs_callback_context {
    struct aws_allocator *allocator;
    struct aws_linked_list_node node;
    napi_ref callback;
    napi_async_context callback_ctx;
    struct aws_byte_buf payload_data;
    struct mqtt_nodejs_connection *connection;
    int error_code;
    uint16_t packet_id;
    struct aws_byte_buf topic;
    bool session_present;
    enum aws_mqtt_connect_return_code connect_code;
    enum aws_mqtt_qos qos;
    enum mqtt_nodejs_cb_type cb_type;
};

struct mqtt_nodejs_connection {
    struct aws_allocator *allocator;
    struct aws_socket_options socket_options;
    struct aws_tls_connection_options tls_options;
    struct mqtt_nodejs_client *node_client;
    struct aws_mqtt_client_connection *connection;

    struct mqtt_nodejs_callback_context error_context;

    napi_env env;
    uv_async_t async_handle;

    struct {
        struct aws_linked_list queued_cb; /* type is  mqtt_nodejs_callback_context */
        struct aws_mutex queued_cb_lock;
    } thread_data;

    napi_async_context on_connect_ctx;
    napi_ref on_connect;
    napi_ref on_connection_interrupted;
    napi_async_context on_connection_interrupted_ctx;

    napi_ref on_connection_resumed;
    napi_async_context on_connection_resumed_ctx;
};

typedef void(dispatch_mqtt_callback_fn)(struct mqtt_nodejs_callback_context *context);

static void s_dispatch_error(struct mqtt_nodejs_callback_context *context) {
    napi_env env = context->connection->env;

    napi_handle_scope handle_scope = NULL;
    aws_raise_error(context->error_code);

    napi_open_handle_scope(env, &handle_scope);
    /* assumption, error code is thread local, and this always runs on the libuv thread
       so raise it here.  */
    aws_napi_throw_last_error(env);
    napi_close_handle_scope(env, handle_scope);
}

static void s_raise_napi_error(napi_env env, const char *message) {
    napi_throw_error(env, "Runtime Error", message);
}

static void s_dispatch_on_connect(struct mqtt_nodejs_callback_context *context);
static void s_dispatch_on_interrupt(struct mqtt_nodejs_callback_context *context);
static void s_dispatch_on_resumed(struct mqtt_nodejs_callback_context *context);
static void s_dispatch_on_disconnect(struct mqtt_nodejs_callback_context *context);
static void s_dispatch_on_suback(struct mqtt_nodejs_callback_context *context);
static void s_dispatch_free_on_publish_data(struct mqtt_nodejs_callback_context *context);
static void s_dispatch_on_publish(struct mqtt_nodejs_callback_context *context);
static void s_dispatch_on_publish_complete(struct mqtt_nodejs_callback_context *context);
static void s_dispatch_on_unsub_ack(struct mqtt_nodejs_callback_context *context);

static dispatch_mqtt_callback_fn *s_mqtt_callback_fns[] = {
    [MQTT_NODEJS_CB_ON_CONNECT] = s_dispatch_on_connect,
    [MQTT_NODEJS_CB_ON_INTERRUPTED] = s_dispatch_on_interrupt,
    [MQTT_NODEJS_CB_ON_RESUMED] = s_dispatch_on_resumed,
    [MQTT_NODEJS_CB_ON_DISCONNECTED] = s_dispatch_on_disconnect,
    [MQTT_NODEJS_CB_ON_PUBLISH_COMPLETE] = s_dispatch_on_publish_complete,
    [MQTT_NODEJS_CB_ON_PUBLISH] = s_dispatch_on_publish,
    [MQTT_NODEJS_CB_ON_SUBACK] = s_dispatch_on_suback,
    [MQTT_NODEJS_CB_ON_UNSUBACK] = s_dispatch_on_unsub_ack,
    [MQTT_NODEJS_CB_ON_ERROR] = s_dispatch_error,
    [MQTT_NODEJS_FREE_ON_PUBLISH_DATA] = s_dispatch_free_on_publish_data,
};

static void s_queue_dispatch_callback(struct mqtt_nodejs_callback_context *context) {
    struct mqtt_nodejs_connection *nodejs_connection = context->connection;

    aws_mutex_lock(&nodejs_connection->thread_data.queued_cb_lock);
    /* it doesn't hurt to do this check here, but it's specifically for error context, because
       there's technically a race condition on it otherwise. */
    if (!(context->node.next || context->node.prev)) {
        aws_linked_list_push_back(&context->connection->thread_data.queued_cb, &context->node);
    }
    aws_mutex_unlock(&nodejs_connection->thread_data.queued_cb_lock);

    uv_async_send(&context->connection->async_handle);
}

static void s_mqtt_uv_async_cb(uv_async_t *handle) {
    struct mqtt_nodejs_connection *nodejs_connection = handle->data;

    struct aws_linked_list list_cpy;
    aws_linked_list_init(&list_cpy);

    aws_mutex_lock(&nodejs_connection->thread_data.queued_cb_lock);
    aws_linked_list_swap_contents(&list_cpy, &nodejs_connection->thread_data.queued_cb);
    aws_mutex_unlock(&nodejs_connection->thread_data.queued_cb_lock);

    while (!aws_linked_list_empty(&list_cpy)) {
        /* the error dispatch shares a single node, so we need to hold the lock during the pop to accomodate
           the, "don't queue twice" check. There's still technically a race on the error code, but it doesn't really
           matter, if we report the later error, it's a word and shouldn't rip, and we don't care which one we report in
           that case. */
        aws_mutex_lock(&nodejs_connection->thread_data.queued_cb_lock);
        struct aws_linked_list_node *node = aws_linked_list_pop_front(&list_cpy);
        aws_mutex_unlock(&nodejs_connection->thread_data.queued_cb_lock);
        struct mqtt_nodejs_callback_context *callback_context =
            AWS_CONTAINER_OF(node, struct mqtt_nodejs_callback_context, node);
        s_mqtt_callback_fns[callback_context->cb_type](callback_context);
    }
}

/*******************************************************************************
 * New Connection
 ******************************************************************************/
static void s_async_handle_close_cb(uv_handle_t *handle) {
    struct mqtt_nodejs_connection *node_connection = handle->data;
    aws_mqtt_client_connection_destroy(node_connection->connection);
    aws_mem_release(node_connection->allocator, node_connection);
}

napi_value mqtt_client_connection_close(napi_env env, napi_callback_info info) {
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

    if (node_connection->on_connection_interrupted) {
        napi_async_destroy(env, node_connection->on_connection_interrupted_ctx);
        napi_delete_reference(env, node_connection->on_connection_interrupted);
    }

    if (node_connection->on_connection_resumed) {
        napi_async_destroy(env, node_connection->on_connection_resumed_ctx);
        napi_delete_reference(env, node_connection->on_connection_resumed);
    }

    /* since closing this handle is asynchronous, we need to wait for the callback to clean
       up the connection. */
    uv_close((uv_handle_t *)&node_connection->async_handle, s_async_handle_close_cb);

    napi_value undefined = NULL;
    napi_get_undefined(env, &undefined);
    return undefined;
}

/************************************
 * Connection object initialization
 ************************************/
static void s_dispatch_on_interrupt(struct mqtt_nodejs_callback_context *context) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;

    if (node_connection->on_connection_interrupted) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_connection_interrupted = NULL;
        napi_get_reference_value(env, node_connection->on_connection_interrupted, &on_connection_interrupted);
        if (on_connection_interrupted) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(
                    env, resource_object, node_connection->on_connection_interrupted_ctx, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[1];
            if (napi_get_global(env, &recv) || napi_create_int32(env, context->error_code, &params[0])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(
                    env,
                    node_connection->on_connection_interrupted_ctx,
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

    aws_mem_release(context->allocator, context);
}

static void s_dispatch_on_resumed(struct mqtt_nodejs_callback_context *context) {

    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;

    if (node_connection->on_connection_resumed) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_connection_resumed = NULL;
        napi_get_reference_value(env, node_connection->on_connection_resumed, &on_connection_resumed);
        if (on_connection_resumed) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, node_connection->on_connection_resumed_ctx, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[2];
            if (napi_get_global(env, &recv) || napi_create_int32(env, context->connect_code, &params[0]) ||
                napi_get_boolean(env, context->session_present, &params[1])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(
                    env,
                    node_connection->on_connection_resumed_ctx,
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

    aws_mem_release(context->allocator, context);
}

static void s_on_connection_interrupted(
    struct aws_mqtt_client_connection *connection,
    int error_code,
    void *user_data) {
    (void)connection;

    struct mqtt_nodejs_connection *nodejs_connection = user_data;

    struct mqtt_nodejs_callback_context *context =
        aws_mem_calloc(nodejs_connection->allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

    if (!context) {
        context = &nodejs_connection->error_context;
        context->error_code = aws_last_error();
    } else {
        context->allocator = nodejs_connection->allocator;
        context->error_code = error_code;
        context->callback = nodejs_connection->on_connection_interrupted;
        context->cb_type = MQTT_NODEJS_CB_ON_INTERRUPTED;
        context->connection = nodejs_connection;
    }

    s_queue_dispatch_callback(context);
}

static void s_on_connection_resumed(
    struct aws_mqtt_client_connection *connection,
    enum aws_mqtt_connect_return_code return_code,
    bool session_present,
    void *user_data) {
    (void)connection;

    struct mqtt_nodejs_connection *nodejs_connection = user_data;

    struct mqtt_nodejs_callback_context *context =
        aws_mem_calloc(nodejs_connection->allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

    if (!context) {
        context = &nodejs_connection->error_context;
        context->error_code = aws_last_error();
    } else {
        context->allocator = nodejs_connection->allocator;
        context->session_present = session_present;
        context->connect_code = return_code;
        context->callback = nodejs_connection->on_connection_resumed;
        context->cb_type = MQTT_NODEJS_CB_ON_RESUMED;
        context->connection = nodejs_connection;
    }

    s_queue_dispatch_callback(context);
}

napi_value mqtt_client_connection_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    napi_value result = NULL;

    struct mqtt_nodejs_connection *node_connection =
        aws_mem_calloc(allocator, 1, sizeof(struct mqtt_nodejs_connection));
    if (!node_connection) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    node_connection->error_context.allocator = allocator;
    node_connection->error_context.connection = node_connection;
    node_connection->error_context.cb_type = MQTT_NODEJS_CB_ON_ERROR;
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
        if (napi_create_reference(env, node_args[1], 1, &node_connection->on_connection_interrupted)) {
            napi_value resource_name = NULL;
            napi_create_string_utf8(
                env, "aws_mqtt_client_connection_on_connection_interrupted", NAPI_AUTO_LENGTH, &resource_name);
            napi_async_init(env, NULL, resource_name, &node_connection->on_connection_interrupted_ctx);
            napi_throw_error(env, NULL, "Could not create ref from on_connnection_interrupted");
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[2])) {
        if (napi_create_reference(env, node_args[2], 1, &node_connection->on_connection_resumed)) {
            napi_value resource_name = NULL;
            napi_create_string_utf8(
                env, "aws_mqtt_client_connection_on_connection_resumed", NAPI_AUTO_LENGTH, &resource_name);
            napi_async_init(env, NULL, resource_name, &node_connection->on_connection_resumed_ctx);
            napi_throw_error(env, NULL, "Could not create ref from on_connection_resumed");
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

    if (node_connection->on_connection_interrupted || node_connection->on_connection_resumed) {
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

    uv_loop_t *uv_loop = NULL;
    napi_get_uv_event_loop(env, &uv_loop);

    if (!uv_loop) {
        napi_throw_error(env, NULL, "Failed to acquire a handle on a uv_loop");
        goto cleanup;
    }

    uv_async_init(uv_loop, &node_connection->async_handle, s_mqtt_uv_async_cb);
    node_connection->async_handle.data = node_connection;
    aws_mutex_init(&node_connection->thread_data.queued_cb_lock);
    aws_linked_list_init(&node_connection->thread_data.queued_cb);

cleanup:

    if (!result) {
        if (node_connection->connection) {
            aws_mqtt_client_connection_destroy(node_connection->connection);
        }

        if (node_connection->on_connection_interrupted) {
            napi_async_destroy(env, node_connection->on_connection_interrupted_ctx);
            napi_delete_reference(env, node_connection->on_connection_interrupted);
        }

        if (node_connection->on_connection_resumed) {
            napi_async_destroy(env, node_connection->on_connection_resumed_ctx);
            napi_delete_reference(env, node_connection->on_connection_resumed);
        }

        if (uv_loop) {
            uv_unref((uv_handle_t *)&node_connection->async_handle);
        }

        aws_mem_release(allocator, node_connection);
    }

    return result;
}

/*******************************************************************************
 * Connect
 ******************************************************************************/
static void s_dispatch_on_connect(struct mqtt_nodejs_callback_context *context) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;

    if (node_connection->on_connect) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_connect = NULL;
        napi_get_reference_value(env, node_connection->on_connect, &on_connect);
        if (on_connect) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, node_connection->on_connect_ctx, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[3];
            if (napi_get_global(env, &recv) || napi_create_int32(env, context->error_code, &params[0]) ||
                napi_create_int32(env, context->connect_code, &params[1]) ||
                napi_get_boolean(env, context->session_present, &params[2])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(
                    env, node_connection->on_connect_ctx, recv, on_connect, AWS_ARRAY_SIZE(params), params, NULL)) {
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

    if (node_connection->on_connect) {
        napi_async_destroy(env, node_connection->on_connect_ctx);
        napi_delete_reference(env, node_connection->on_connect);
    }

    aws_mem_release(context->allocator, context);
}

static void s_on_connected(
    struct aws_mqtt_client_connection *connection,
    int error_code,
    enum aws_mqtt_connect_return_code return_code,
    bool session_present,
    void *user_data) {
    (void)connection;

    struct mqtt_nodejs_connection *nodejs_connection = user_data;

    struct mqtt_nodejs_callback_context *context =
        aws_mem_calloc(nodejs_connection->allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

    if (!context) {
        context = &nodejs_connection->error_context;
        context->error_code = aws_last_error();
    } else {
        context->allocator = nodejs_connection->allocator;
        context->error_code = error_code;
        context->session_present = session_present;
        context->connect_code = return_code;
        context->callback = nodejs_connection->on_connect;
        context->cb_type = MQTT_NODEJS_CB_ON_CONNECT;
        context->connection = nodejs_connection;
    }

    s_queue_dispatch_callback(context);
}

napi_value mqtt_client_connection_connect(napi_env env, napi_callback_info info) {

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
        if (napi_create_reference(env, node_args[13], 1, &node_connection->on_connect)) {
            napi_throw_error(env, NULL, "Could not create ref from on_connect");
        }
        /* Init the async */
        napi_value resource_name = NULL;
        napi_create_string_utf8(env, "aws_mqtt_client_connection_on_connect", NAPI_AUTO_LENGTH, &resource_name);
        napi_async_init(env, NULL, resource_name, &node_connection->on_connect_ctx);
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

napi_value mqtt_client_connection_reconnect(napi_env env, napi_callback_info info) {

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
        if (node_connection->on_connect) {
            napi_delete_reference(env, node_connection->on_connect);
            napi_async_destroy(env, node_connection->on_connect_ctx);
        }

        if (napi_create_reference(env, node_args[1], 1, &node_connection->on_connect)) {
            napi_throw_error(env, NULL, "Could not create ref from on_connect");
            goto cleanup;
        }
        /* Init the async */
        napi_value resource_name = NULL;
        if (napi_create_string_utf8(env, "mqtt_client_connection_on_reconnect", NAPI_AUTO_LENGTH, &resource_name)) {
            napi_throw_error(env, NULL, "Could not create async resource name");
            goto cleanup;
        }
        if (napi_async_init(env, NULL, resource_name, &node_connection->on_connect_ctx)) {
            napi_throw_error(env, NULL, "Could not create async context");
            goto cleanup;
        }
    }

    if (aws_mqtt_client_connection_reconnect(node_connection->connection, s_on_connected, node_connection)) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

    /* Return undefined */
    napi_get_undefined(env, &result);
    return result;

cleanup:
    if (node_connection->on_connect) {
        napi_delete_reference(env, node_connection->on_connect);
        napi_async_destroy(env, node_connection->on_connect_ctx);
    }
    return result;
}

/*******************************************************************************
 * Publish
 ******************************************************************************/
static void s_dispatch_on_publish_complete(struct mqtt_nodejs_callback_context *context) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;
    if (context->callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_publish = NULL;
        napi_get_reference_value(env, context->callback, &on_publish);
        if (on_publish) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, context->callback_ctx, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[2];
            if (napi_get_global(env, &recv) || napi_create_uint32(env, context->packet_id, &params[0]) ||
                napi_create_int32(env, context->error_code, &params[1])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(
                    env, context->callback_ctx, recv, on_publish, AWS_ARRAY_SIZE(params), params, NULL)) {
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

    if (context->callback) {
        napi_async_destroy(env, context->callback_ctx);
        napi_delete_reference(env, context->callback);
    }

    aws_mem_release(context->allocator, context);
}

static void s_on_publish_complete(
    struct aws_mqtt_client_connection *connection,
    uint16_t packet_id,
    int error_code,
    void *user_data) {

    (void)connection;

    struct mqtt_nodejs_callback_context *context = user_data;

    /* Clean up resources */
    aws_byte_buf_clean_up(&context->payload_data);

    context->cb_type = MQTT_NODEJS_CB_ON_PUBLISH_COMPLETE;
    context->packet_id = packet_id;
    context->error_code = error_code;

    s_queue_dispatch_callback(context);
}

napi_value mqtt_client_connection_publish(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();

    struct mqtt_nodejs_callback_context *context =
        aws_mem_calloc(allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

    if (!context) {
        aws_napi_throw_last_error(env);
        return NULL;
    }
    AWS_ZERO_STRUCT(*context);

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

    context->connection = node_connection;
    context->allocator = allocator;

    if (aws_byte_buf_init_from_napi(&context->topic, env, node_args[1])) {
        napi_throw_type_error(env, NULL, "Second argument (topic) must be a String");
        goto cleanup;
    }

    if (aws_byte_buf_init_from_napi(&context->payload_data, env, node_args[2])) {
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
        if (napi_create_reference(env, node_args[5], 1, &context->callback)) {
            napi_throw_error(env, NULL, "Could not create ref from on_publish");
            goto cleanup;
        }
        /* Init the async */
        napi_value resource_name = NULL;
        if (napi_create_string_utf8(env, "aws_mqtt_client_connection_on_publish", NAPI_AUTO_LENGTH, &resource_name)) {
            napi_delete_reference(env, context->callback);
            napi_throw_error(env, NULL, "Could not create async resource name");
            goto cleanup;
        }
        if (napi_async_init(env, NULL, resource_name, &context->callback_ctx)) {
            napi_delete_reference(env, context->callback);
            napi_throw_error(env, NULL, "Could not create async context");
            goto cleanup;
        }
    }

    const struct aws_byte_cursor topic_cur = aws_byte_cursor_from_buf(&context->topic);
    const struct aws_byte_cursor payload_cur = aws_byte_cursor_from_buf(&context->payload_data);
    uint16_t pub_id = aws_mqtt_client_connection_publish(
        node_connection->connection, &topic_cur, qos, retain, &payload_cur, s_on_publish_complete, context);
    if (!pub_id) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

    napi_value undefined;
    napi_get_undefined(env, &undefined);
    return undefined;

cleanup:
    aws_byte_buf_clean_up(&context->payload_data);
    aws_byte_buf_clean_up(&context->topic);

    if (context->callback) {
        napi_delete_reference(env, context->callback);
        napi_async_destroy(env, context->callback_ctx);
    }

    aws_mem_release(allocator, context);

    return NULL;
}

/*******************************************************************************
 * Subscribe
 ******************************************************************************/
static void s_dispatch_on_suback(struct mqtt_nodejs_callback_context *context) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;
    if (context->callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_suback = NULL;
        napi_get_reference_value(env, context->callback, &on_suback);
        if (on_suback) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, context->callback_ctx, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[4];
            if (napi_get_global(env, &recv) || napi_create_int32(env, context->packet_id, &params[0]) ||
                napi_create_string_utf8(env, (const char *)context->topic.buffer, context->topic.len, &params[1]) ||
                napi_create_int32(env, context->qos, &params[2]) ||
                napi_create_int32(env, context->error_code, &params[3])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(env, context->callback_ctx, recv, on_suback, AWS_ARRAY_SIZE(params), params, NULL)) {
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

    if (context->callback) {
        napi_async_destroy(env, context->callback_ctx);
        napi_delete_reference(env, context->callback);
    }

    aws_mem_release(context->allocator, context);
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

    struct mqtt_nodejs_callback_context *context = user_data;

    context->error_code = error_code;
    context->qos = qos;
    context->packet_id = packet_id;
    context->cb_type = MQTT_NODEJS_CB_ON_SUBACK;

    s_queue_dispatch_callback(context);
}

/* deleting these callbacks has to happen in the node thread, so use the message bus to do it. */
static void s_dispatch_free_on_publish_data(struct mqtt_nodejs_callback_context *context) {
    if (context->callback) {
        napi_delete_reference(context->connection->env, context->callback);
        napi_async_destroy(context->connection->env, context->callback_ctx);
    }

    aws_byte_buf_clean_up(&context->topic);
    aws_mem_release(context->allocator, context);
}

static void s_on_publish_user_data_clean_up(void *user_data) {
    struct mqtt_nodejs_callback_context *context = user_data;
    context->cb_type = MQTT_NODEJS_FREE_ON_PUBLISH_DATA;

    s_queue_dispatch_callback(context);
}

static void s_dispatch_on_publish(struct mqtt_nodejs_callback_context *context) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;
    if (context->callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_publish = NULL;
        napi_get_reference_value(env, context->callback, &on_publish);
        if (on_publish) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, context->callback_ctx, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[2];
            if (napi_get_global(env, &recv) ||
                napi_create_string_utf8(env, (const char *)context->topic.buffer, context->topic.len, &params[0]) ||
                napi_create_external_arraybuffer(
                    env, context->payload_data.buffer, context->payload_data.len, NULL, NULL, &params[1])) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(
                    env, context->callback_ctx, recv, on_publish, AWS_ARRAY_SIZE(params), params, NULL)) {
                s_raise_napi_error(env, s_callback_invocation_failed);
            }

            aws_byte_buf_clean_up(&context->payload_data);
        }
    }

cleanup:
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }

    aws_mem_release(context->allocator, context);
}

static void s_on_publish(
    struct aws_mqtt_client_connection *connection,
    const struct aws_byte_cursor *topic,
    const struct aws_byte_cursor *payload,
    void *user_data) {

    (void)connection;
    (void)topic;

    struct mqtt_nodejs_callback_context *subscribe_context = user_data;
    struct mqtt_nodejs_callback_context *context =
        aws_mem_calloc(subscribe_context->allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

    if (!context) {
        context = &subscribe_context->connection->error_context;
        context->error_code = aws_last_error();
    } else {
        context->connection = subscribe_context->connection;
        context->cb_type = MQTT_NODEJS_CB_ON_PUBLISH;
        context->allocator = subscribe_context->allocator;
        context->topic = subscribe_context->topic;
        context->callback = subscribe_context->callback;
        context->callback_ctx = subscribe_context->callback_ctx;

        if (aws_byte_buf_init_copy_from_cursor(&context->payload_data, context->allocator, *payload)) {
            aws_mem_release(subscribe_context->allocator, context);
            context = &subscribe_context->connection->error_context;
            context->error_code = aws_last_error();
        }
    }

    s_queue_dispatch_callback(context);
}

napi_value mqtt_client_connection_subscribe(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    struct mqtt_nodejs_callback_context *on_publish_context =
        aws_mem_calloc(allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

    if (!on_publish_context) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    struct mqtt_nodejs_callback_context *context =
        aws_mem_calloc(allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

    if (!context) {
        aws_mem_release(allocator, on_publish_context);
        aws_napi_throw_last_error(env);
        return NULL;
    }

    on_publish_context->allocator = allocator;
    context->allocator = allocator;

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

    on_publish_context->connection = node_connection;
    context->connection = node_connection;

    if (aws_byte_buf_init_from_napi(&on_publish_context->topic, env, node_args[1])) {
        napi_throw_type_error(env, NULL, "Second argument (topic) must be a String");
        goto cleanup;
    }

    enum aws_mqtt_qos qos = 0;
    if (napi_get_value_uint32(env, node_args[2], &qos)) {
        napi_throw_type_error(env, NULL, "Third argument (qos) must be a number");
        goto cleanup;
    }

    if (aws_napi_is_null_or_undefined(env, node_args[3])) {
        napi_throw_type_error(env, NULL, "on_message callback is required");
        goto cleanup;
    }
    if (napi_create_reference(env, node_args[3], 1, &on_publish_context->callback)) {
        napi_throw_error(env, NULL, "Could not create ref from on_message");
        goto cleanup;
    }
    /* Init the async */
    napi_value resource_name = NULL;
    if (napi_create_string_utf8(env, "aws_mqtt_client_connection_on_message", NAPI_AUTO_LENGTH, &resource_name)) {
        goto cleanup;
    }
    if (napi_async_init(env, NULL, resource_name, &on_publish_context->callback_ctx)) {
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[4])) {
        if (napi_create_reference(env, node_args[4], 1, &context->callback)) {
            napi_throw_error(env, NULL, "Could not create ref from on_suback");
            goto cleanup;
        }
        /* Init the async */
        napi_value resource_name = NULL;
        if (napi_create_string_utf8(env, "aws_mqtt_client_connection_on_suback", NAPI_AUTO_LENGTH, &resource_name)) {
            goto cleanup;
        }
        if (napi_async_init(env, NULL, resource_name, &context->callback_ctx)) {
            goto cleanup;
        }
    }

    struct aws_byte_cursor topic_cur = aws_byte_cursor_from_buf(&on_publish_context->topic);
    uint16_t sub_id = aws_mqtt_client_connection_subscribe(
        node_connection->connection,
        &topic_cur,
        qos,
        s_on_publish,
        on_publish_context,
        s_on_publish_user_data_clean_up,
        s_on_suback,
        context);

    if (!sub_id) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

    napi_value undefined;
    napi_get_undefined(env, &undefined);
    return undefined;

cleanup:
    if (on_publish_context->topic.buffer) {
        aws_byte_buf_clean_up(&on_publish_context->topic);
    }

    if (on_publish_context->callback) {
        napi_delete_reference(env, on_publish_context->callback);
    }
    if (on_publish_context->callback_ctx) {
        napi_async_destroy(env, on_publish_context->callback_ctx);
    }

    if (context->callback) {
        napi_delete_reference(env, context->callback);
    }
    if (context->callback_ctx) {
        napi_async_destroy(env, context->callback_ctx);
    }

    aws_mem_release(allocator, on_publish_context);
    aws_mem_release(allocator, context);

    return NULL;
}

/*******************************************************************************
 * Unsubscribe
 ******************************************************************************/

static void s_dispatch_on_unsub_ack(struct mqtt_nodejs_callback_context *context) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;
    if (context->callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_unsub_ack = NULL;
        napi_get_reference_value(env, context->callback, &on_unsub_ack);
        if (on_unsub_ack) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, context->callback_ctx, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            napi_value params[2];
            if (napi_get_global(env, &recv) || napi_create_uint32(env, context->packet_id, &params[0]) ||
                napi_create_int32(env, context->error_code, &params[1])) {
                goto cleanup;
            }

            if (napi_make_callback(
                    env, context->callback_ctx, recv, on_unsub_ack, AWS_ARRAY_SIZE(params), params, NULL)) {
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

    if (context->callback) {
        napi_async_destroy(env, context->callback_ctx);
        napi_delete_reference(env, context->callback);
    }

    aws_mem_release(context->allocator, context);
}

static void s_on_unsubscribe_complete(
    struct aws_mqtt_client_connection *connection,
    uint16_t packet_id,
    int error_code,
    void *user_data) {
    (void)connection;

    struct mqtt_nodejs_callback_context *context = user_data;
    context->cb_type = MQTT_NODEJS_CB_ON_UNSUBACK;
    context->packet_id = packet_id;
    context->error_code = error_code;

    s_queue_dispatch_callback(context);
}

napi_value mqtt_client_connection_unsubscribe(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();

    struct mqtt_nodejs_callback_context *context =
        aws_mem_calloc(allocator, 1, sizeof(struct mqtt_nodejs_callback_context));
    if (!context) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    context->allocator = allocator;

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

    context->connection = node_connection;

    if (aws_byte_buf_init_from_napi(&context->topic, env, node_args[1])) {
        napi_throw_type_error(env, NULL, "Second argument (topic) must be a String");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[2])) {
        if (napi_create_reference(env, node_args[2], 1, &context->callback)) {
            napi_throw_error(env, NULL, "Could not create ref from on_unsuback");
            goto cleanup;
        }
        /* Init the async */
        napi_value resource_name = NULL;
        if (napi_create_string_utf8(env, "aws_mqtt_client_connection_on_unsuback", NAPI_AUTO_LENGTH, &resource_name)) {
            goto cleanup;
        }
        if (napi_async_init(env, NULL, resource_name, &context->callback_ctx)) {
            goto cleanup;
        }
    }

    const struct aws_byte_cursor topic_cur = aws_byte_cursor_from_buf(&context->topic);
    uint16_t unsub_id = aws_mqtt_client_connection_unsubscribe(
        node_connection->connection, &topic_cur, s_on_unsubscribe_complete, context);

    if (!unsub_id) {
        napi_throw_error(env, NULL, "Failed to initiate subscribe request");
        goto cleanup;
    }

    context->packet_id = unsub_id;

    napi_value undefined;
    napi_get_undefined(env, &undefined);
    return undefined;

cleanup:
    aws_byte_buf_clean_up(&context->topic);

    if (context->callback) {
        napi_delete_reference(env, context->callback);
    }
    if (context->callback_ctx) {
        napi_async_destroy(env, context->callback_ctx);
    }

    aws_mem_release(allocator, context);

    return NULL;
}

/*******************************************************************************
 * Disconnect
 ******************************************************************************/
static void s_dispatch_on_disconnect(struct mqtt_nodejs_callback_context *context) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;
    if (context->callback) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            s_raise_napi_error(env, s_handle_scope_open_failed);
            goto cleanup;
        }

        napi_value on_disconnect = NULL;
        napi_get_reference_value(env, context->callback, &on_disconnect);
        if (on_disconnect) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                s_raise_napi_error(env, s_resource_creation_failed);
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, context->callback_ctx, &cb_scope)) {
                s_raise_napi_error(env, s_callback_scope_open_failed);
                goto cleanup;
            }

            napi_value recv;
            if (napi_get_global(env, &recv)) {
                s_raise_napi_error(env, s_load_arguments_failed);
                goto cleanup;
            }

            if (napi_make_callback(env, context->callback_ctx, recv, on_disconnect, 0, NULL, NULL)) {
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

    if (context->callback) {
        napi_async_destroy(env, context->callback_ctx);
        napi_delete_reference(env, context->callback);
    }

    aws_mem_release(context->allocator, context);
}

static void s_on_disconnected(struct aws_mqtt_client_connection *connection, void *user_data) {
    (void)connection;

    struct mqtt_nodejs_callback_context *context = user_data;
    s_queue_dispatch_callback(context);
}

napi_value mqtt_client_connection_disconnect(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    ;
    struct mqtt_nodejs_connection *node_connection = NULL;
    struct mqtt_nodejs_callback_context *context =
        aws_mem_calloc(allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

    if (!context) {
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

    context->allocator = allocator;
    context->connection = node_connection;
    context->cb_type = MQTT_NODEJS_CB_ON_DISCONNECTED;

    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        if (napi_create_reference(env, node_args[1], 1, &context->callback)) {
            napi_throw_error(env, NULL, "Could not create ref from on_disconnect");
            goto cleanup;
        }
        /* Init the async */
        napi_value resource_name = NULL;
        if (napi_create_string_utf8(
                env, "aws_mqtt_client_connection_on_disconnect", NAPI_AUTO_LENGTH, &resource_name)) {
            napi_throw_error(env, NULL, "Could not create async resource name");
            goto cleanup;
        }
        if (napi_async_init(env, NULL, resource_name, &context->callback_ctx)) {
            napi_throw_error(env, NULL, "Could not create async context");
            goto cleanup;
        }
    }

    if (aws_mqtt_client_connection_disconnect(node_connection->connection, s_on_disconnected, context)) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

    napi_value undefined = NULL;
    napi_get_undefined(env, &undefined);
    return undefined;

cleanup:
    if (context->callback) {
        napi_delete_reference(env, context->callback);
    }
    if (context->callback_ctx) {
        napi_async_destroy(env, context->callback_ctx);
    }

    return NULL;
}
