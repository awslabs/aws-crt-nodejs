/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#include "mqtt_request_response.h"

#include "mqtt5_client.h"
#include "mqtt_client_connection.h"

#include <aws/mqtt/request-response/request_response_client.h>

static const char *AWS_NAPI_KEY_MAX_REQUEST_RESPONSE_SUBSCRIPTIONS = "maxRequestResponseSubscriptions";
static const char *AWS_NAPI_KEY_MAX_STREAMING_SUBSCRIPTIONS = "maxStreamingSubscriptions";
static const char *AWS_NAPI_KEY_OPERATION_TIMEOUT_IN_SECONDS = "operationTimeoutInSeconds";

struct aws_mqtt_request_response_client_binding {
    struct aws_allocator *allocator;

    /* reference holding */
    struct aws_mqtt_request_response_client *client;

    /*
     * Single count ref to the JS mqtt request response client object.
     */
    napi_ref node_mqtt_request_response_client_ref;

    /*
     * Single count ref to the node external associated with the JS client.
     */
    napi_ref node_client_external_ref;
};

/*
 * Invoked when the JS request-response client is garbage collected or if fails construction partway through
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
     * operations that route values through the client.  As soon as the extern is destroyed we can delete
     * everything, including the binding itself.
     */
    aws_mem_release(binding->allocator, binding);
}

static int s_aws_init_request_response_options_from_napi_value(
    struct aws_mqtt_request_response_client_options *options,
    napi_env env,
    napi_value node_options,
    void *log_handle) {

    uint32_t max_request_response_subscriptions = 0;
    EXTRACT_REQUIRED_NAPI_PROPERTY(
        AWS_NAPI_KEY_MAX_REQUEST_RESPONSE_SUBSCRIPTIONS,
        "s_aws_init_request_response_options_from_napi_value",
        aws_napi_get_named_property_as_uint32(
            env, node_options, AWS_NAPI_KEY_MAX_REQUEST_RESPONSE_SUBSCRIPTIONS, &max_request_response_subscriptions),
        {},
        log_handle);

    uint32_t max_streaming_subscriptions = 0;
    EXTRACT_REQUIRED_NAPI_PROPERTY(
        AWS_NAPI_KEY_MAX_STREAMING_SUBSCRIPTIONS,
        "s_aws_init_request_response_options_from_napi_value",
        aws_napi_get_named_property_as_uint32(
            env, node_options, AWS_NAPI_KEY_MAX_STREAMING_SUBSCRIPTIONS, &max_streaming_subscriptions),
        {},
        log_handle);

    EXTRACT_REQUIRED_NAPI_PROPERTY(
        AWS_NAPI_KEY_OPERATION_TIMEOUT_IN_SECONDS,
        "s_aws_init_request_response_options_from_napi_value",
        aws_napi_get_named_property_as_uint32(
            env, node_options, AWS_NAPI_KEY_OPERATION_TIMEOUT_IN_SECONDS, &options->operation_timeout_seconds),
        {},
        log_handle);

    options->max_request_response_subscriptions = (size_t)max_request_response_subscriptions;
    options->max_streaming_subscriptions = (size_t)max_streaming_subscriptions;

    return AWS_OP_SUCCESS;
}

napi_value aws_napi_request_mqtt_response_client_new_from_5(napi_env env, napi_callback_info info) {
    napi_value node_args[3];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "aws_napi_request_mqtt_response_client_new_from_5 - Failed to retrieve arguments");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_request_mqtt_response_client_new_from_5 - needs exactly 3 arguments");
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
            napi_throw_error(
                env, NULL, "aws_napi_request_mqtt_response_client_new_from_5 - Failed to create n-api external");
            goto done;
        });

    /* Arg #1: the request response client */
    napi_value node_rr_client = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_rr_client)) {
        napi_throw_error(
            env, NULL, "aws_napi_request_mqtt_response_client_new_from_5 - Required client parameter is null");
        goto done;
    }

    AWS_NAPI_CALL(env, napi_create_reference(env, node_rr_client, 1, &binding->node_mqtt_request_response_client_ref), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_request_mqtt_response_client_new_from_5 - Failed to create reference to node request response "
            "client");
        goto done;
    });

    /* Arg #2: mqtt5 client native handle */
    struct aws_mqtt5_client *protocol_client = NULL;
    napi_value node_mqtt5_client_handle = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_mqtt5_client_handle)) {
        napi_throw_error(env, NULL, "aws_napi_request_mqtt_response_client_new_from_5 - JS protocol client is null");
        goto done;
    }

    struct aws_mqtt5_client_binding *mqtt5_client_binding = NULL;
    napi_get_value_external(env, node_mqtt5_client_handle, (void **)&mqtt5_client_binding);

    protocol_client = aws_napi_get_mqtt5_client_from_binding(mqtt5_client_binding);
    if (protocol_client == NULL) {
        napi_throw_error(
            env, NULL, "aws_napi_request_mqtt_response_client_new_from_5 - native protocol client is null");
        goto done;
    }

    /* Arg #3: the request response client config object */
    napi_value node_client_config = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_client_config)) {
        napi_throw_error(
            env, NULL, "aws_napi_request_mqtt_response_client_new_from_5 - required configuration parameter is null");
        goto done;
    }

    struct aws_mqtt_request_response_client_options client_options;
    AWS_ZERO_STRUCT(client_options);

    if (s_aws_init_request_response_options_from_napi_value(&client_options, env, node_client_config, NULL)) {
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
    napi_value node_args[3];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - Failed to retrieve arguments");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - needs exactly 3 arguments");
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
            napi_throw_error(
                env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - Failed to create n-api external");
            goto done;
        });

    /* Arg #1: the request response client */
    napi_value node_rr_client = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_rr_client)) {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - Required client parameter is null");
        goto done;
    }

    AWS_NAPI_CALL(env, napi_create_reference(env, node_rr_client, 1, &binding->node_mqtt_request_response_client_ref), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_mqtt_request_response_client_new_from_311 - Failed to create reference to node request response "
            "client");
        goto done;
    });

    /* Arg #2: mqtt311 client native handle */
    struct aws_mqtt_client_connection *protocol_client = NULL;
    napi_value node_mqtt_client_connection_handle = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_mqtt_client_connection_handle)) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - JS protocol client is null");
        goto done;
    }

    struct mqtt_connection_binding *mqtt_client_connection_binding = NULL;
    napi_get_value_external(env, node_mqtt_client_connection_handle, (void **)&mqtt_client_connection_binding);

    protocol_client = aws_napi_get_mqtt_client_connection_from_binding(mqtt_client_connection_binding);
    if (protocol_client == NULL) {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - native protocol client is null");
        goto done;
    }

    /* Arg #3: the request response client config object */
    napi_value node_client_config = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_client_config)) {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - required configuration parameter is null");
        goto done;
    }

    struct aws_mqtt_request_response_client_options client_options;
    AWS_ZERO_STRUCT(client_options);

    if (s_aws_init_request_response_options_from_napi_value(&client_options, env, node_client_config, NULL)) {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - failed to build configuration options");
        goto done;
    }

    binding->client =
        aws_mqtt_request_response_client_new_from_mqtt311_client(allocator, protocol_client, &client_options);
    if (binding->client == NULL) {
        aws_napi_throw_last_error_with_context(
            env, "aws_napi_mqtt_request_response_client_new_from_311 - failed to create client");
        goto done;
    }

    AWS_NAPI_CALL(env, napi_create_reference(env, node_external, 1, &binding->node_client_external_ref), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_mqtt_request_response_client_new_from_311 - Failed to create one count reference to napi "
            "external");
        goto done;
    });

    napi_client_wrapper = node_external;

done:

    return napi_client_wrapper;
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

    if (node_mqtt_request_response_client_ref != NULL) {
        napi_delete_reference(env, node_mqtt_request_response_client_ref);
    }

    return NULL;
}

struct aws_napi_mqtt_request_binding {
    struct aws_allocator *allocator;

    napi_threadsafe_function on_completion;

    int error_code;
    struct aws_byte_buf topic;
    struct aws_byte_buf *payload;
};

static void s_aws_napi_mqtt_request_binding_destroy(struct aws_napi_mqtt_request_binding *binding) {
    if (binding == NULL) {
        return;
    }

    AWS_CLEAN_THREADSAFE_FUNCTION(binding, on_completion);

    aws_byte_buf_clean_up(&binding->topic);
    if (binding->payload) {
        aws_byte_buf_clean_up(binding->payload);
        aws_mem_release(allocator, binding->payload);
    }

    aws_mem_release(binding->allocator, binding);
}

static void s_request_complete_external_arraybuffer_finalizer(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_data;

    struct aws_byte_buf *payload = finalize_hint;
    struct aws_allocator *allocator = payload->allocator;
    AWS_FATAL_ASSERT(allocator != NULL);

    aws_byte_buf_clean_up(payload);
    aws_mem_release(allocator, payload);
}

static void s_napi_on_request_complete(napi_env env, napi_value function, void *context, void *user_data) {
    (void)user_data;

    struct aws_napi_mqtt_request_binding *binding = context;

    if (env) {
        napi_value params[3];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        AWS_NAPI_CALL(env, napi_create_uint32(env, binding->error_code, &params[0]), { goto done; });

        if (binding->topic.len > 0) {
            struct aws_byte_cursor topic_cursor = aws_byte_cursor_from_buf(&binding->topic);
            AWS_NAPI_CALL(env, napi_create_string_utf8(env, (const char *)(topic_cursor.ptr), topic_cursor.len, &params[1]), {
                goto done;
            });
        } else {
            if (napi_get_undefined(env, &params[1]) != napi_ok) {
                AWS_LOGF_ERROR(
                    AWS_LS_NODEJS_CRT_GENERAL, "s_napi_on_request_complete - could not get undefined napi value");
                goto done;
            }
        }

        if (binding->payload.len > 0) {
            AWS_NAPI_ENSURE(
                env,
                aws_napi_create_external_arraybuffer(
                    env,
                    binding->payload.buffer,
                    binding->payload.len,
                    s_request_complete_external_arraybuffer_finalizer,
                    args->payload,
                    &params[2]));
        } else {
            if (napi_get_undefined(env, &params[2]) != napi_ok) {
                AWS_LOGF_ERROR(
                    AWS_LS_NODEJS_CRT_GENERAL, "s_napi_on_request_complete - could not get undefined napi value");
                goto done;
            }
        }

        binding->payload = NULL;

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(
                env, binding->on_completion, NULL, function, num_params, params));
    }

done:

    s_aws_napi_mqtt_request_binding_destroy(binding);
}

napi_value aws_napi_mqtt_request_response_client_submit_request(napi_env env, napi_callback_info info) {
    (void)info;

    napi_throw_error(env, NULL, "aws_napi_mqtt_request_response_client_submit_request - NYI");
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