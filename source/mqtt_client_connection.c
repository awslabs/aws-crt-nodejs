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

#include "module.h"
#include "mqtt_client.h"
#include "mqtt_client_connection.h"

#include <aws/mqtt/client.h>

#include <aws/io/socket.h>
#include <aws/io/tls_channel_handler.h>

#include <aws/common/linked_list.h>
#include <aws/common/mutex.h>

#include <uv.h>

enum mqtt_nodejs_cb_type {
    MQTT_NODEJS_CB_ON_CONNECT,
    MQTT_NODEJS_CB_ON_INTERUPTED,
    MQTT_NODEJS_CB_ON_RESUMED,
    MQTT_NODEJS_CB_ON_DISCONNECTED,
    MQTT_NODEJS_CB_ON_OP_COMPLETE,
    MQTT_NODEJS_CB_ON_PUBLISH,
};

struct mqtt_nodejs_connection {
    struct aws_allocator *allocator;
    struct aws_socket_options socket_options;
    struct aws_tls_connection_options tls_options;
    struct mqtt_nodejs_client *node_client;
    struct aws_mqtt_client_connection *connection;

    napi_env env;

    uv_async_t async_handle;
    struct aws_linked_list queued_cb; /* type is  mqtt_nodejs_callback_context */
    struct aws_mutex queued_cb_lock;

    napi_async_context on_connect_ctx;
    napi_ref on_connect;
    napi_ref on_connection_interupted;
    napi_async_context on_connection_interupted_ctx;

    napi_ref on_connection_resumed;
    napi_async_context on_connection_resumed_ctx;
    
    napi_ref on_disconnect;
    napi_async_context on_disconnect_ctx;
};

struct mqtt_nodejs_callback_context {
    struct aws_allocator *allocator;
    struct aws_linked_list_node node;
    napi_ref callback;
    struct mqtt_nodejs_connection *connection;
    int error_code;
    bool session_present;
    enum aws_mqtt_connect_return_code connect_code;
    enum mqtt_nodejs_cb_type cb_type;
};

typedef void(dispatch_mqtt_callback_fn)(struct mqtt_nodejs_callback_context *context);

static void s_dispatch_on_connect(struct mqtt_nodejs_callback_context *context) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;

    if (node_connection->on_connect) {

        if (napi_open_handle_scope(env, &handle_scope)) {
            goto cleanup;
        }

        napi_value on_connect = NULL;
        napi_get_reference_value(env, node_connection->on_connect, &on_connect);
        if (on_connect) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, node_connection->on_connect_ctx, &cb_scope)) {
                goto cleanup;
            }

            napi_value recv;
            napi_value params[3];
            if (napi_get_global(env, &recv) || napi_create_int32(env, context->error_code, &params[0]) ||
                napi_create_int32(env, context->connect_code, &params[1]) || napi_get_boolean(env, context->session_present, &params[2])) {
                goto cleanup;
            }

            if (napi_make_callback(
                    env, node_connection->on_connect_ctx, recv, on_connect, AWS_ARRAY_SIZE(params), params, NULL)) {
                /* #TODO: Log failed callback attempt here. */
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
    napi_async_destroy(env, node_connection->on_connect_ctx);
    napi_delete_reference(env, node_connection->on_connect);
}

static void s_dispatch_on_interupt(struct mqtt_nodejs_callback_context *context) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;

    if (node_connection->on_connection_interupted) {

        if (napi_open_handle_scope(env, &handle_scope)) {
            goto cleanup;
        }

        napi_value on_connection_interupted = NULL;
        napi_get_reference_value(env, node_connection->on_connection_interupted, &on_connection_interupted);
        if (on_connection_interupted) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, node_connection->on_connection_interupted_ctx, &cb_scope)) {
                goto cleanup;
            }

            napi_value recv;
            napi_value params[1];
            if (napi_get_global(env, &recv) || napi_create_int32(env, context->error_code, &params[0])) {
                goto cleanup;
            }

            if (napi_make_callback(
                    env, node_connection->on_connection_interupted_ctx, recv, on_connection_interupted, AWS_ARRAY_SIZE(params), params, NULL)) {
                /* #TODO: Log failed callback attempt here. */
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
    napi_async_destroy(env, node_connection->on_connection_interupted_ctx);
    napi_delete_reference(env, node_connection->on_connection_interupted);
}

static void s_dispatch_on_resumed(struct mqtt_nodejs_callback_context *context) {

    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;

    if (node_connection->on_connection_resumed) {

        if (napi_open_handle_scope(env, &handle_scope)) {
            goto cleanup;
        }

        napi_value on_connection_resumed = NULL;
        napi_get_reference_value(env, node_connection->on_connection_resumed, &on_connection_resumed);
        if (on_connection_resumed) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, node_connection->on_connection_resumed_ctx, &cb_scope)) {
                goto cleanup;
            }

            napi_value recv;
            napi_value params[2];
            if (napi_get_global(env, &recv) || napi_create_int32(env, context->connect_code, &params[0]) 
                || napi_get_boolean(env, context->session_present, &params[1])) {
                goto cleanup;
            }

            if (napi_make_callback(
                    env, node_connection->on_connection_resumed_ctx, recv, on_connection_resumed, AWS_ARRAY_SIZE(params), params, NULL)) {
                /* #TODO: Log failed callback attempt here. */
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
    napi_async_destroy(env, context->connection->on_connection_resumed_ctx);
    napi_delete_reference(env, context->connection->on_connection_resumed);
}


static void s_dispatch_on_disconnect(struct mqtt_nodejs_callback_context *context) {
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    struct mqtt_nodejs_connection *node_connection = context->connection;
    napi_env env = node_connection->env;
    if (node_connection->on_disconnect) {
        if (napi_open_handle_scope(env, &handle_scope)) {
            goto cleanup;
        }

        napi_value on_disconnect = NULL;
        napi_get_reference_value(env, node_connection->on_disconnect, &on_disconnect);
        if (on_disconnect) {
            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, node_connection->on_disconnect_ctx, &cb_scope)) {
                goto cleanup;
            }

            napi_value recv;
            if (napi_get_global(env, &recv)) {
                goto cleanup;
            }

            if (napi_make_callback(
                    env, node_connection->on_disconnect_ctx, recv, on_disconnect, 0, NULL, NULL)) {
                /* #TODO: Log failed callback attempt here. */
            }
        }

        //uv_unref(&node_connection->async_handle);
    }

cleanup:
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }
    napi_async_destroy(env, node_connection->on_disconnect_ctx);
    napi_delete_reference(env, node_connection->on_disconnect);
}

static dispatch_mqtt_callback_fn *s_mqtt_callback_fns[] = {
    [MQTT_NODEJS_CB_ON_CONNECT] = s_dispatch_on_connect,
    [MQTT_NODEJS_CB_ON_INTERUPTED] = s_dispatch_on_interupt,
    [MQTT_NODEJS_CB_ON_RESUMED] = s_dispatch_on_resumed,
    [MQTT_NODEJS_CB_ON_DISCONNECTED] = s_dispatch_on_disconnect,
    [MQTT_NODEJS_CB_ON_OP_COMPLETE] = NULL,
    [MQTT_NODEJS_CB_ON_PUBLISH] = NULL,
};

static void s_mqtt_uv_async_cb(uv_async_t* handle) {
    struct mqtt_nodejs_connection *nodejs_connection = handle->data;

    struct aws_linked_list list_cpy;
    aws_linked_list_init(&list_cpy);

    aws_mutex_lock(&nodejs_connection->queued_cb_lock);
    aws_linked_list_swap_contents(&list_cpy, &nodejs_connection->queued_cb);
    aws_mutex_unlock(&nodejs_connection->queued_cb_lock);

    while (!aws_linked_list_empty(&list_cpy)) {
        struct aws_linked_list_node *node = aws_linked_list_pop_front(&list_cpy);
        struct mqtt_nodejs_callback_context *callback_context = AWS_CONTAINER_OF(node, struct mqtt_nodejs_callback_context, node);
        s_mqtt_callback_fns[callback_context->cb_type](callback_context);
        aws_mem_release(callback_context->allocator, callback_context);
    }
}

static void s_on_connected(
    struct aws_mqtt_client_connection *connection,
    int error_code,
    enum aws_mqtt_connect_return_code return_code,
    bool session_present,
    void *user_data) {
        struct mqtt_nodejs_connection *nodejs_connection = user_data;

        struct mqtt_nodejs_callback_context *context = 
            aws_mem_calloc(nodejs_connection->allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

        if (!context) {
            //what to do here....
        }

        context->allocator =  nodejs_connection->allocator;
        context->error_code = error_code;
        context->session_present = session_present;
        context->connect_code = return_code;
        context->callback = nodejs_connection->on_connect;
        context->cb_type =  MQTT_NODEJS_CB_ON_CONNECT;
        context->connection = nodejs_connection;

        aws_mutex_lock(&nodejs_connection->queued_cb_lock);
        aws_linked_list_push_back(&nodejs_connection->queued_cb, &context->node);
        aws_mutex_unlock(&nodejs_connection->queued_cb_lock);

        uv_async_send(&nodejs_connection->async_handle);
    }

static void s_on_connection_interupted(
    struct aws_mqtt_client_connection *connection,
    int error_code,
    void *user_data) {
        struct mqtt_nodejs_connection *nodejs_connection = user_data;

        struct mqtt_nodejs_callback_context *context = 
            aws_mem_calloc(nodejs_connection->allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

        if (!context) {
            //what to do here....
        }

        context->allocator =  nodejs_connection->allocator;
        context->error_code = error_code;
        context->callback = nodejs_connection->on_connection_interupted;
        context->cb_type =  MQTT_NODEJS_CB_ON_INTERUPTED;
        context->connection = nodejs_connection;

        aws_mutex_lock(&nodejs_connection->queued_cb_lock);
        aws_linked_list_push_back(&nodejs_connection->queued_cb, &context->node);
        aws_mutex_unlock(&nodejs_connection->queued_cb_lock);

        uv_async_send(&nodejs_connection->async_handle);
    }

static void s_on_connection_resumed(
    struct aws_mqtt_client_connection *connection,
    enum aws_mqtt_connect_return_code return_code,
    bool session_present,
    void *user_data) {
        struct mqtt_nodejs_connection *nodejs_connection = user_data;

        struct mqtt_nodejs_callback_context *context = 
            aws_mem_calloc(nodejs_connection->allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

        if (!context) {
            //what to do here....
        }

        context->allocator =  nodejs_connection->allocator;
        context->session_present = session_present;
        context->connect_code = return_code;
        context->callback = nodejs_connection->on_connection_resumed;
        context->cb_type =  MQTT_NODEJS_CB_ON_RESUMED;
        context->connection = nodejs_connection;

        aws_mutex_lock(&nodejs_connection->queued_cb_lock);
        aws_linked_list_push_back(&nodejs_connection->queued_cb, &context->node);
        aws_mutex_unlock(&nodejs_connection->queued_cb_lock);

        uv_async_send(&nodejs_connection->async_handle);
    }    

 static void s_on_disconnected(
    struct aws_mqtt_client_connection *connection,
    void *user_data) {
        struct mqtt_nodejs_connection *nodejs_connection = user_data;
        struct mqtt_nodejs_callback_context *context = 
            aws_mem_calloc(nodejs_connection->allocator, 1, sizeof(struct mqtt_nodejs_callback_context));

        if (!context) {
            //what to do here....
        }

        context->allocator =  nodejs_connection->allocator;
        context->callback = nodejs_connection->on_disconnect;
        context->cb_type =  MQTT_NODEJS_CB_ON_DISCONNECTED;
        context->connection = nodejs_connection;

        aws_mutex_lock(&nodejs_connection->queued_cb_lock);
        aws_linked_list_push_back(&nodejs_connection->queued_cb, &context->node);
        aws_mutex_unlock(&nodejs_connection->queued_cb_lock);

        uv_async_send(&nodejs_connection->async_handle);
    }   

/*******************************************************************************
 * New Connection
 ******************************************************************************/

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
    
    uv_unref((struct uv_handle_t *)&node_connection->async_handle);
    aws_mem_release(node_connection->allocator, node_connection);

    napi_value undefined = NULL;
    napi_get_undefined(env, &undefined);
    return undefined;
}

napi_value mqtt_client_connection_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    napi_value result = NULL;

    struct mqtt_nodejs_connection *node_connection = aws_mem_acquire(allocator, sizeof(struct mqtt_nodejs_connection));
    if (!node_connection) {
        aws_napi_throw_last_error(env);
        return NULL;
    }
    AWS_ZERO_STRUCT(*node_connection);

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
        if (napi_create_reference(env, node_args[1], 1, &node_connection->on_connection_interupted)) {
            napi_throw_error(env, NULL, "Could not create ref from on_connnection_interrupted");
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[2])) {
        if (napi_create_reference(env, node_args[2], 1, &node_connection->on_connection_resumed)) {
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

    if (node_connection->on_connection_interupted || node_connection->on_connection_resumed) {
        aws_mqtt_client_connection_set_connection_interruption_handlers(
            node_connection->connection, s_on_connection_interupted, node_connection, s_on_connection_resumed, node_connection);
    }

    napi_value node_external;
    if (napi_create_external(env, node_connection, NULL, NULL, &node_external)) {
        napi_throw_error(env, NULL, "Failed create n-api external");
        goto cleanup;
    }
    result = node_external;

    uv_loop_t *uv_loop = NULL;
    napi_get_uv_event_loop( env, &uv_loop);
    uv_async_init(uv_loop, &node_connection->async_handle, s_mqtt_uv_async_cb);
    node_connection->async_handle.data = node_connection;
    aws_mutex_init(&node_connection->queued_cb_lock);
    aws_linked_list_init(&node_connection->queued_cb);

cleanup:

    if (!result) {
        if (node_connection->connection) {
            aws_mqtt_client_connection_destroy(node_connection->connection);
        }

        if (node_connection->on_connection_interupted) {
            napi_delete_reference(env, node_connection->on_connection_interupted);
        }

        if (node_connection->on_connection_resumed) {
            napi_delete_reference(env, node_connection->on_connection_resumed);
        }

        if (uv_loop) {
            uv_unref(&node_connection->async_handle);
        }

        aws_mem_release(allocator, node_connection);       
    }

    return result;
}

/*******************************************************************************
 * Connect
 ******************************************************************************/
napi_value mqtt_client_connection_connect(napi_env env, napi_callback_info info) {

    napi_value result = NULL;

    struct aws_tls_ctx *tls_ctx = NULL;
    struct mqtt_nodejs_connection *node_connection = NULL;

    napi_value node_args[10];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "mqtt_client_connection_connect needs exactly 10 arguments");
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

    uint32_t keep_alive_time = 0;
    if (!aws_napi_is_null_or_undefined(env, node_args[5])) {
        if (napi_get_value_uint32(env, node_args[5], &keep_alive_time)) {
            napi_throw_type_error(env, NULL, "Sixth argument (keep_alive) must be a Number");
            goto cleanup;
        }
    }

    /* Handle Will */

    struct aws_byte_buf username;
    AWS_ZERO_STRUCT(username);
    if (!aws_napi_is_null_or_undefined(env, node_args[7])) {
        if (aws_byte_buf_init_from_napi(&username, env, node_args[7])) {
            napi_throw_type_error(env, NULL, "Eighth argument (username) must be a String");
            goto cleanup;
        }
    }

    struct aws_byte_buf password;
    AWS_ZERO_STRUCT(password);
    if (!aws_napi_is_null_or_undefined(env, node_args[8])) {
        if (aws_byte_buf_init_from_napi(&password, env, node_args[8])) {
            napi_throw_type_error(env, NULL, "Ninth argument (password) must be a String");
            goto cleanup;
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[9])) {
        if (napi_create_reference(env, node_args[9], 1, &node_connection->on_connect)) {
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

    AWS_ZERO_STRUCT(node_connection->socket_options);
    node_connection->socket_options.connect_timeout_ms = 3000;
    node_connection->socket_options.type = AWS_SOCKET_STREAM;

    struct aws_byte_cursor client_id_cur = aws_byte_cursor_from_buf(&client_id);
    struct aws_byte_cursor server_name_cur = aws_byte_cursor_from_buf(&server_name);

    struct aws_mqtt_connection_options options;
    options.clean_session = false; //TODO come back for this
    options.client_id = client_id_cur;
    options.host_name = server_name_cur;
    options.keep_alive_time_secs = keep_alive_time;
    options.on_connection_complete = s_on_connected;
    options.ping_timeout_ms = 3000; //TODO come back for this
    options.port = port_number;
    options.socket_options = &node_connection->socket_options;
    options.tls_options = tls_ctx ? &node_connection->tls_options : NULL;
    options.user_data = node_connection;

    if (aws_mqtt_client_connection_connect(
            node_connection->connection,
            &options)) {
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

struct publish_complete_userdata {
    struct aws_byte_buf topic;
    struct aws_byte_buf payload;

    napi_env env;

    napi_ref on_publish;
    napi_async_context on_publish_ctx;
};

void s_on_publish_complete(
    struct aws_mqtt_client_connection *connection,
    uint16_t packet_id,
    int error_code,
    void *userdata) {

    (void)connection;

    struct publish_complete_userdata *metadata = userdata;

    napi_env env = metadata->env;
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    /* Clean up resources */
    aws_byte_buf_clean_up(&metadata->topic);
    aws_byte_buf_clean_up(&metadata->payload);

    /* Call callback */
    if (metadata->on_publish) {

        if (napi_open_handle_scope(env, &handle_scope)) {
            goto cleanup;
        }

        napi_value on_publish = NULL;
        napi_get_reference_value(env, metadata->on_publish, &on_publish);
        if (on_publish) {

            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, metadata->on_publish_ctx, &cb_scope)) {
                goto cleanup;
            }

            napi_value recv;
            napi_value params[2];
            if (napi_get_global(env, &recv) || napi_create_uint32(env, packet_id, &params[0]) ||
                napi_create_int32(env, error_code, &params[1])) {
                goto cleanup;
            }

            if (napi_make_callback(
                    env, metadata->on_publish_ctx, recv, on_publish, AWS_ARRAY_SIZE(params), params, NULL)) {
                /* #TODO: Log failed callback attempt here. */
            }
        }
    }

cleanup:
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    napi_async_destroy(env, metadata->on_publish_ctx);
    napi_delete_reference(env, metadata->on_publish);

    /* Free metadata */
    aws_mem_release(aws_default_allocator(), metadata);
}

napi_value mqtt_client_connection_publish(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    struct publish_complete_userdata *metadata = aws_mem_acquire(allocator, sizeof(struct publish_complete_userdata));
    if (!metadata) {
        aws_napi_throw_last_error(env);
        return NULL;
    }
    AWS_ZERO_STRUCT(*metadata);
    metadata->env = env;

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

    if (aws_byte_buf_init_from_napi(&metadata->topic, env, node_args[1])) {
        napi_throw_type_error(env, NULL, "Second argument (topic) must be a String");
        goto cleanup;
    }

    if (aws_byte_buf_init_from_napi(&metadata->payload, env, node_args[2])) {
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
        if (napi_create_reference(env, node_args[5], 1, &metadata->on_publish)) {
            napi_throw_error(env, NULL, "Could not create ref from on_publish");
            goto cleanup;
        }
        /* Init the async */
        napi_value resource_name = NULL;
        if (napi_create_string_utf8(env, "aws_mqtt_client_connection_on_publish", NAPI_AUTO_LENGTH, &resource_name)) {
            napi_delete_reference(env, metadata->on_publish);
            napi_throw_error(env, NULL, "Could not create async resource name");
            goto cleanup;
        }
        if (napi_async_init(env, NULL, resource_name, &metadata->on_publish_ctx)) {
            napi_delete_reference(env, metadata->on_publish);
            napi_throw_error(env, NULL, "Could not create async context");
            goto cleanup;
        }
    }

    const struct aws_byte_cursor topic_cur = aws_byte_cursor_from_buf(&metadata->topic);
    const struct aws_byte_cursor payload_cur = aws_byte_cursor_from_buf(&metadata->payload);
    uint16_t pub_id = aws_mqtt_client_connection_publish(
        node_connection->connection, &topic_cur, qos, retain, &payload_cur, s_on_publish_complete, metadata);
    if (!pub_id) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

    napi_value undefined;
    napi_get_undefined(env, &undefined);
    return undefined;

cleanup:
    aws_byte_buf_clean_up(&metadata->payload);
    aws_byte_buf_clean_up(&metadata->topic);

    if (metadata->on_publish) {
        napi_delete_reference(env, metadata->on_publish);
        napi_async_destroy(env, metadata->on_publish_ctx);
    }

    aws_mem_release(allocator, metadata);

    return NULL;
}

/*******************************************************************************
 * Subscribe
 ******************************************************************************/

struct subscription_metadata {
    struct aws_byte_buf topic;

    napi_env env;

    napi_ref on_suback;
    napi_async_context on_suback_ctx;

    napi_ref on_message;
    napi_async_context on_message_ctx;
};

void s_on_subscribe_complete(
    struct aws_mqtt_client_connection *connection,
    uint16_t packet_id,
    const struct aws_byte_cursor *topic,
    enum aws_mqtt_qos qos,
    int error_code,
    void *userdata) {

    (void)connection;

    struct subscription_metadata *metadata = userdata;
    napi_env env = metadata->env;

    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    /* Don't need this anymore */
    aws_byte_buf_clean_up(&metadata->topic);

    /* Call callback */
    if (metadata->on_suback) {

        if (napi_open_handle_scope(env, &handle_scope)) {
            goto cleanup;
        }

        napi_value on_suback = NULL;
        napi_get_reference_value(env, metadata->on_suback, &on_suback);
        if (on_suback) {

            napi_value resource_object = NULL;
            if (napi_create_object(env, &resource_object)) {
                goto cleanup;
            }

            if (napi_open_callback_scope(env, resource_object, metadata->on_suback_ctx, &cb_scope)) {
                goto cleanup;
            }

            napi_value recv;
            napi_value params[4];
            if (napi_get_global(env, &recv) || napi_create_uint32(env, packet_id, &params[0]) ||
                napi_create_string_utf8(env, (const char *)topic->ptr, topic->len, &params[1]) ||
                napi_create_uint32(env, qos, &params[2]) || napi_create_int32(env, error_code, &params[3])) {
                goto cleanup;
            }

            if (napi_make_callback(
                    env, metadata->on_suback_ctx, recv, on_suback, AWS_ARRAY_SIZE(params), params, NULL)) {
                /* #TODO: Log failed callback attempt here. */
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

    if (metadata->on_suback) {
        napi_delete_reference(env, metadata->on_suback);
    }
    if (metadata->on_suback_ctx) {
        napi_async_destroy(env, metadata->on_suback_ctx);
    }
}

void s_subscribe_on_message(
    struct aws_mqtt_client_connection *connection,
    const struct aws_byte_cursor *topic,
    const struct aws_byte_cursor *payload,
    void *userdata) {

    (void)connection;

    struct subscription_metadata *metadata = userdata;
    assert(metadata->on_message);
    napi_env env = metadata->env;

    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    /* Call callback */
    if (napi_open_handle_scope(env, &handle_scope)) {
        goto cleanup;
    }

    napi_value on_message = NULL;
    napi_get_reference_value(env, metadata->on_message, &on_message);
    if (on_message) {

        napi_value resource_object = NULL;
        if (napi_create_object(env, &resource_object)) {
            goto cleanup;
        }

        if (napi_open_callback_scope(env, resource_object, metadata->on_message_ctx, &cb_scope)) {
            goto cleanup;
        }

        napi_value recv;
        napi_value params[2];
        if (napi_get_global(env, &recv) ||
            napi_create_string_utf8(env, (const char *)topic->ptr, topic->len, &params[0]) ||
            aws_napi_create_dataview_from_byte_cursor(env, payload, &params[1])) {
            goto cleanup;
        }

        if (napi_make_callback(env, metadata->on_message_ctx, recv, on_message, AWS_ARRAY_SIZE(params), params, NULL)) {
            /* #TODO: Log failed callback attempt here. */
        }
    }

cleanup:
    if (cb_scope) {
        napi_close_callback_scope(env, cb_scope);
    }
    if (handle_scope) {
        napi_close_handle_scope(env, handle_scope);
    }
}

void s_subscribe_metadata_cleanup(void *userdata) {

    struct subscription_metadata *metadata = userdata;

    /* Call callback */
    if (metadata->on_message) {

        napi_env env = metadata->env;

        napi_async_destroy(env, metadata->on_message_ctx);
        napi_delete_reference(env, metadata->on_message);
    }

    aws_mem_release(aws_default_allocator(), metadata);
}

napi_value mqtt_client_connection_subscribe(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    struct subscription_metadata *metadata = aws_mem_acquire(allocator, sizeof(struct subscription_metadata));
    if (!metadata) {
        aws_napi_throw_last_error(env);
        return NULL;
    }
    AWS_ZERO_STRUCT(*metadata);
    metadata->env = env;

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

    if (aws_byte_buf_init_from_napi(&metadata->topic, env, node_args[1])) {
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
    if (napi_create_reference(env, node_args[3], 1, &metadata->on_message)) {
        napi_throw_error(env, NULL, "Could not create ref from on_message");
        goto cleanup;
    }
    /* Init the async */
    napi_value resource_name = NULL;
    if (napi_create_string_utf8(env, "aws_mqtt_client_connection_on_message", NAPI_AUTO_LENGTH, &resource_name)) {
        goto cleanup;
    }
    if (napi_async_init(env, NULL, resource_name, &metadata->on_message_ctx)) {
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[4])) {
        if (napi_create_reference(env, node_args[4], 1, &metadata->on_suback)) {
            napi_throw_error(env, NULL, "Could not create ref from on_suback");
            goto cleanup;
        }
        /* Init the async */
        napi_value resource_name = NULL;
        if (napi_create_string_utf8(env, "aws_mqtt_client_connection_on_suback", NAPI_AUTO_LENGTH, &resource_name)) {
            goto cleanup;
        }
        if (napi_async_init(env, NULL, resource_name, &metadata->on_suback_ctx)) {
            goto cleanup;
        }
    }

    const struct aws_byte_cursor topic_cur = aws_byte_cursor_from_buf(&metadata->topic);
    uint16_t sub_id = aws_mqtt_client_connection_subscribe(
        node_connection->connection,
        &topic_cur,
        qos,
        s_subscribe_on_message,
        metadata,
        s_subscribe_metadata_cleanup,
        s_on_subscribe_complete,
        metadata);

    if (!sub_id) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

    napi_value undefined;
    napi_get_undefined(env, &undefined);
    return undefined;

cleanup:
    aws_byte_buf_clean_up(&metadata->topic);

    if (metadata->on_message) {
        napi_delete_reference(env, metadata->on_message);
    }
    if (metadata->on_message_ctx) {
        napi_async_destroy(env, metadata->on_message_ctx);
    }

    if (metadata->on_suback) {
        napi_delete_reference(env, metadata->on_suback);
    }
    if (metadata->on_suback_ctx) {
        napi_async_destroy(env, metadata->on_suback_ctx);
    }

    aws_mem_release(allocator, metadata);

    return NULL;
}

/*******************************************************************************
 * Unsubscribe
 ******************************************************************************/

struct unsubscribe_metadata {
    struct aws_byte_buf topic;

    napi_env env;

    napi_ref on_unsuback;
    napi_async_context on_unsuback_ctx;
};

void s_on_unsubscribe_complete(
    struct aws_mqtt_client_connection *connection,
    uint16_t packet_id,
    int error_code,
    void *userdata) {

    (void)connection;

    struct unsubscribe_metadata *metadata = userdata;
    napi_env env = metadata->env;

    napi_handle_scope handle_scope = NULL;
    napi_callback_scope cb_scope = NULL;

    /* Clean up resources */
    aws_byte_buf_clean_up(&metadata->topic);

    /* Call callback */
    if (metadata->on_unsuback) {

        napi_open_handle_scope(env, &handle_scope);

        napi_value on_unsuback = NULL;
        napi_get_reference_value(env, metadata->on_unsuback, &on_unsuback);
        if (on_unsuback) {

            napi_open_callback_scope(env, NULL, metadata->on_unsuback_ctx, &cb_scope);

            napi_value recv;
            napi_value params[2];
            if (napi_get_global(env, &recv) || napi_create_uint32(env, packet_id, &params[0]) ||
                napi_create_int32(env, error_code, &params[1])) {
                goto cleanup;
            }

            if (napi_make_callback(
                    env, metadata->on_unsuback_ctx, recv, on_unsuback, AWS_ARRAY_SIZE(params), params, NULL)) {
                /* #TODO: Log failed callback attempt here. */
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
    napi_delete_reference(env, metadata->on_unsuback);
    napi_async_destroy(env, metadata->on_unsuback_ctx);

    /* Free metadata */
    aws_mem_release(aws_default_allocator(), metadata);
}

napi_value mqtt_client_connection_unsubscribe(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    struct unsubscribe_metadata *metadata = aws_mem_acquire(allocator, sizeof(struct unsubscribe_metadata));
    if (!metadata) {
        aws_napi_throw_last_error(env);
        return NULL;
    }
    AWS_ZERO_STRUCT(*metadata);
    metadata->env = env;

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

    if (aws_byte_buf_init_from_napi(&metadata->topic, env, node_args[1])) {
        napi_throw_type_error(env, NULL, "Second argument (topic) must be a String");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[2])) {
        if (napi_create_reference(env, node_args[2], 1, &metadata->on_unsuback)) {
            napi_throw_error(env, NULL, "Could not create ref from on_unsuback");
            goto cleanup;
        }
        /* Init the async */
        napi_value resource_name = NULL;
        if (napi_create_string_utf8(env, "aws_mqtt_client_connection_on_unsuback", NAPI_AUTO_LENGTH, &resource_name)) {
            goto cleanup;
        }
        if (napi_async_init(env, NULL, resource_name, &metadata->on_unsuback_ctx)) {
            goto cleanup;
        }
    }

    const struct aws_byte_cursor topic_cur = aws_byte_cursor_from_buf(&metadata->topic);
    uint16_t unsub_id = aws_mqtt_client_connection_unsubscribe(
        node_connection->connection, &topic_cur, s_on_unsubscribe_complete, metadata);

    if (!unsub_id) {
        napi_throw_error(env, NULL, "Failed to initiate subscribe request");
        goto cleanup;
    }

    napi_value undefined;
    napi_get_undefined(env, &undefined);
    return undefined;

cleanup:
    aws_byte_buf_clean_up(&metadata->topic);

    if (metadata->on_unsuback) {
        napi_delete_reference(env, metadata->on_unsuback);
    }
    if (metadata->on_unsuback_ctx) {
        napi_async_destroy(env, metadata->on_unsuback_ctx);
    }

    aws_mem_release(allocator, metadata);

    return NULL;
}

/*******************************************************************************
 * Disconnect
 ******************************************************************************/
napi_value mqtt_client_connection_disconnect(napi_env env, napi_callback_info info) {

    struct mqtt_nodejs_connection *node_connection = NULL;
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

    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        if (napi_create_reference(env, node_args[1], 1, &node_connection->on_disconnect)) {
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
        if (napi_async_init(env, NULL, resource_name, &node_connection->on_disconnect_ctx)) {
            napi_throw_error(env, NULL, "Could not create async context");
            goto cleanup;
        }
    }

    if (aws_mqtt_client_connection_disconnect(node_connection->connection, s_on_disconnected, node_connection)) {
        aws_napi_throw_last_error(env);
        goto cleanup;
    }

    napi_value undefined = NULL;
    napi_get_undefined(env, &undefined);
    return undefined;

cleanup:
    if (node_connection->on_disconnect) {
        napi_delete_reference(env, node_connection->on_disconnect);
    }
    if (node_connection->on_disconnect_ctx) {
        napi_async_destroy(env, node_connection->on_disconnect_ctx);
    }

    return NULL;
}
