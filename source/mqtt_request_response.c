/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#include "mqtt_request_response.h"

#include "mqtt5_client.h"
#include "mqtt_client_connection.h"

#include <aws/common/ref_count.h>
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
static const char *AWS_NAPI_KEY_SUBSCRIPTION_TOPIC_FILTER = "subscriptionTopicFilter";

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
        napi_throw_error(env, NULL, "aws_napi_request_mqtt_response_client_new_from_5 - invalid protocol client");
        goto done;
    }

    struct aws_mqtt5_client_binding *mqtt5_client_binding = NULL;
    napi_get_value_external(env, node_mqtt5_client_handle, (void **)&mqtt5_client_binding);

    protocol_client = aws_napi_get_mqtt5_client_from_binding(mqtt5_client_binding);
    if (protocol_client == NULL) {
        napi_throw_error(
            env, NULL, "aws_napi_request_mqtt_response_client_new_from_5 - could not extract native protocol client");
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
        napi_throw_error(env, NULL, "aws_napi_request_mqtt_response_client_new_from_5 - invalid configuration options");
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
        napi_throw_error(env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - invalid protocol client");
        goto done;
    }

    struct mqtt_connection_binding *mqtt_client_connection_binding = NULL;
    napi_get_value_external(env, node_mqtt_client_connection_handle, (void **)&mqtt_client_connection_binding);

    protocol_client = aws_napi_get_mqtt_client_connection_from_binding(mqtt_client_connection_binding);
    if (protocol_client == NULL) {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - could not extract native protocol client");
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
            env, NULL, "aws_napi_mqtt_request_response_client_new_from_311 - invalid configuration options");
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

    // Step 3 - Go through all the subscription topic filters, response paths, and options fields and add up
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
        enum aws_napi_get_named_property_result gpr = aws_napi_get_named_property(
            env,
            array_element,
            AWS_NAPI_KEY_CORRELATION_TOKEN_JSON_PATH,
            napi_string,
            &node_correlation_token_json_path);
        if (gpr != AWS_NGNPR_NO_VALUE) {
            size_t json_path_length = 0;
            if (gpr == AWS_NGNPR_INVALID_VALUE) {
                AWS_LOGF_ERROR(
                    AWS_LS_NODEJS_CRT_GENERAL,
                    "id=%p s_compute_request_response_storage_properties - response path correlation "
                    "token json path has invalid type",
                    log_context);
                return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
            }
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
    if (aws_napi_get_named_property(env, options, AWS_NAPI_KEY_PAYLOAD, napi_undefined, &node_payload) !=
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
    enum aws_napi_get_named_property_result ct_gpr =
        aws_napi_get_named_property(env, options, AWS_NAPI_KEY_CORRELATION_TOKEN, napi_string, &node_correlation_token);
    if (ct_gpr != AWS_NGNPR_NO_VALUE) {
        size_t correlation_token_length = 0;
        if (ct_gpr == AWS_NGNPR_INVALID_VALUE) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_compute_request_response_storage_properties - invalid correlation token",
                log_context);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        }

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
    if (aws_napi_get_named_property(env, options, AWS_NAPI_KEY_PAYLOAD, napi_undefined, &node_payload) !=
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
        napi_throw_error(env, NULL, "aws_napi_mqtt_request_response_client_submit_request - invalid request options");
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

///////////////////////////////////////////////////////////////////////////////////////////

struct aws_request_response_streaming_operation_binding {
    struct aws_allocator *allocator;

    /*
     * May only be accessed from within the libuv thread.
     */
    struct aws_mqtt_rr_client_operation *streaming_operation;

    /*
     * +1 from successful new -> termination callback
     * +1 for every in-flight callback from client event loop thread to lib uv thread
     */
    struct aws_ref_count ref_count;

    /*
     * Single count ref to the JS streaming operation object.
     */
    napi_ref node_streaming_operation_ref;

    /*
     * Single count ref to the node external managed by the binding.
     */
    napi_ref node_streaming_operation_external_ref;

    napi_threadsafe_function on_subscription_status_changed;
    napi_threadsafe_function on_incoming_publish;

    bool is_closed;
};

static void s_aws_request_response_streaming_operation_binding_on_zero(void *context) {
    if (context == NULL) {
        return;
    }

    struct aws_request_response_streaming_operation_binding *binding = context;

    AWS_CLEAN_THREADSAFE_FUNCTION(binding, on_subscription_status_changed);
    AWS_CLEAN_THREADSAFE_FUNCTION(binding, on_incoming_publish);

    aws_mem_release(binding->allocator, binding);
}

static struct aws_request_response_streaming_operation_binding *
    s_aws_request_response_streaming_operation_binding_acquire(
        struct aws_request_response_streaming_operation_binding *binding) {
    if (binding != NULL) {
        aws_ref_count_acquire(&binding->ref_count);
    }

    return binding;
}

static struct aws_request_response_streaming_operation_binding *
    s_aws_request_response_streaming_operation_binding_release(
        struct aws_request_response_streaming_operation_binding *binding) {
    if (binding != NULL) {
        aws_ref_count_release(&binding->ref_count);
    }

    return NULL;
}

static void s_streaming_operation_close(
    struct aws_request_response_streaming_operation_binding *binding,
    napi_env env) {
    if (binding == NULL) {
        return;
    }

    binding->is_closed = true;

    napi_ref node_streaming_operation_external_ref = binding->node_streaming_operation_external_ref;
    binding->node_streaming_operation_external_ref = NULL;

    napi_ref node_streaming_operation_ref = binding->node_streaming_operation_ref;
    binding->node_streaming_operation_ref = NULL;

    if (node_streaming_operation_external_ref != NULL) {
        napi_delete_reference(env, node_streaming_operation_external_ref);
    }

    if (node_streaming_operation_ref != NULL) {
        napi_delete_reference(env, node_streaming_operation_ref);
    }

    aws_mqtt_rr_client_operation_release(binding->streaming_operation);
    binding->streaming_operation = NULL;
}

static void s_aws_mqtt_request_response_streaming_operation_extern_finalize(
    napi_env env,
    void *finalize_data,
    void *finalize_hint) {
    (void)finalize_hint;
    (void)env;

    struct aws_request_response_streaming_operation_binding *binding = finalize_data;

    AWS_LOGF_INFO(
        AWS_LS_NODEJS_CRT_GENERAL,
        "id=%p s_aws_mqtt_request_response_streaming_operation_extern_finalize - node wrapper is being finalized",
        (void *)binding->streaming_operation);

    if (binding->streaming_operation != NULL) {
        aws_mqtt_rr_client_operation_release(binding->streaming_operation);
        binding->streaming_operation = NULL;
    }
}

struct on_subscription_status_changed_user_data {
    struct aws_allocator *allocator;

    struct aws_request_response_streaming_operation_binding *binding_ref;

    enum aws_rr_streaming_subscription_event_type status;
    int error_code;
};

static void s_on_subscription_status_changed_user_data_destroy(
    struct on_subscription_status_changed_user_data *user_data) {
    if (user_data == NULL) {
        return;
    }

    user_data->binding_ref = s_aws_request_response_streaming_operation_binding_release(user_data->binding_ref);

    aws_mem_release(user_data->allocator, user_data);
}

static struct on_subscription_status_changed_user_data *s_on_subscription_status_changed_user_data_new(
    struct aws_request_response_streaming_operation_binding *binding,
    enum aws_rr_streaming_subscription_event_type status,
    int error_code) {

    struct on_subscription_status_changed_user_data *user_data =
        aws_mem_calloc(binding->allocator, 1, sizeof(struct on_subscription_status_changed_user_data));
    user_data->allocator = binding->allocator;
    user_data->status = status;
    user_data->error_code = error_code;

    user_data->binding_ref = s_aws_request_response_streaming_operation_binding_acquire(binding);

    return user_data;
}

static void s_napi_mqtt_streaming_operation_on_subscription_status_changed(
    napi_env env,
    napi_value function,
    void *context,
    void *user_data) {

    (void)context;

    struct on_subscription_status_changed_user_data *status_event = user_data;
    struct aws_request_response_streaming_operation_binding *binding = status_event->binding_ref;

    if (env && !binding->is_closed) {
        napi_value params[3];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_streaming_operation_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            AWS_LOGF_INFO(
                AWS_LS_NODEJS_CRT_GENERAL,
                "s_napi_mqtt_streaming_operation_on_subscription_status_changed - streaming operation node wrapper no "
                "longer resolvable");
            goto done;
        }

        AWS_NAPI_CALL(env, napi_create_int32(env, (int)status_event->status, &params[1]), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "s_napi_mqtt_streaming_operation_on_subscription_status_changed - failed to create status value");
            goto done;
        });

        AWS_NAPI_CALL(env, napi_create_int32(env, status_event->error_code, &params[2]), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "s_napi_mqtt_streaming_operation_on_subscription_status_changed - failed to create error code "
                "value");
            goto done;
        });

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(
                env, binding->on_subscription_status_changed, NULL, function, num_params, params));
    }

done:

    s_on_subscription_status_changed_user_data_destroy(status_event);
}

static void s_mqtt_streaming_operation_on_subscription_status_changed(
    enum aws_rr_streaming_subscription_event_type event_type,
    int error_code,
    void *user_data) {

    struct aws_request_response_streaming_operation_binding *binding = user_data;

    struct on_subscription_status_changed_user_data *status_changed_ud =
        s_on_subscription_status_changed_user_data_new(binding, event_type, error_code);
    if (status_changed_ud == NULL) {
        return;
    }

    /* queue a callback in node's libuv thread */
    AWS_NAPI_ENSURE(
        NULL, aws_napi_queue_threadsafe_function(binding->on_subscription_status_changed, status_changed_ud));
}

struct on_incoming_publish_user_data {
    struct aws_allocator *allocator;

    struct aws_request_response_streaming_operation_binding *binding_ref;
    struct aws_byte_buf *payload;
};

static void s_on_incoming_publish_user_data_destroy(struct on_incoming_publish_user_data *user_data) {
    if (user_data == NULL) {
        return;
    }

    user_data->binding_ref = s_aws_request_response_streaming_operation_binding_release(user_data->binding_ref);

    if (user_data->payload != NULL) {
        aws_byte_buf_clean_up(user_data->payload);
        aws_mem_release(user_data->allocator, user_data->payload);
    }

    aws_mem_release(user_data->allocator, user_data);
}

static struct on_incoming_publish_user_data *s_on_incoming_publish_user_data_new(
    struct aws_request_response_streaming_operation_binding *binding,
    struct aws_byte_cursor payload) {

    struct on_incoming_publish_user_data *user_data =
        aws_mem_calloc(binding->allocator, 1, sizeof(struct on_incoming_publish_user_data));
    user_data->allocator = binding->allocator;

    user_data->payload = aws_mem_calloc(binding->allocator, 1, sizeof(struct aws_byte_buf));
    if (aws_byte_buf_init_copy_from_cursor(user_data->payload, binding->allocator, payload)) {
        goto error;
    }

    user_data->binding_ref = s_aws_request_response_streaming_operation_binding_acquire(binding);

    return user_data;

error:

    s_on_incoming_publish_user_data_destroy(user_data);

    return NULL;
}

static int s_aws_create_napi_value_from_incoming_publish_event(
    napi_env env,
    struct on_incoming_publish_user_data *publish_event,
    napi_value *napi_publish_event_out) {

    if (env == NULL) {
        return aws_raise_error(AWS_CRT_NODEJS_ERROR_THREADSAFE_FUNCTION_NULL_NAPI_ENV);
    }

    napi_value napi_event = NULL;
    AWS_NAPI_CALL(
        env, napi_create_object(env, &napi_event), { return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE); });

    if (aws_napi_attach_object_property_binary_as_finalizable_external(
            napi_event, env, AWS_NAPI_KEY_PAYLOAD, publish_event->payload)) {
        return AWS_OP_ERR;
    }

    /* the extern's finalizer is now responsible for cleaning up the buffer */
    publish_event->payload = NULL;

    *napi_publish_event_out = napi_event;

    return AWS_OP_SUCCESS;
}

static void s_napi_mqtt_streaming_operation_on_incoming_publish(
    napi_env env,
    napi_value function,
    void *context,
    void *user_data) {

    (void)context;

    struct on_incoming_publish_user_data *publish_event = user_data;
    struct aws_request_response_streaming_operation_binding *binding = publish_event->binding_ref;

    if (env && !binding->is_closed) {
        napi_value params[2];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        /*
         * If we can't resolve the weak ref to the event stream, then it's been garbage collected and we
         * should not do anything.
         */
        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_streaming_operation_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            AWS_LOGF_INFO(
                AWS_LS_NODEJS_CRT_GENERAL,
                "s_napi_mqtt_streaming_operation_on_incoming_publish - streaming operation node wrapper no "
                "longer resolvable");
            goto done;
        }

        if (s_aws_create_napi_value_from_incoming_publish_event(env, publish_event, &params[1])) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "s_napi_mqtt_streaming_operation_on_incoming_publish - failed to create JS representation of incoming "
                "publish");
            goto done;
        }

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(
                env, binding->on_incoming_publish, NULL, function, num_params, params));
    }

done:

    s_on_incoming_publish_user_data_destroy(publish_event);
}

static void s_mqtt_streaming_operation_on_incoming_publish(struct aws_byte_cursor payload, void *user_data) {
    struct aws_request_response_streaming_operation_binding *binding = user_data;

    struct on_incoming_publish_user_data *incoming_publish_ud = s_on_incoming_publish_user_data_new(binding, payload);
    if (incoming_publish_ud == NULL) {
        return;
    }

    /* queue a callback in node's libuv thread */
    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_incoming_publish, incoming_publish_ud));
}

static void s_mqtt_streaming_operation_terminated_fn(void *user_data) {
    struct aws_request_response_streaming_operation_binding *binding = user_data;
    if (binding == NULL) {
        return;
    }

    s_aws_request_response_streaming_operation_binding_release(binding);
}

/*
 * Temporary storage of napi binary/string data needed for request submission.
 */
struct aws_mqtt_streaming_operation_options_storage {
    struct aws_byte_cursor topic_filter;

    struct aws_byte_buf storage;
};

static void s_cleanup_streaming_operation_storage(struct aws_mqtt_streaming_operation_options_storage *storage) {
    aws_byte_buf_clean_up(&storage->storage);
}

/*
 * We initialize storage in two phases.  The first phase computes how much memory we need to allocate to store all the
 * data.  This structure tracks those numbers.
 */
struct aws_mqtt_streaming_operation_storage_properties {
    size_t bytes_needed;
};

static int s_compute_streaming_operation_storage_properties(
    napi_env env,
    napi_value options,
    void *log_context,
    struct aws_mqtt_streaming_operation_storage_properties *storage_properties) {
    AWS_ZERO_STRUCT(*storage_properties);

    napi_value node_subscription_topic_filter;
    if (aws_napi_get_named_property(
            env, options, AWS_NAPI_KEY_SUBSCRIPTION_TOPIC_FILTER, napi_string, &node_subscription_topic_filter) !=
        AWS_NGNPR_VALID_VALUE) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_streaming_operation_storage_properties - failed to get subscription topic filter",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    size_t subscription_topic_filter_length = 0;
    if (aws_napi_value_get_storage_length(env, node_subscription_topic_filter, &subscription_topic_filter_length)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_compute_streaming_operation_storage_properties - failed to compute subscription topic filter "
            "length",
            log_context);
        return AWS_OP_ERR;
    }

    storage_properties->bytes_needed += subscription_topic_filter_length;

    /* extracting a string value ends up writing the null terminator, so add sufficient padding */
    storage_properties->bytes_needed += 1;

    return AWS_OP_SUCCESS;
}

static int s_initialize_streaming_operation_storage_from_napi_options(
    struct aws_mqtt_streaming_operation_options_storage *storage,
    napi_env env,
    napi_value options,
    void *log_context) {
    struct aws_allocator *allocator = aws_napi_get_allocator();

    struct aws_mqtt_streaming_operation_storage_properties storage_properties;
    AWS_ZERO_STRUCT(storage_properties);

    if (s_compute_streaming_operation_storage_properties(env, options, log_context, &storage_properties)) {
        // all failure paths in that function log the reason for failure already
        return AWS_OP_ERR;
    }

    aws_byte_buf_init(&storage->storage, allocator, storage_properties.bytes_needed);

    napi_value node_subscription_topic_filter;
    if (aws_napi_get_named_property(
            env, options, AWS_NAPI_KEY_SUBSCRIPTION_TOPIC_FILTER, napi_string, &node_subscription_topic_filter) !=
        AWS_NGNPR_VALID_VALUE) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_initialize_streaming_operation_storage_from_napi_options - failed to get subscription topic "
            "filter",
            log_context);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    if (aws_napi_value_bytebuf_append(env, node_subscription_topic_filter, &storage->storage, &storage->topic_filter)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_initialize_streaming_operation_storage_from_napi_options - failed append subscription topic "
            "filter",
            log_context);
        return AWS_OP_ERR;
    }

    AWS_FATAL_ASSERT(storage->storage.capacity == storage->storage.len + 1);

    return AWS_OP_SUCCESS;
}

napi_value aws_napi_mqtt_streaming_operation_new(napi_env env, napi_callback_info info) {
    napi_value node_args[5];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_new - Failed to retrieve arguments");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_new - needs exactly 5 arguments");
        return NULL;
    }

    struct aws_mqtt_streaming_operation_options_storage streaming_operation_options;
    AWS_ZERO_STRUCT(streaming_operation_options);

    napi_value node_streaming_operation_ref = NULL;
    napi_value node_external = NULL;
    struct aws_allocator *allocator = aws_napi_get_allocator();

    struct aws_request_response_streaming_operation_binding *binding =
        aws_mem_calloc(allocator, 1, sizeof(struct aws_request_response_streaming_operation_binding));
    binding->allocator = allocator;
    aws_ref_count_init(&binding->ref_count, binding, s_aws_request_response_streaming_operation_binding_on_zero);

    AWS_NAPI_CALL(
        env,
        napi_create_external(
            env, binding, s_aws_mqtt_request_response_streaming_operation_extern_finalize, NULL, &node_external),
        {
            napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_new - Failed to create n-api external");
            s_aws_request_response_streaming_operation_binding_release(binding);
            goto done;
        });

    /*
     * From here on out, a failure will lead the external to getting finalized by node, which in turn will lead the
     * binding to getting cleaned up.
     */

    /* Arg #1: the js stream */
    napi_value node_streaming_operation = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_streaming_operation)) {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_streaming_operation_new - Required streaming operation parameter is null");
        goto done;
    }

    AWS_NAPI_CALL(
        env, napi_create_reference(env, node_streaming_operation, 1, &binding->node_streaming_operation_ref), {
            napi_throw_error(
                env,
                NULL,
                "aws_napi_mqtt_streaming_operation_new - Failed to create reference to node streaming operation");
            goto done;
        });

    /* the reference to the JS streaming operation was successfully created.  From now on, any failure needs to undo it.
     */

    /* Arg #2: the request response client to create a streaming operation from */
    struct aws_mqtt_request_response_client_binding *client_binding = NULL;
    napi_value node_client_binding = *arg++;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_client_binding, (void **)&client_binding), {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_new - Failed to extract client binding");
        goto post_ref_error;
    });

    if (client_binding == NULL) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_new - client binding was null");
        goto post_ref_error;
    }

    if (client_binding->client == NULL) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_new - native client is null");
        goto post_ref_error;
    }

    /* Arg #3: streaming operation options */
    napi_value node_streaming_operation_config = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_streaming_operation_config)) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_new - required configuration parameter is null");
        goto post_ref_error;
    }

    if (s_initialize_streaming_operation_storage_from_napi_options(
            &streaming_operation_options, env, node_streaming_operation_config, client_binding->client)) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_new - invalid configuration options");
        goto post_ref_error;
    }

    /* Arg #4: subscription status event callback */
    napi_value on_subscription_status_changed_handler = *arg++;
    if (aws_napi_is_null_or_undefined(env, on_subscription_status_changed_handler)) {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_mqtt_streaming_operation_new - required on_subscription_status_changed event handler is null");
        goto post_ref_error;
    }

    AWS_NAPI_CALL(
        env,
        aws_napi_create_threadsafe_function(
            env,
            on_subscription_status_changed_handler,
            "aws_mqtt_streaming_operation_on_subscription_status_changed",
            s_napi_mqtt_streaming_operation_on_subscription_status_changed,
            NULL,
            &binding->on_subscription_status_changed),
        {
            napi_throw_error(
                env,
                NULL,
                "aws_napi_mqtt_streaming_operation_new - failed to initialize on_subscription_status_changed "
                "threadsafe function");
            goto post_ref_error;
        });

    /* Arg #5: incoming publish callback */
    napi_value on_incoming_publish_handler = *arg++;
    if (aws_napi_is_null_or_undefined(env, on_incoming_publish_handler)) {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_streaming_operation_new - required on_incoming_publish event handler is null");
        goto post_ref_error;
    }

    AWS_NAPI_CALL(
        env,
        aws_napi_create_threadsafe_function(
            env,
            on_incoming_publish_handler,
            "aws_mqtt_streaming_operation_on_incoming_publish",
            s_napi_mqtt_streaming_operation_on_incoming_publish,
            NULL,
            &binding->on_incoming_publish),
        {
            napi_throw_error(
                env,
                NULL,
                "aws_napi_mqtt_streaming_operation_new - failed to initialize on_incoming_publish threadsafe function");
            goto post_ref_error;
        });

    struct aws_mqtt_streaming_operation_options operation_options = {
        .topic_filter = streaming_operation_options.topic_filter,
        .subscription_status_callback = s_mqtt_streaming_operation_on_subscription_status_changed,
        .incoming_publish_callback = s_mqtt_streaming_operation_on_incoming_publish,
        .terminated_callback = s_mqtt_streaming_operation_terminated_fn,
        .user_data = binding,
    };

    binding->streaming_operation =
        aws_mqtt_request_response_client_create_streaming_operation(client_binding->client, &operation_options);
    if (binding->streaming_operation == NULL) {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_streaming_operation_new - Failed to create native streaming operation");
        goto post_ref_error;
    }

    AWS_NAPI_CALL(env, napi_create_reference(env, node_external, 1, &binding->node_streaming_operation_ref), {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_streaming_operation_new - Failed to create one count reference to napi external");
        goto post_ref_error;
    });

    node_streaming_operation_ref = node_external;
    goto done;

post_ref_error:

    s_streaming_operation_close(binding, env);

done:

    s_cleanup_streaming_operation_storage(&streaming_operation_options);

    return node_streaming_operation_ref;
}

napi_value aws_napi_mqtt_streaming_operation_open(napi_env env, napi_callback_info info) {
    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_open - Failed to extract parameter array");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_open - needs exactly 1 arguments");
        return NULL;
    }

    struct aws_request_response_streaming_operation_binding *binding = NULL;
    napi_value node_binding = *arg++;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_binding, (void **)&binding), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_mqtt_streaming_operation_open - Failed to extract stream binding from first "
            "argument");
        return NULL;
    });

    if (binding == NULL) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_open - binding is null");
        return NULL;
    }

    if (binding->streaming_operation == NULL) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_open - streaming operation is null");
        return NULL;
    }

    if (aws_mqtt_rr_client_operation_activate(binding->streaming_operation)) {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt_streaming_operation_open - streaming operation activation failed synchronously");
        return NULL;
    }

    return NULL;
}

napi_value aws_napi_mqtt_streaming_operation_close(napi_env env, napi_callback_info info) {
    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_close - Failed to retrieve arguments");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_mqtt_streaming_operation_close - needs exactly 1 argument");
        return NULL;
    }

    struct aws_request_response_streaming_operation_binding *binding = NULL;
    napi_value node_binding = *arg++;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_binding, (void **)&binding), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_mqtt_streaming_operation_close - Failed to extract streaming operation binding from first "
            "argument");
        return NULL;
    });

    s_streaming_operation_close(binding, env);

    return NULL;
}
