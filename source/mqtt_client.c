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
#include "mqtt_client.h"

#include <stdio.h>

static void s_mqtt_client_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct mqtt_node_client *node_client = finalize_data;

    aws_mqtt_client_clean_up(&node_client->native_client);
    aws_mem_release(node_client->native_client.allocator, node_client);

    printf("Destroyed mqtt_client\n");
}

napi_value mqtt_client_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();

    struct mqtt_node_client *node_client = NULL;

    size_t num_args = 1;
    napi_value node_elg;
    napi_status status = napi_get_cb_info(env, info, &num_args, &node_elg, NULL, NULL);
    assert(status == napi_ok);
    assert(num_args == 1);

    struct aws_event_loop_group *elg = NULL;
    status = napi_get_value_external(env, node_elg, (void **)&elg);
    if (status == napi_invalid_arg) {
        napi_throw_type_error(env, NULL, "Expected event loop group");
        goto error;
    }

    node_client = aws_mem_acquire(allocator, sizeof(struct mqtt_node_client));
    if (!node_client) {
        napi_throw_error(env, NULL, "Failed to allocate client");
        goto error;
    }
    AWS_ZERO_STRUCT(*node_client);

    if (aws_mqtt_client_init(&node_client->native_client, allocator, elg)) {
        napi_throw_error(env, NULL, "Failed to init client");
        goto error;
    }

    napi_value node_external;
    status = napi_create_external(env, node_client, s_mqtt_client_finalize, NULL, &node_external);
    assert(status == napi_ok);

    (void)status;

    printf("Created mqtt_client\n");

    return node_external;

error:
    if (node_client) {
        aws_mem_release(allocator, node_client);
    }

    return NULL;
}
