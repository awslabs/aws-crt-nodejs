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

#include "mqtt_client_connection.h"
#include "module.h"
#include "mqtt_client.h"

#include <aws/mqtt/client.h>

#include <aws/io/socket.h>
#include <aws/io/tls_channel_handler.h>

struct mqtt_nodejs_connection {
    struct aws_socket_options socket_options;
    struct aws_tls_connection_options tls_options;
    struct mqtt_nodejs_client *node_client;
    struct aws_mqtt_client_connection *connection;

    napi_env env;

    napi_async_context on_connect_ctx;
    napi_ref on_connect;
    napi_ref on_connection_interrupted;
    napi_ref on_connection_resumed;
    napi_ref on_disconnect;
    napi_async_context on_disconnect_ctx;
};

/*******************************************************************************
 * New Connection
 ******************************************************************************/

static void s_node_connection_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct mqtt_nodejs_connection *node_connection = finalize_data;

    aws_mqtt_client_connection_disconnect(node_connection->connection, NULL, NULL); /* #TODO */

    aws_mem_release(aws_default_allocator(), node_connection);
}

napi_value mqtt_client_connection_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    napi_value result = NULL;
    napi_status status = napi_ok;

    struct mqtt_nodejs_connection *node_connection = aws_mem_acquire(allocator, sizeof(struct mqtt_nodejs_connection));
    AWS_ZERO_STRUCT(*node_connection);

    size_t num_args = 3;
    napi_value node_args[3];
    if (napi_ok != napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != 3) {
        napi_throw_error(env, NULL, "aws_nodejs_mqtt_client_connection_new needs exactly 3 arguments");
        goto cleanup;
    }

    if (!aws_napi_is_external(env, node_args[0])) {
        napi_throw_type_error(env, NULL, "First argument (client) must be an external");
        status = napi_object_expected;
        goto cleanup;
    }
    status = napi_get_value_external(env, node_args[0], (void **)&node_connection->node_client);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed to extract client from external");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        status = napi_create_reference(env, node_args[1], 1, &node_connection->on_connection_interrupted);
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not create ref from on_connnection_interrupted");
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[2])) {
        status = napi_create_reference(env, node_args[2], 1, &node_connection->on_connection_resumed);
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not create ref from on_connection_resumed");
        }
    }

    /* CREATE THE THING */

    node_connection->connection = aws_mqtt_client_connection_new(&node_connection->node_client->native_client);
    if (!node_connection->connection) {
        napi_throw_error(env, NULL, "Failed create native connection object");
        status = napi_object_expected;
        goto cleanup;
    }

    node_connection->env = env;

    if (node_connection->on_connection_interrupted || node_connection->on_connection_resumed) {
        /* #TODO */
        aws_mqtt_client_connection_set_connection_interruption_handlers(
            node_connection->connection, NULL, NULL, NULL, NULL);
    }

    napi_value node_external;
    status = napi_create_external(env, node_connection, s_node_connection_finalize, NULL, &node_external);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed create n-api external");
        goto cleanup;
    }
    result = node_external;

cleanup:

    if (status != napi_ok) {
        if (node_connection->connection) {
            aws_mqtt_client_connection_destroy(node_connection->connection);
        }

        if (node_connection->on_connection_interrupted) {
            napi_delete_reference(env, node_connection->on_connection_interrupted);
        }

        if (node_connection->on_connection_resumed) {
            napi_delete_reference(env, node_connection->on_connection_resumed);
        }

        aws_mem_release(allocator, node_connection);
    }

    return result;
}

/*******************************************************************************
 * Connect
 ******************************************************************************/

static void s_on_connect(
    struct aws_mqtt_client_connection *connection,
    int error_code,
    enum aws_mqtt_connect_return_code return_code,
    bool session_present,
    void *userdata) {

    (void)connection;
    (void)error_code;
    (void)return_code;
    (void)session_present;

    struct mqtt_nodejs_connection *node_connection = userdata;
    if (node_connection->on_connect) {

        napi_env env = node_connection->env;

        napi_handle_scope handle_scope = NULL;
        napi_open_handle_scope(env, &handle_scope);

        napi_value on_connect = NULL;
        napi_get_reference_value(env, node_connection->on_connect, &on_connect);
        if (on_connect) {

            napi_callback_scope cb_scope = NULL;
            napi_open_callback_scope(env, NULL, node_connection->on_connect_ctx, &cb_scope);

            napi_value params[3];
            napi_create_int32(env, error_code, &params[0]);
            napi_create_int32(env, return_code, &params[1]);
            napi_get_boolean(env, session_present, &params[2]);

            napi_value recv;
            napi_get_global(env, &recv);

            if (napi_make_callback(env, node_connection->on_connect_ctx, recv, on_connect, AWS_ARRAY_SIZE(params), params, NULL)) {
                /* #TODO: Log failed callback attempt here. */
            }

            napi_close_callback_scope(env, cb_scope);
            napi_async_destroy(env, node_connection->on_connect_ctx);

            napi_reference_unref(env, node_connection->on_connect, NULL);
        }

        napi_close_handle_scope(env, handle_scope);
    }
}

napi_value mqtt_client_connection_connect(napi_env env, napi_callback_info info) {

    napi_value result = NULL;
    napi_status status = napi_ok;

    struct aws_tls_ctx *tls_ctx = NULL;
    struct mqtt_nodejs_connection *node_connection = NULL;

    size_t num_args = 10;
    napi_value node_args[10];
    if (napi_ok != napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != 10) {
        napi_throw_error(env, NULL, "aws_nodejs_mqtt_client_connection_connect needs exactly 10 arguments");
        goto cleanup;
    }

    if (!aws_napi_is_external(env, node_args[0])) {
        napi_throw_type_error(env, NULL, "First argument (connection) must be an external");
        status = napi_object_expected;
        goto cleanup;
    }
    status = napi_get_value_external(env, node_args[0], (void **)&node_connection);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed to extract connection from external");
        goto cleanup;
    }

    struct aws_byte_buf client_id;
    AWS_ZERO_STRUCT(client_id);
    status = aws_byte_buf_init_from_napi(&client_id, env, node_args[1]);
    if (status != napi_ok) {
        napi_throw_type_error(env, NULL, "Second argument (client_id) must be a String");
        goto cleanup;
    }

    struct aws_byte_buf server_name;
    AWS_ZERO_STRUCT(server_name);
    status = aws_byte_buf_init_from_napi(&server_name, env, node_args[2]);
    if (status != napi_ok) {
        napi_throw_type_error(env, NULL, "Third argument (server_name) must be a String");
        goto cleanup;
    }

    uint32_t port_number = 0;
    status = napi_get_value_uint32(env, node_args[3], &port_number);
    if (status != napi_ok) {
        napi_throw_type_error(env, NULL, "Fourth argument (port) must be a Number");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[4])) {
        if (!aws_napi_is_external(env, node_args[4])) {
            napi_throw_type_error(env, NULL, "Second argument (tls_ctx) must be undefined or an external");
            status = napi_object_expected;
            goto cleanup;
        }

        status = napi_get_value_external(env, node_args[4], (void **)&tls_ctx);
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Failed to extract tls_ctx from external");
            goto cleanup;
        }
    }

    uint32_t keep_alive_time = 0;
    if (!aws_napi_is_null_or_undefined(env, node_args[5])) {
        status = napi_get_value_uint32(env, node_args[5], &keep_alive_time);
        if (status != napi_ok) {
            napi_throw_type_error(env, NULL, "Sixth argument (keep_alive) must be a Number");
            goto cleanup;
        }
    }

    /* Handle Will */

    struct aws_byte_buf username;
    AWS_ZERO_STRUCT(username);
    if (!aws_napi_is_null_or_undefined(env, node_args[7])) {
        status = aws_byte_buf_init_from_napi(&username, env, node_args[7]);
        if (status != napi_ok) {
            napi_throw_type_error(env, NULL, "Eighth argument (username) must be a String");
            goto cleanup;
        }
    }

    struct aws_byte_buf password;
    AWS_ZERO_STRUCT(password);
    if (!aws_napi_is_null_or_undefined(env, node_args[8])) {
        status = aws_byte_buf_init_from_napi(&password, env, node_args[8]);
        if (status != napi_ok) {
            napi_throw_type_error(env, NULL, "Ninth argument (password) must be a String");
            goto cleanup;
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[9])) {
        status = napi_create_reference(env, node_args[9], 1, &node_connection->on_connect);
        if (status != napi_ok) {
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

    if (aws_mqtt_client_connection_connect(
            node_connection->connection,
            &server_name_cur,
            port_number,
            &node_connection->socket_options,
            tls_ctx ? &node_connection->tls_options : NULL,
            &client_id_cur,
            true,
            keep_alive_time,
            s_on_connect,
            node_connection)) {
        napi_throw_error(env, NULL, "Failed initiate connection");
        status = napi_object_expected;
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

    napi_status status = napi_ok;
    napi_value result = NULL;

    size_t num_args = 2;
    napi_value node_args[2];
    if (napi_ok != napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != 2) {
        napi_throw_error(env, NULL, "mqtt_client_connection_reconnect needs exactly 2 arguments");
        goto cleanup;
    }

    if (!aws_napi_is_external(env, node_args[0])) {
        napi_throw_type_error(env, NULL, "First argument (connection) must be an external");
        status = napi_object_expected;
        goto cleanup;
    }
    struct mqtt_nodejs_connection *node_connection = NULL;
    status = napi_get_value_external(env, node_args[0], (void **)&node_connection);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed to extract connection from external");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {

        /* Destroy any existing callback info */
        if (node_connection->on_connect) {
            napi_delete_reference(env, node_connection->on_connect);
            napi_async_destroy(env, node_connection->on_connect_ctx);
        }

        status = napi_create_reference(env, node_args[1], 1, &node_connection->on_connect);
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not create ref from on_connect");
        }
        /* Init the async */
        napi_value resource_name = NULL;
        napi_create_string_utf8(env, "mqtt_client_connection_on_reconnect", NAPI_AUTO_LENGTH, &resource_name);
        napi_async_init(env, NULL, resource_name, &node_connection->on_connect_ctx);
    }

    if (aws_mqtt_client_connection_reconnect(node_connection->connection, s_on_connect, node_connection)) {
        napi_throw_error(env, NULL, aws_error_debug_str(aws_last_error()));
        goto cleanup;
    }

cleanup:
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

    /* Clean up resources */
    aws_byte_buf_clean_up(&metadata->topic);
    aws_byte_buf_clean_up(&metadata->payload);

    /* Call callback */
    if (metadata->on_publish) {

        napi_env env = metadata->env;

        napi_handle_scope handle_scope = NULL;
        napi_open_handle_scope(env, &handle_scope);

        napi_value on_connect = NULL;
        napi_get_reference_value(env, metadata->on_publish, &on_connect);
        if (on_connect) {

            napi_callback_scope cb_scope = NULL;
            napi_open_callback_scope(env, NULL, metadata->on_publish_ctx, &cb_scope);

            napi_value params[2];
            napi_create_int32(env, packet_id, &params[0]);
            napi_create_int32(env, error_code, &params[1]);

            napi_value recv;
            napi_get_global(env, &recv);

            if (napi_make_callback(env, metadata->on_publish_ctx, recv, on_connect, AWS_ARRAY_SIZE(params), params, NULL)) {
                /* #TODO: Log failed callback attempt here. */
            }

            napi_close_callback_scope(env, cb_scope);
            napi_async_destroy(env, metadata->on_publish_ctx);

            napi_reference_unref(env, metadata->on_publish, NULL);
        }

        napi_close_handle_scope(env, handle_scope);
    }

    /* Free metadata */
    aws_mem_release(aws_default_allocator(), metadata);
}

napi_value mqtt_client_connection_publish(napi_env env, napi_callback_info info) {

    napi_status status = napi_ok;

    struct aws_allocator *allocator = aws_default_allocator();
    struct publish_complete_userdata *metadata = aws_mem_acquire(allocator, sizeof(struct publish_complete_userdata));
    AWS_ZERO_STRUCT(*metadata);
    metadata->env = env;

    size_t num_args = 6;
    napi_value node_args[6];
    if (napi_ok != napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != 6) {
        napi_throw_error(env, NULL, "mqtt_client_connection_publish needs exactly 6 arguments");
        goto cleanup;
    }

    if (!aws_napi_is_external(env, node_args[0])) {
        napi_throw_type_error(env, NULL, "First argument (connection) must be an external");
        status = napi_object_expected;
        goto cleanup;
    }
    struct mqtt_nodejs_connection *node_connection = NULL;
    status = napi_get_value_external(env, node_args[0], (void **)&node_connection);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed to extract connection from external");
        goto cleanup;
    }

    status = aws_byte_buf_init_from_napi(&metadata->topic, env, node_args[1]);
    if (status != napi_ok) {
        napi_throw_type_error(env, NULL, "Second argument (topic) must be a String");
        goto cleanup;
    }

    status = aws_byte_buf_init_from_napi(&metadata->payload, env, node_args[2]);
    if (status != napi_ok) {
        napi_throw_type_error(env, NULL, "Third argument (payload) must be a String");
        goto cleanup;
    }

    enum aws_mqtt_qos qos = 0;
    status = napi_get_value_uint32(env, node_args[3], &qos);
    if (status != napi_ok) {
        napi_throw_type_error(env, NULL, "Fourth argument (qos) must be a number");
        goto cleanup;
    }

    bool retain = false;
    status = napi_get_value_bool(env, node_args[4], &retain);
    if (status != napi_ok) {
        napi_throw_type_error(env, NULL, "Fifth argument (retain) must be a bool");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[5])) {
        status = napi_create_reference(env, node_args[5], 1, &metadata->on_publish);
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not create ref from on_publish");
        }
        /* Init the async */
        napi_value resource_name = NULL;
        napi_create_string_utf8(env, "aws_mqtt_client_connection_on_publish", NAPI_AUTO_LENGTH, &resource_name);
        napi_async_init(env, NULL, resource_name, &metadata->on_publish_ctx);
    }

    const struct aws_byte_cursor topic_cur = aws_byte_cursor_from_buf(&metadata->topic);
    const struct aws_byte_cursor payload_cur = aws_byte_cursor_from_buf(&metadata->payload);
    aws_mqtt_client_connection_publish(node_connection->connection, &topic_cur, qos, retain, &payload_cur, s_on_publish_complete, metadata);

    napi_value undefined;
    napi_get_undefined(env, &undefined);
    return undefined;

cleanup:
    aws_byte_buf_clean_up(&metadata->payload);
    aws_byte_buf_clean_up(&metadata->topic);

    aws_mem_release(allocator, metadata);

    return NULL;
}

napi_value mqtt_client_connection_subscribe(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_unsubscribe(napi_env env, napi_callback_info info);

/*******************************************************************************
 * Disconnect
 ******************************************************************************/

static void s_on_disconnect(struct aws_mqtt_client_connection *connection, void *userdata) {

    (void)connection;

    struct mqtt_nodejs_connection *node_connection = userdata;
    if (node_connection->on_disconnect) {

        napi_env env = node_connection->env;

        napi_handle_scope handle_scope = NULL;
        napi_open_handle_scope(env, &handle_scope);

        napi_value on_disconnect = NULL;
        napi_get_reference_value(env, node_connection->on_disconnect, &on_disconnect);
        if (on_disconnect) {

            napi_callback_scope cb_scope = NULL;
            napi_open_callback_scope(env, NULL, node_connection->on_disconnect_ctx, &cb_scope);

            napi_value recv;
            napi_get_global(env, &recv);

            if (napi_make_callback(env, node_connection->on_disconnect_ctx, recv, on_disconnect, 0, NULL, NULL)) {
                /* #TODO: Log failed callback attempt here. */
            }

            napi_close_callback_scope(env, cb_scope);
            napi_async_destroy(env, node_connection->on_disconnect_ctx);

            napi_reference_unref(env, node_connection->on_disconnect, NULL);
        }

        napi_close_handle_scope(env, handle_scope);
    }
}

napi_value mqtt_client_connection_disconnect(napi_env env, napi_callback_info info) {

    napi_value result = NULL;
    napi_status status = napi_ok;

    struct mqtt_nodejs_connection *node_connection = NULL;

    size_t num_args = 2;
    napi_value node_args[2];
    if (napi_ok != napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    }
    if (num_args != 2) {
        napi_throw_error(env, NULL, "aws_nodejs_mqtt_client_connection_connect needs exactly 10 arguments");
        return NULL;
    }

    if (!aws_napi_is_external(env, node_args[0])) {
        napi_throw_type_error(env, NULL, "First argument (connection) must be an external");
        status = napi_object_expected;
        return NULL;
    }
    status = napi_get_value_external(env, node_args[0], (void **)&node_connection);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed to extract connection from external");
        return NULL;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        status = napi_create_reference(env, node_args[1], 1, &node_connection->on_disconnect);
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not create ref from on_disconnect");
        }
        /* Init the async */
        napi_value resource_name = NULL;
        napi_create_string_utf8(env, "aws_mqtt_client_connection_on_disconnect", NAPI_AUTO_LENGTH, &resource_name);
        napi_async_init(env, NULL, resource_name, &node_connection->on_disconnect_ctx);
    }

    aws_mqtt_client_connection_disconnect(node_connection->connection, s_on_disconnect, node_connection);

    return result;
}
