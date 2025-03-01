#ifndef AWS_CRT_NODEJS_MQTT_CLIENT_CONNECTION_H
#define AWS_CRT_NODEJS_MQTT_CLIENT_CONNECTION_H
/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#include "module.h"

struct mqtt_connection_binding;
struct aws_mqtt_client_connection;

napi_value aws_napi_mqtt_client_connection_new(napi_env env, napi_callback_info info);
napi_value aws_napi_mqtt_client_connection_close(napi_env env, napi_callback_info info);
napi_value aws_napi_mqtt_client_connection_connect(napi_env env, napi_callback_info info);
napi_value aws_napi_mqtt_client_connection_reconnect(napi_env env, napi_callback_info info);
napi_value aws_napi_mqtt_client_connection_publish(napi_env env, napi_callback_info info);
napi_value aws_napi_mqtt_client_connection_subscribe(napi_env env, napi_callback_info info);
napi_value aws_napi_mqtt_client_connection_on_message(napi_env env, napi_callback_info info);
napi_value aws_napi_mqtt_client_connection_on_closed(napi_env env, napi_callback_info info);
napi_value aws_napi_mqtt_client_connection_unsubscribe(napi_env env, napi_callback_info info);
napi_value aws_napi_mqtt_client_connection_disconnect(napi_env env, napi_callback_info info);
napi_value aws_napi_mqtt_client_connection_get_queue_statistics(napi_env env, napi_callback_info info);

struct aws_mqtt_client_connection *aws_napi_get_mqtt_client_connection_from_binding(
    struct mqtt_connection_binding *binding);

#endif /* AWS_CRT_NODEJS_MQTT_CLIENT_CONNECTION_H */
