#ifndef AWS_CRT_NODEJS_MQTT_CLIENT_H
#define AWS_CRT_NODEJS_MQTT_CLIENT_H
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

#include <aws/mqtt/client.h>

struct mqtt_nodejs_client {
    struct aws_mqtt_client native_client;
};

napi_value mqtt_client_new(napi_env env, napi_callback_info info);

#endif /* AWS_CRT_NODEJS_MQTT_CLIENT_H */
