/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#ifndef AWS_CRT_NODEJS_MQTT5_CLIENT_H
#define AWS_CRT_NODEJS_MQTT5_CLIENT_H

#include "aws/mqtt/v5/mqtt5_types.h"
#include "module.h"
#include <aws/mqtt/v5/mqtt5_packet_storage.h>

struct aws_napi_mqtt5_operation_binding {
    struct aws_allocator *allocator;

    struct aws_mqtt5_client_binding *client_binding;

    struct aws_threadsafe_function *on_operation_completion;

    int error_code;

    enum aws_mqtt5_packet_type valid_storage;

    union {
        struct aws_mqtt5_packet_suback_storage suback;
        struct aws_mqtt5_packet_puback_storage puback;
        struct aws_mqtt5_packet_unsuback_storage unsuback;
    } packet_storage;
};

napi_value aws_napi_mqtt5_client_new(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt5_client_start(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt5_client_stop(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt5_client_subscribe(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt5_client_unsubscribe(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt5_client_publish(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt5_client_get_queue_statistics(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt5_client_close(napi_env env, napi_callback_info info);

#endif /* AWS_CRT_NODEJS_MQTT5_CLIENT_H */
