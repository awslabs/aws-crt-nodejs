/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#include "mqtt_request_response.h"

#include <aws/mqtt/request_response_client.h>

struct aws_mqtt_request_response_client_binding {
    struct aws_allocator *allocator;

    struct aws_mqtt_request_response_client *client;

    /*
     * Single count ref to the JS mqtt request response client object.
     */
    napi_ref node_mqtt_request_response_client_ref;

    /*
     * Single count ref to the node external managed by the client.
     */
    napi_ref node_client_external_ref;
};

/*
 * Invoked when the node mqtt5 client is garbage collected or if fails construction partway through
 */
static void s_aws_mqtt_request_response_client_extern_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)finalize_hint;
    (void)env;

    struct aws_mqtt_request_response_client_binding *binding = finalize_data;

    AWS_LOGF_INFO(
        AWS_LS_NODEJS_CRT_GENERAL,
        "id=%p s_aws_mqtt_request_response_client_extern_finalize - node wrapper is being finalized",
        (void *)binding->client);

    if (binding->client != NULL) {
        /*
         * If client is not null, then this is a successfully constructed client which should shutdown normally.
         * The client doesn't call us back for any reason and we aren't waiting on the termination callback.
         */
        aws_mqtt_request_response_client_release(binding->client);
        binding->client = NULL;
    }

    /*
     * The client itself has very simple lifetime semantics.  There are no callbacks, events, or asynchronous
     * operations that route results through the client.  As soon as the extern is destroyed we can delete
     * everything.
     */
    aws_mem_release(binding->allocator, binding);
}

static int s_aws_init_request_response_options_from_napi_value(
    struct aws_mqtt_request_response_client_options *options,
    napi_env env,
    napi_value node_options) {
    (void)options;
    (void)env;
    (void)node_options;

    return aws_raise_error(AWS_ERROR_UNIMPLEMENTED);
}

napi_value aws_napi_request_mqtt_response_client_new_from_5(napi_env env, napi_callback_info info) {
    napi_value node_args[3];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "request_mqtt_response_client_new_from_5 - Failed to retrieve arguments");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "request_mqtt_response_client_new_from_5 - needs exactly 3 arguments");
        return NULL;
    }

    napi_value napi_client_wrapper = NULL;
    napi_value node_external = NULL;
    struct aws_allocator *allocator = aws_napi_get_allocator();

    struct aws_mqtt_request_response_client_binding *binding =
        aws_mem_calloc(allocator, 1, sizeof(struct aws_mqtt_request_response_client_binding));
    binding->allocator = allocator;

    AWS_NAPI_CALL(
        env,
        napi_create_external(env, binding, s_aws_mqtt_request_response_client_extern_finalize, NULL, &node_external),
        {
            aws_mem_release(allocator, binding);
            napi_throw_error(env, NULL, "request_mqtt_response_client_new_from_5 - Failed to create n-api external");
            goto done;
        });

    /* Arg #1: the request response client */
    napi_value node_rr_client = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_rr_client)) {
        napi_throw_error(env, NULL, "request_mqtt_response_client_new_from_5 - Required client parameter is null");
        goto done;
    }

    AWS_NAPI_CALL(env, napi_create_reference(env, node_rr_client, 1, &binding->node_mqtt_request_response_client_ref), {
        napi_throw_error(
            env,
            NULL,
            "request_mqtt_response_client_new_from_5 - Failed to create reference to node request response client");
        goto done;
    });

    /* Arg #2: mqtt5 client native handle */
    struct aws_mqtt5_client *protocol_client = NULL;
    napi_value node_mqtt5_client_handle = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_mqtt5_client_handle)) {
        napi_throw_error(env, NULL, "request_mqtt_response_client_new_from_5 - JS protocol client is null");
        goto done;
    }

    struct aws_mqtt5_client_binding *mqtt5_client_binding = NULL;
    napi_get_value_external(env, node_mqtt5_client_handle, (void **)&mqtt5_client_binding);

    protocol_client = aws_napi_get_mqtt5_client_from_binding(mqtt5_client_binding);
    if (protocol_client == NULL) {
        napi_throw_error(env, NULL, "request_mqtt_response_client_new_from_5 - native protocol client is null");
        goto done;
    }

    /* Arg #3: the request response client config object */
    napi_value node_client_config = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_client_config)) {
        napi_throw_error(
            env, NULL, "request_mqtt_response_client_new_from_5 - required configuration parameter is null");
        goto done;
    }

    struct aws_mqtt_request_response_client_options client_options;
    AWS_ZERO_STRUCT(client_options);

    if (s_aws_init_request_response_options_from_napi_value(&client_options, env, node_client_config)) {
        napi_throw_error(
            env, NULL, "aws_napi_request_mqtt_response_client_new_from_5 - failed to build configuration options");
        goto done;
    }

    binding->client =
        aws_mqtt_request_response_client_new_from_mqtt5_client(allocator, protocol_client, &client_options);
    if (binding->client == NULL) {
        aws_napi_throw_last_error_with_context(
            env, "aws_napi_request_mqtt_response_client_new_from_5 - failed to create client");
        goto done;
    }

    AWS_NAPI_CALL(env, napi_create_reference(env, node_external, 1, &binding->node_client_external_ref), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_request_mqtt_response_client_new_from_5 - Failed to create one count reference to napi external");
        goto done;
    });

    napi_client_wrapper = node_external;

done:

    return napi_client_wrapper;
}

napi_value aws_napi_mqtt_request_response_client_new_from_311(napi_env env, napi_callback_info info) {
    (void)info;

    napi_throw_error(env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - NYI");
    return NULL;
}

napi_value aws_napi_mqtt_request_response_client_close(napi_env env, napi_callback_info info) {
    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "aws_napi_mqtt_request_response_client_close - Failed to retrieve arguments");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_request_response_client_close - needs exactly 1 argument");
        return NULL;
    }

    struct aws_mqtt_request_response_client_binding *binding = NULL;
    napi_value node_binding = *arg++;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_binding, (void **)&binding), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_mqtt_request_response_client_close - Failed to extract client binding from first argument");
        return NULL;
    });

    if (binding == NULL) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_request_response_client_close - binding was null");
        return NULL;
    }

    if (binding->client == NULL) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_request_response_client_close - client was null");
        return NULL;
    }

    napi_ref node_client_external_ref = binding->node_client_external_ref;
    binding->node_client_external_ref = NULL;

    napi_ref node_mqtt_request_response_client_ref = binding->node_mqtt_request_response_client_ref;
    binding->node_mqtt_request_response_client_ref = NULL;

    if (node_client_external_ref != NULL) {
        napi_delete_reference(env, node_client_external_ref);
    }

    if (node_mqtt5_client_ref != NULL) {
        napi_delete_reference(env, node_mqtt_request_response_client_ref);
    }

    return NULL;
}

napi_value aws_napi_mqtt_streaming_operation_new(napi_env env, napi_callback_info info) {
    (void)info;

    napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_new - NYI");
    return NULL;
}

napi_value aws_napi_mqtt_streaming_operation_open(napi_env env, napi_callback_info info) {
    (void)info;

    napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_open - NYI");
    return NULL;
}

napi_value aws_napi_mqtt_streaming_operation_close(napi_env env, napi_callback_info info) {
    (void)info;

    napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_close - NYI");
    return NULL;
}