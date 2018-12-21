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
#include "mqtt_client_connection.h"
#include "mqtt_client.h"
#include "module.h"

#include <aws/mqtt/client.h>

#include <aws/io/socket.h>
#include <aws/io/tls_channel_handler.h>

struct mqtt_nodejs_connection {
    struct aws_socket_options socket_options;
    struct aws_tls_connection_options tls_options;
    struct mqtt_nodejs_client *node_client;
    struct aws_mqtt_client_connection *connection;

    napi_ref on_connect;
    napi_ref on_disconnect;
};

static void s_node_connection_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct mqtt_nodejs_connection *node_connection = finalize_data;

    aws_mqtt_client_connection_disconnect(node_connection->connection);

    aws_mem_release(aws_default_allocator(), node_connection);
}

static void s_on_connect_failed(struct aws_mqtt_client_connection *connection, int error_code, void *user_data) {

    (void)connection;
    (void)error_code;

    struct mqtt_python_connection *node_connection = user_data;
    (void)node_connection;
}

static void s_on_connect(
    struct aws_mqtt_client_connection *connection,
    enum aws_mqtt_connect_return_code return_code,
    bool session_present,
    void *user_data) {

    (void)connection;
    (void)return_code;
    (void)session_present;

    struct mqtt_node_connection *node_connection = user_data;

    (void)node_connection;
}

static bool s_on_disconnect(struct aws_mqtt_client_connection *connection, int error_code, void *user_data) {

    (void)connection;
    (void)error_code;

    struct mqtt_node_connection *node_connection = user_data;
    (void)node_connection;

    return false;
}

napi_value aws_nodejs_mqtt_client_connection_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();
    napi_value result = NULL;
    napi_status status = napi_ok;

    struct aws_tls_ctx *tls_ctx = NULL;
    struct mqtt_nodejs_connection *node_connection = aws_mem_acquire(allocator, sizeof(struct mqtt_nodejs_connection));
    AWS_ZERO_STRUCT(*node_connection);

    size_t num_args = 11;
    napi_value node_args[11];
    if (napi_ok != napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    }
    if (num_args != 11) {
        napi_throw_error(env, NULL, "aws_nodejs_mqtt_client_connection_new needs exactly 11 arguments");
        goto cleanup;
    }

    if (!aws_napi_is_external(env, node_args[0])) {
        napi_throw_type_error(env, NULL, "First argument must be an external");
        status = napi_object_expected;
        goto cleanup;
    }
    status = napi_get_value_external(env, node_args[0], (void **)&node_connection->node_client);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed to extract client from external");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        if (!aws_napi_is_external(env, node_args[1])) {
            napi_throw_type_error(env, NULL, "Second argument must be undefined or an external");
            status = napi_object_expected;
            goto cleanup;
        }

        status = napi_get_value_external(env, node_args[1], (void **)&tls_ctx);
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Failed to extract tls_ctx from external");
            goto cleanup;
        }
    }

    struct aws_byte_buf server_name;
    AWS_ZERO_STRUCT(server_name);
    status = aws_byte_buf_init_from_napi(&server_name, env, node_args[2]);
    if (status != napi_ok) {
        napi_throw_type_error(env, NULL, "Third argument must be a String");
        goto cleanup;
    }

    uint32_t port_number = 0;
    status = napi_get_value_uint32(env, node_args[3], &port_number);
    if (status != napi_ok) {
        napi_throw_type_error(env, NULL, "Fourth argument must be a Number");
        goto cleanup;
    }

    struct aws_byte_buf client_id;
    AWS_ZERO_STRUCT(client_id);
    status = aws_byte_buf_init_from_napi(&client_id, env, node_args[4]);
    if (status != napi_ok) {
        napi_throw_type_error(env, NULL, "Fifth argument must be a String");
        goto cleanup;
    }

    uint32_t keep_alive_time = 0;
    status = napi_get_value_uint32(env, node_args[5], &keep_alive_time);
    if (status != napi_ok) {
        napi_throw_type_error(env, NULL, "Sixth argument must be a Number");
        goto cleanup;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[6])) {
        status = napi_create_reference(env, node_args[6], 1, &node_connection->on_connect);
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not create ref from on_connect");
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[7])) {
        status = napi_create_reference(env, node_args[7], 1, &node_connection->on_disconnect);
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not create ref from on_disconnect");
        }
    }

    /* Handle Will */

    struct aws_byte_buf username;
    AWS_ZERO_STRUCT(username);
    if (!aws_napi_is_null_or_undefined(env, node_args[9])) {
        status = aws_byte_buf_init_from_napi(&username, env, node_args[9]);
        if (status != napi_ok) {
            napi_throw_type_error(env, NULL, "Tenth argument must be a String");
            goto cleanup;
        }
    }

    struct aws_byte_buf password;
    AWS_ZERO_STRUCT(password);
    if (!aws_napi_is_null_or_undefined(env, node_args[10])) {
        status = aws_byte_buf_init_from_napi(&password, env, node_args[10]);
        if (status != napi_ok) {
            napi_throw_type_error(env, NULL, "Eleventh argument must be a String");
            goto cleanup;
        }
    }

    /* CREATE THE THING */

    if (tls_ctx) {
        aws_tls_connection_options_init_from_ctx(&node_connection->tls_options, tls_ctx);
        aws_tls_connection_options_set_server_name(&node_connection->tls_options, (const char *)server_name.buffer);
    }

    AWS_ZERO_STRUCT(node_connection->socket_options);
    node_connection->socket_options.connect_timeout_ms = 3000;
    node_connection->socket_options.type = AWS_SOCKET_STREAM;

    struct aws_mqtt_client_connection_callbacks callbacks;
    AWS_ZERO_STRUCT(callbacks);
    callbacks.on_connection_failed = s_on_connect_failed;
    callbacks.on_connack = s_on_connect;
    callbacks.on_disconnect = s_on_disconnect;
    callbacks.user_data = node_connection;

    struct aws_byte_cursor server_name_cur = aws_byte_cursor_from_buf(&server_name);

    node_connection->connection = aws_mqtt_client_connection_new(
        &node_connection->node_client->native_client,
        callbacks,
        &server_name_cur,
        (uint16_t)port_number,
        &node_connection->socket_options,
        tls_ctx ? &node_connection->tls_options : NULL);
    if (!node_connection->connection) {
        napi_throw_error(env, NULL, "Failed create native connection object");
        status = napi_object_expected;
        goto cleanup;
    }

    struct aws_byte_cursor client_id_cur = aws_byte_cursor_from_buf(&client_id);
    if (aws_mqtt_client_connection_connect(node_connection->connection, &client_id_cur, true, keep_alive_time)) {
        napi_throw_error(env, NULL, "Failed initiate connection");
        status = napi_object_expected;
        goto cleanup;
    }

    napi_value node_external;
    status = napi_create_external(env, node_connection, s_node_connection_finalize, NULL, &node_external);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed create n-api external");
        goto cleanup;
    }
    result = node_external;

cleanup:
    aws_byte_buf_clean_up(&server_name);
    aws_byte_buf_clean_up(&client_id);
    aws_byte_buf_clean_up(&username);
    aws_byte_buf_clean_up(&password);

    if (status != napi_ok) {
        aws_mem_release(allocator, node_connection);
    }

    return result;
}

napi_value aws_nodejs_mqtt_client_connection_set_will(napi_env env, napi_callback_info info);
napi_value aws_nodejs_mqtt_client_connection_set_login(napi_env env, napi_callback_info info);
napi_value aws_nodejs_mqtt_client_connection_publish(napi_env env, napi_callback_info info);
napi_value aws_nodejs_mqtt_client_connection_subscribe(napi_env env, napi_callback_info info);
napi_value aws_nodejs_mqtt_client_connection_unsubscribe(napi_env env, napi_callback_info info);
napi_value aws_nodejs_mqtt_client_connection_disconnect(napi_env env, napi_callback_info info);
