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
#include "io.h"

static void s_mqtt_client_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct mqtt_nodejs_client *node_client = finalize_data;
    AWS_ASSERT(node_client);

    struct aws_allocator *allocator = node_client->native_client.allocator;

    aws_mqtt_client_clean_up(&node_client->native_client);
    aws_mem_release(allocator, node_client);
}

napi_value aws_napi_mqtt_client_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();

    struct mqtt_nodejs_client *node_client = NULL;

    size_t num_args = 1;
    napi_value node_client_bootstrap;
    if (napi_ok != napi_get_cb_info(env, info, &num_args, &node_client_bootstrap, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    }
    if (num_args < 1) {
        napi_throw_error(env, NULL, "aws_nodejs_mqtt_client_new needs at least 1 argument");
        return NULL;
    }

    struct aws_nodejs_client_bootstrap *client_bootstrap = NULL;
    napi_status status = napi_get_value_external(env, node_client_bootstrap, (void **)&client_bootstrap);
    if (status == napi_invalid_arg) {
        napi_throw_type_error(env, NULL, "Expected event loop group");
        goto error;
    }
    AWS_ASSERT(status == napi_ok); /* napi_ok and napi_invalid_arg are the only possible return values */

    node_client = aws_mem_acquire(allocator, sizeof(struct mqtt_nodejs_client));
    if (!node_client) {
        napi_throw_error(env, NULL, "Failed to allocate client");
        goto error;
    }
    AWS_ZERO_STRUCT(*node_client);

    if (aws_mqtt_client_init(&node_client->native_client, allocator, client_bootstrap->bootstrap)) {
        napi_throw_error(env, NULL, "Failed to init client");
        goto error;
    }

    napi_value node_external;
    if (napi_ok != napi_create_external(env, node_client, s_mqtt_client_finalize, NULL, &node_external)) {
        napi_throw_error(env, NULL, "Failed create n-api external");
        goto error;
    }

    return node_external;

error:
    if (node_client) {
        aws_mqtt_client_clean_up(&node_client->native_client);
        aws_mem_release(allocator, node_client);
    }

    return NULL;
}
