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
static const char *AWS_NAPI_KEY_SUBSCRIPTION_TOPIC_FILTERS = "subscriptionTopicFilters";
static const char *AWS_NAPI_KEY_RESPONSE_PATHS = "responsePaths";
static const char *AWS_NAPI_KEY_PUBLISH_TOPIC = "publishTopic";
static const char *AWS_NAPI_KEY_PAYLOAD = "payload";
static const char *AWS_NAPI_KEY_CORRELATION_TOKEN = "correlationToken";
static const char *AWS_NAPI_KEY_TOPIC = "topic";
static const char *AWS_NAPI_KEY_CORRELATION_TOKEN_JSON_PATH = "correlationTokenJsonPath";

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

napi_value aws_napi_mqtt_request_response_client_new_from_5(napi_env env, napi_callback_info info) {
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

/*
 * request-response binding that lives from the time a request is made until the request has been completed
 * on the libuv thread.
 */
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

    /*
     * Under normal circumstances the payload is attached to an external and nulled out in the binding.  This
     * handles the case where something goes wrong with the threadsafe function invoke, forcing us to clean up the
     * payload ourselves.
     */
    if (binding->payload) {
        aws_byte_buf_clean_up(binding->payload);
        aws_mem_release(binding->allocator, binding->payload);
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

        // Arg 1: the error code
        AWS_NAPI_CALL(env, napi_create_uint32(env, binding->error_code, &params[0]), { goto done; });

        // Arg 2: the topic or null on an error
        if (binding->topic.len > 0) {
            struct aws_byte_cursor topic_cursor = aws_byte_cursor_from_buf(&binding->topic);
            AWS_NAPI_CALL(
                env, napi_create_string_utf8(env, (const char *)(topic_cursor.ptr), topic_cursor.len, &params[1]), {
                    goto done;
                });
        } else {
            if (napi_get_null(env, &params[1]) != napi_ok) {
                AWS_LOGF_ERROR(AWS_LS_NODEJS_CRT_GENERAL, "s_napi_on_request_complete - could not get null napi value");
                goto done;
            }
        }

        // Arg 3: the payload or null on an error
        if (binding->payload != NULL) {
            AWS_NAPI_ENSURE(
                env,
                aws_napi_create_external_arraybuffer(
                    env,
                    binding->payload->buffer,
                    binding->payload->len,
                    s_request_complete_external_arraybuffer_finalizer,
                    binding->payload,
                    &params[2]));
        } else {
            if (napi_get_null(env, &params[2]) != napi_ok) {
                AWS_LOGF_ERROR(AWS_LS_NODEJS_CRT_GENERAL, "s_napi_on_request_complete - could not get null napi value");
                goto done;
            }
        }

        /*
         * If we reach here then the payload (if it exists) is now owned by the external arraybuffer value.
         * Nulling the member here prevents a double-free from the extern finalizer and the binding destructor.
         */
        binding->payload = NULL;

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(env, binding->on_completion, NULL, function, num_params, params));
    }

done:

    s_aws_napi_mqtt_request_binding_destroy(binding);
}

static void s_on_request_complete(
    const struct aws_byte_cursor *response_topic,
    const struct aws_byte_cursor *payload,
    int error_code,
    void *user_data) {

    struct aws_napi_mqtt_request_binding *binding = user_data;

    if (error_code == AWS_ERROR_SUCCESS) {
        AWS_FATAL_ASSERT(response_topic != NULL && payload != NULL);

        aws_byte_buf_init_copy_from_cursor(&binding->topic, binding->allocator, *response_topic);

        binding->payload = aws_mem_calloc(binding->allocator, 1, sizeof(struct aws_byte_buf));
        aws_byte_buf_init_copy_from_cursor(binding->payload, binding->allocator, *payload);
    } else {
        binding->error_code = error_code;
    }

    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_completion, binding));
}

/*
 * Temporary storage of napi binary/string data needed for request submission.
 */
struct aws_mqtt_request_response_storage {
    struct aws_mqtt_request_operation_options options;

    struct aws_array_list subscription_topic_filters;
    struct aws_array_list response_paths;

    struct aws_byte_buf storage;
};

static void s_cleanup_request_storage(struct aws_mqtt_request_response_storage *storage) {
    aws_array_list_clean_up(&storage->subscription_topic_filters);
    aws_array_list_clean_up(&storage->response_paths);

    aws_byte_buf_clean_up(&storage->storage);
}

/*
 * We initialize storage in two phases.  The first phase computes how much memory we need to allocate to stora all the
 * data.  This structure tracks those numbers.
 */
struct aws_mqtt_request_response_storage_properties {
    size_t bytes_needed;
    size_t subscription_topic_filter_count;
    size_t response_path_count;
};

static int s_compute_request_response_storage_properties(
    napi_env env,
    napi_value options,
    void *log_context,
    struct aws_mqtt_request_response_storage_properties *storage_properties) {
    AWS_ZERO_STRUCT(*storage_properties);

    //  Step 1 - figure out how many subscription topic filters there are
    napi_value node_subscription_topic_filters = NULL;
    if (aws_napi_get_named_property(
            env, options, AWS_NAPI_KEY_SUBSCRIPTION_TOPIC_FILTERS, napi_object, &node_subscription_topic_filters) !=
        AWS_NGNPR_VALID_VALUE) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_request_response_storage_properties - missing subscription topic filters",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    if (aws_napi_is_null_or_undefined(env, node_subscription_topic_filters)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_request_response_storage_properties - null subscription topic filters",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    uint32_t subscription_filter_count = 0;
    AWS_NAPI_CALL(env, napi_get_array_length(env, node_subscription_topic_filters, &subscription_filter_count), {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_request_response_storage_properties - subscription topic filters is not an array",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    });

    storage_properties->subscription_topic_filter_count = subscription_filter_count;

    //  Step 2 - figure out how many response paths there are
    napi_value node_response_paths = NULL;
    if (aws_napi_get_named_property(env, options, AWS_NAPI_KEY_RESPONSE_PATHS, napi_object, &node_response_paths) !=
        AWS_NGNPR_VALID_VALUE) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_request_response_storage_properties - missing response paths",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    if (aws_napi_is_null_or_undefined(env, node_response_paths)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_request_response_storage_properties - null response paths",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    uint32_t response_path_count = 0;
    AWS_NAPI_CALL(env, napi_get_array_length(env, node_response_paths, &response_path_count), {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_request_response_storage_properties - response paths is not an array",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    });

    storage_properties->response_path_count = response_path_count;

    // Step 3 - Go through all the subscriptiojn topic filters, response paths, and options fields and add up
    // the lengths of all the string and binary data fields.
    for (size_t i = 0; i < subscription_filter_count; ++i) {
        napi_value array_element;
        AWS_NAPI_CALL(env, napi_get_element(env, node_subscription_topic_filters, i, &array_element), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_compute_request_response_storage_properties - failed to get subscription topic filter entry",
                log_context);
            return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE);
        });

        size_t filter_length = 0;
        if (aws_napi_value_get_storage_length(env, array_element, &filter_length)) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_compute_request_response_storage_properties - failed to get subscription topic filter length",
                log_context);
            return AWS_OP_ERR;
        };

        storage_properties->bytes_needed += filter_length;
    }

    for (size_t i = 0; i < response_path_count; ++i) {
        napi_value array_element;
        AWS_NAPI_CALL(env, napi_get_element(env, node_response_paths, i, &array_element), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_compute_request_response_storage_properties - failed to get response path entry",
                log_context);
            return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE);
        });

        napi_value node_topic;
        if (aws_napi_get_named_property(env, array_element, AWS_NAPI_KEY_TOPIC, napi_string, &node_topic) !=
            AWS_NGNPR_VALID_VALUE) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_compute_request_response_storage_properties - failed to get response path topic",
                log_context);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        }

        size_t topic_length = 0;
        if (aws_napi_value_get_storage_length(env, node_topic, &topic_length)) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_compute_request_response_storage_properties - failed compute response path topic length",
                log_context);
            return AWS_OP_ERR;
        }

        storage_properties->bytes_needed += topic_length;

        napi_value node_correlation_token_json_path;
        if (aws_napi_get_named_property(
                env,
                array_element,
                AWS_NAPI_KEY_CORRELATION_TOKEN_JSON_PATH,
                napi_string,
                &node_correlation_token_json_path) == AWS_NGNPR_VALID_VALUE) {
            size_t json_path_length = 0;
            if (aws_napi_value_get_storage_length(env, node_correlation_token_json_path, &json_path_length)) {
                AWS_LOGF_ERROR(
                    AWS_LS_NODEJS_CRT_GENERAL,
                    "id=%p s_compute_request_response_storage_properties - failed to compute response path correlation "
                    "token json path length",
                    log_context);
                return AWS_OP_ERR;
            }

            storage_properties->bytes_needed += json_path_length;
        }
    }

    napi_value node_publish_topic;
    if (aws_napi_get_named_property(env, options, AWS_NAPI_KEY_PUBLISH_TOPIC, napi_string, &node_publish_topic) !=
        AWS_NGNPR_VALID_VALUE) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_request_response_storage_properties - failed to get publish topic",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    size_t publish_topic_length = 0;
    if (aws_napi_value_get_storage_length(env, node_publish_topic, &publish_topic_length)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_request_response_storage_properties - failed to compute publish topic length",
            log_context);
        return AWS_OP_ERR;
    }

    storage_properties->bytes_needed += publish_topic_length;

    napi_value node_payload;
    if (aws_napi_get_named_property(env, options, AWS_NAPI_KEY_PAYLOAD, napi_string, &node_payload) !=
        AWS_NGNPR_VALID_VALUE) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_request_response_storage_properties - failed to get payload",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    size_t payload_length = 0;
    if (aws_napi_value_get_storage_length(env, node_payload, &payload_length)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_request_response_storage_properties - failed to compute payload length",
            log_context);
        return AWS_OP_ERR;
    }

    storage_properties->bytes_needed += payload_length;

    napi_value node_correlation_token;
    if (aws_napi_get_named_property(
            env, options, AWS_NAPI_KEY_CORRELATION_TOKEN, napi_string, &node_correlation_token) ==
        AWS_NGNPR_VALID_VALUE) {
        size_t correlation_token_length = 0;
        if (aws_napi_value_get_storage_length(env, node_correlation_token, &correlation_token_length)) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_compute_request_response_storage_properties - failed to compute correlation token length",
                log_context);
            return AWS_OP_ERR;
        }

        storage_properties->bytes_needed += correlation_token_length;
    }

    /* extracting a string value ends up writing the null terminator, so add sufficient padding */
    storage_properties->bytes_needed += 1;

    return AWS_OP_SUCCESS;
}

static int s_initialize_request_storage_from_napi_options(
    struct aws_mqtt_request_response_storage *storage,
    napi_env env,
    napi_value options,
    void *log_context) {
    struct aws_allocator *allocator = aws_napi_get_allocator();

    struct aws_mqtt_request_response_storage_properties storage_properties;
    AWS_ZERO_STRUCT(storage_properties);

    if (s_compute_request_response_storage_properties(env, options, log_context, &storage_properties)) {
        // all failure paths in that function log the reason for failure already
        return AWS_OP_ERR;
    }

    if (storage_properties.subscription_topic_filter_count == 0) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_initialize_request_storage_from_napi_options - empty subscription topic filters array",
            (void *)log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    if (storage_properties.response_path_count == 0) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_initialize_request_storage_from_napi_options - empty response paths array",
            (void *)log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    aws_byte_buf_init(&storage->storage, allocator, storage_properties.bytes_needed);
    aws_array_list_init_dynamic(
        &storage->subscription_topic_filters,
        allocator,
        storage_properties.subscription_topic_filter_count,
        sizeof(struct aws_byte_cursor));
    aws_array_list_init_dynamic(
        &storage->response_paths,
        allocator,
        storage_properties.response_path_count,
        sizeof(struct aws_mqtt_request_operation_response_path));

    napi_value node_subscription_topic_filters = NULL;
    if (aws_napi_get_named_property(
            env, options, AWS_NAPI_KEY_SUBSCRIPTION_TOPIC_FILTERS, napi_object, &node_subscription_topic_filters) !=
        AWS_NGNPR_VALID_VALUE) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_initialize_request_storage_from_napi_options - missing subscription topic filters",
            (void *)log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    for (size_t i = 0; i < storage_properties.subscription_topic_filter_count; ++i) {
        napi_value array_element;
        AWS_NAPI_CALL(env, napi_get_element(env, node_subscription_topic_filters, i, &array_element), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_initialize_request_storage_from_napi_options - failed to get subscription topic filter "
                "element",
                (void *)log_context);
            return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE);
        });

        struct aws_byte_cursor bytes_written;
        if (aws_napi_value_bytebuf_append(env, array_element, &storage->storage, &bytes_written)) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_initialize_request_storage_from_napi_options - failed to append subscription topic filter",
                (void *)log_context);
            return AWS_OP_ERR;
        }

        aws_array_list_push_back(&storage->subscription_topic_filters, &bytes_written);
    }

    storage->options.subscription_topic_filters = storage->subscription_topic_filters.data;
    storage->options.subscription_topic_filter_count = storage_properties.subscription_topic_filter_count;

    napi_value node_response_paths = NULL;
    if (aws_napi_get_named_property(env, options, AWS_NAPI_KEY_RESPONSE_PATHS, napi_object, &node_response_paths) !=
        AWS_NGNPR_VALID_VALUE) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_initialize_request_storage_from_napi_options - missing response paths",
            (void *)log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    for (size_t i = 0; i < storage_properties.response_path_count; ++i) {
        napi_value response_path_element;
        AWS_NAPI_CALL(env, napi_get_element(env, node_response_paths, i, &response_path_element), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_initialize_request_storage_from_napi_options - failed to get response path element",
                (void *)log_context);
            return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE);
        });

        struct aws_mqtt_request_operation_response_path response_path;
        AWS_ZERO_STRUCT(response_path);

        napi_value node_topic;
        if (aws_napi_get_named_property(env, response_path_element, AWS_NAPI_KEY_TOPIC, napi_string, &node_topic) !=
            AWS_NGNPR_VALID_VALUE) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_initialize_request_storage_from_napi_options - failed to get response path topic",
                log_context);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        }

        if (aws_napi_value_bytebuf_append(env, node_topic, &storage->storage, &response_path.topic)) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_initialize_request_storage_from_napi_options - failed to append response path topic",
                log_context);
            return AWS_OP_ERR;
        }

        napi_value node_correlation_token_json_path;
        if (aws_napi_get_named_property(
                env,
                response_path_element,
                AWS_NAPI_KEY_CORRELATION_TOKEN_JSON_PATH,
                napi_string,
                &node_correlation_token_json_path) == AWS_NGNPR_VALID_VALUE) {
            if (aws_napi_value_bytebuf_append(
                    env,
                    node_correlation_token_json_path,
                    &storage->storage,
                    &response_path.correlation_token_json_path)) {
                AWS_LOGF_ERROR(
                    AWS_LS_NODEJS_CRT_GENERAL,
                    "id=%p s_initialize_request_storage_from_napi_options - failed to append response path correlation "
                    "token json path",
                    log_context);
                return AWS_OP_ERR;
            }
        }

        aws_array_list_push_back(&storage->response_paths, &response_path);
    }

    storage->options.response_paths = storage->response_paths.data;
    storage->options.response_path_count = storage_properties.response_path_count;

    napi_value node_publish_topic;
    if (aws_napi_get_named_property(env, options, AWS_NAPI_KEY_PUBLISH_TOPIC, napi_string, &node_publish_topic) !=
        AWS_NGNPR_VALID_VALUE) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_initialize_request_storage_from_napi_options - failed to get publish topic",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    if (aws_napi_value_bytebuf_append(env, node_publish_topic, &storage->storage, &storage->options.publish_topic)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_initialize_request_storage_from_napi_options - failed append publish topic",
            log_context);
        return AWS_OP_ERR;
    }

    napi_value node_payload;
    if (aws_napi_get_named_property(env, options, AWS_NAPI_KEY_PAYLOAD, napi_string, &node_payload) !=
        AWS_NGNPR_VALID_VALUE) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_initialize_request_storage_from_napi_options - failed to get payload",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    if (aws_napi_value_bytebuf_append(env, node_payload, &storage->storage, &storage->options.serialized_request)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_initialize_request_storage_from_napi_options - failed append payload",
            log_context);
        return AWS_OP_ERR;
    }

    napi_value node_correlation_token;
    if (aws_napi_get_named_property(
            env, options, AWS_NAPI_KEY_CORRELATION_TOKEN, napi_string, &node_correlation_token) ==
        AWS_NGNPR_VALID_VALUE) {
        if (aws_napi_value_bytebuf_append(
                env, node_correlation_token, &storage->storage, &storage->options.correlation_token)) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_initialize_request_storage_from_napi_options - failed to append correlation token",
                log_context);
            return AWS_OP_ERR;
        }
    }

    AWS_FATAL_ASSERT(storage->storage.capacity == storage->storage.len + 1);

    return AWS_OP_SUCCESS;
}

napi_value aws_napi_mqtt_request_response_client_submit_request(napi_env env, napi_callback_info info) {
    struct aws_allocator *allocator = aws_napi_get_allocator();

    int result = AWS_OP_ERR;

    struct aws_mqtt_request_response_storage request_storage;
    AWS_ZERO_STRUCT(request_storage);

    struct aws_napi_mqtt_request_binding *request_binding =
        aws_mem_calloc(allocator, 1, sizeof(struct aws_napi_mqtt_request_binding));
    request_binding->allocator = allocator;

    napi_value node_args[3];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_mqtt_request_response_client_submit_request - failed to retrieve callback information");
        goto done;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_request_response_client_submit_request - needs exactly 3 arguments");
        goto done;
    }

    napi_value *arg = &node_args[0];
    napi_value node_binding = *arg++;
    struct aws_mqtt_request_response_client_binding *client_binding = NULL;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_binding, (void **)&client_binding), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_mqtt_request_response_client_submit_request - failed to extract binding from external");
        goto done;
    });

    napi_value node_options = *arg++;
    if (s_initialize_request_storage_from_napi_options(&request_storage, env, node_options, client_binding->client)) {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_mqtt_request_response_client_submit_request - failed to initialize request options from napi "
            "options");
        goto done;
    }

    napi_value node_on_completion = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_on_completion)) {
        AWS_NAPI_CALL(
            env,
            aws_napi_create_threadsafe_function(
                env,
                node_on_completion,
                "aws_mqtt_request_response_client_on_completion",
                s_napi_on_request_complete,
                request_binding,
                &request_binding->on_completion),
            {
                napi_throw_error(
                    env,
                    NULL,
                    "aws_napi_mqtt_request_response_client_submit_request - failed to create completion callback");
                goto done;
            });
    } else {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_request_response_client_submit_request - invalid completion callback");
        goto done;
    }

    request_storage.options.completion_callback = s_on_request_complete;
    request_storage.options.user_data = request_binding;

    result = aws_mqtt_request_response_client_submit_request(client_binding->client, &request_storage.options);
    if (result == AWS_OP_ERR) {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_mqtt_request_response_client_submit_request - failure invoking native client submit_request");
    }

done:

    s_cleanup_request_storage(&request_storage);

    if (result == AWS_OP_ERR) {
        s_aws_napi_mqtt_request_binding_destroy(request_binding);
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
