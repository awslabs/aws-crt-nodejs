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

#include <aws/mqtt/client.h>

#include <aws/io/socket.h>

struct mqtt_node_connection {
    struct aws_socket_options socket_options;
    struct mqtt_node_client *node_client;
    struct aws_mqtt_client_connection *connection;
};

/*static*/ void s_mqtt_connection_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct mqtt_node_connection *node_connection = finalize_data;

    aws_mqtt_client_connection_disconnect(node_connection->connection);

    aws_mem_release(aws_default_allocator(), node_connection);
}

napi_value mqtt_client_connection_new(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_set_will(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_set_login(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_publish(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_subscribe(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_unsubscribe(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_disconnect(napi_env env, napi_callback_info info);
