#ifndef AWS_CRT_NODEJS_MQTT_CLIENT_CONNECTION_H
#define AWS_CRT_NODEJS_MQTT_CLIENT_CONNECTION_H
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

napi_value mqtt_client_connection_new(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_set_will(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_set_login(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_publish(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_subscribe(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_unsubscribe(napi_env env, napi_callback_info info);
napi_value mqtt_client_connection_disconnect(napi_env env, napi_callback_info info);

#endif /* AWS_CRT_NODEJS_MQTT_CLIENT_CONNECTION_H */
