/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#include "mqtt5_client.h"
#include "http_connection.h"
#include "io.h"

#include <aws/http/proxy.h>
#include <aws/io/socket.h>
#include <aws/io/tls_channel_handler.h>
#include <aws/mqtt/v5/mqtt5_client.h>
#include <aws/mqtt/v5/mqtt5_packet_storage.h>
#include <aws/mqtt/v5/mqtt5_types.h>

struct aws_mqtt5_client_binding {
    struct aws_allocator *allocator;
    struct aws_mqtt5_client *client;

    struct aws_tls_connection_options tls_connection_options;

    napi_ref node_mqtt5_client_weak_ref;

    napi_threadsafe_function on_stopped;
    napi_threadsafe_function on_attempting_connect;
    napi_threadsafe_function on_connection_success;
    napi_threadsafe_function on_connection_failure;
    napi_threadsafe_function on_disconnection;
};

static void s_mqtt5_client_on_terminate(void *user_data) {
    struct aws_mqtt5_client_binding *binding = user_data;

    aws_tls_connection_options_clean_up(&binding->tls_connection_options);

    aws_mem_release(binding->allocator, binding);
}

#define AWS_CLEAN_THREADSAFE_FUNCTION(function_name)                                                                   \
    if (binding->function_name != NULL) {                                                                              \
        AWS_NAPI_ENSURE(env, aws_napi_release_threadsafe_function(binding->function_name, napi_tsfn_abort));           \
        binding->function_name = NULL;                                                                                 \
    }

static void s_mqtt5_client_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)finalize_hint;

    struct aws_mqtt5_client_binding *binding = finalize_data;

    if (binding->node_mqtt5_client_weak_ref != NULL) {
        napi_delete_reference(env, binding->node_mqtt5_client_weak_ref);
        binding->node_mqtt5_client_weak_ref = NULL;
    }

    AWS_CLEAN_THREADSAFE_FUNCTION(on_stopped);
    AWS_CLEAN_THREADSAFE_FUNCTION(on_attempting_connect);
    AWS_CLEAN_THREADSAFE_FUNCTION(on_connection_success);
    AWS_CLEAN_THREADSAFE_FUNCTION(on_connection_failure);
    AWS_CLEAN_THREADSAFE_FUNCTION(on_disconnection);

    if (binding->client != NULL) {
        aws_mqtt5_client_release(binding->client);
        binding->client = NULL;
    } else {
        s_mqtt5_client_on_terminate(binding);
    }
}

static void s_on_publish_received(const struct aws_mqtt5_packet_publish_view *publish_packet, void *user_data) {
    (void)publish_packet;
    (void)user_data;
}

static void s_on_stopped(struct aws_mqtt5_client_binding *binding) {
    if (!binding->on_stopped) {
        return;
    }

    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_stopped, NULL));
}

static void s_on_attempting_connect(struct aws_mqtt5_client_binding *binding) {
    if (!binding->on_attempting_connect) {
        return;
    }

    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_attempting_connect, NULL));
}

struct on_connection_result_user_data {
    struct aws_allocator *allocator;
    struct aws_mqtt5_packet_connack_storage connack_storage;
    bool is_connack_valid;
    int error_code;
};

static void s_on_connection_result_user_data_destroy(struct on_connection_result_user_data *connection_result_ud) {
    if (connection_result_ud == NULL) {
        return;
    }

    aws_mqtt5_packet_connack_storage_clean_up(&connection_result_ud->connack_storage);

    aws_mem_release(connection_result_ud->allocator, connection_result_ud);
}

static struct on_connection_result_user_data *s_on_connection_result_user_data_new(
    struct aws_allocator *allocator,
    const struct aws_mqtt5_packet_connack_view *connack,
    int error_code) {

    struct on_connection_result_user_data *connection_result_ud =
        aws_mem_calloc(allocator, 1, sizeof(struct on_connection_result_user_data));

    connection_result_ud->allocator = allocator;
    connection_result_ud->error_code = error_code;

    if (connack != NULL) {
        if (aws_mqtt5_packet_connack_storage_init(&connection_result_ud->connack_storage, allocator, connack)) {
            goto error;
        }
        connection_result_ud->is_connack_valid = true;
    } else {
        connection_result_ud->is_connack_valid = false;
    }

    return connection_result_ud;

error:

    s_on_connection_result_user_data_destroy(connection_result_ud);

    return NULL;
}

static void s_on_connection_success(
    struct aws_mqtt5_client_binding *binding,
    const struct aws_mqtt5_packet_connack_view *connack) {
    if (!binding->on_connection_success) {
        return;
    }

    struct on_connection_result_user_data *connection_result_ud =
        s_on_connection_result_user_data_new(binding->allocator, connack, AWS_ERROR_SUCCESS);
    if (connection_result_ud == NULL) {
        return;
    }

    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_connection_success, connection_result_ud));
}

static void s_on_connection_failure(
    struct aws_mqtt5_client_binding *binding,
    const struct aws_mqtt5_packet_connack_view *connack,
    int error_code) {
    if (!binding->on_connection_failure) {
        return;
    }

    struct on_connection_result_user_data *connection_result_ud =
        s_on_connection_result_user_data_new(binding->allocator, connack, error_code);
    if (connection_result_ud == NULL) {
        return;
    }

    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_connection_failure, connection_result_ud));
}

struct on_disconnection_user_data {
    struct aws_allocator *allocator;
    struct aws_mqtt5_packet_disconnect_storage disconnect_storage;
    bool is_disconnect_valid;
    int error_code;
};

static void s_on_disconnection_user_data_destroy(struct on_disconnection_user_data *disconnection_ud) {
    if (disconnection_ud == NULL) {
        return;
    }

    aws_mqtt5_packet_disconnect_storage_clean_up(&disconnection_ud->disconnect_storage);

    aws_mem_release(disconnection_ud->allocator, disconnection_ud);
}

static struct on_disconnection_user_data *s_on_disconnection_user_data_new(
    struct aws_allocator *allocator,
    const struct aws_mqtt5_packet_disconnect_view *disconnect,
    int error_code) {
    struct on_disconnection_user_data *disconnection_ud =
        aws_mem_calloc(allocator, 1, sizeof(struct on_disconnection_user_data));

    disconnection_ud->allocator = allocator;
    disconnection_ud->error_code = error_code;

    if (disconnect != NULL) {
        if (aws_mqtt5_packet_disconnect_storage_init(&disconnection_ud->disconnect_storage, allocator, disconnect)) {
            goto error;
        }
        disconnection_ud->is_disconnect_valid = true;
    } else {
        disconnection_ud->is_disconnect_valid = false;
    }

    return disconnection_ud;

error:

    s_on_disconnection_user_data_destroy(disconnection_ud);

    return NULL;
}

static void s_on_disconnection(
    struct aws_mqtt5_client_binding *binding,
    const struct aws_mqtt5_packet_disconnect_view *disconnect,
    int error_code) {
    if (!binding->on_disconnection) {
        return;
    }

    struct on_disconnection_user_data *disconnection_ud =
        s_on_disconnection_user_data_new(binding->allocator, disconnect, error_code);
    if (disconnection_ud == NULL) {
        return;
    }

    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_disconnection, disconnection_ud));
}

static void s_lifecycle_event_callback(const struct aws_mqtt5_client_lifecycle_event *event) {
    struct aws_mqtt5_client_binding *binding = event->user_data;

    switch (event->event_type) {
        case AWS_MQTT5_CLET_STOPPED:
            s_on_stopped(binding);
            break;

        case AWS_MQTT5_CLET_ATTEMPTING_CONNECT:
            s_on_attempting_connect(binding);
            break;

        case AWS_MQTT5_CLET_CONNECTION_SUCCESS:
            s_on_connection_success(binding, event->connack_data);
            break;

        case AWS_MQTT5_CLET_CONNECTION_FAILURE:
            s_on_connection_failure(binding, event->connack_data, event->error_code);
            break;

        case AWS_MQTT5_CLET_DISCONNECTION:
            s_on_disconnection(binding, event->disconnect_data, event->error_code);
            break;

        default:
            break;
    }
}

typedef void(napi_threadsafe_function_type)(napi_env env, napi_value function, void *context, void *user_data);

static void s_on_stopped_call(napi_env env, napi_value function, void *context, void *user_data) {
    (void)user_data;

    struct aws_mqtt5_client_binding *binding = context;

    if (env) {
        napi_value params[1];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_mqtt5_client_weak_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            return;
        }

        AWS_NAPI_ENSURE(
            env, aws_napi_dispatch_threadsafe_function(env, binding->on_stopped, NULL, function, num_params, params));
    }
}

static void s_on_attempting_connect_call(napi_env env, napi_value function, void *context, void *user_data) {
    (void)user_data;

    struct aws_mqtt5_client_binding *binding = context;

    if (env) {
        napi_value params[1];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_mqtt5_client_weak_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            return;
        }

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(
                env, binding->on_attempting_connect, NULL, function, num_params, params));
    }
}

static int s_attach_object_property_user_properties(
    napi_value napi_packet,
    napi_env env,
    size_t user_property_count,
    const struct aws_mqtt5_user_property *user_properties) {

    napi_value user_property_array = NULL;
    AWS_NAPI_CALL(env, napi_create_array_with_length(env, user_property_count, &user_property_array), {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    });

    for (size_t i = 0; i < user_property_count; ++i) {
        const struct aws_mqtt5_user_property *property = &user_properties[i];

        napi_value user_property_value = NULL;
        AWS_NAPI_CALL(
            env, napi_create_object(env, &user_property_value), { return aws_raise_error(AWS_ERROR_UNKNOWN); });

        if (aws_napi_attach_object_property_string(user_property_value, env, "name", property->name) ||
            aws_napi_attach_object_property_string(user_property_value, env, "value", property->value)) {
            return aws_raise_error(AWS_ERROR_UNKNOWN);
        }

        AWS_NAPI_CALL(env, napi_set_element(env, user_property_array, (uint32_t)i, user_property_value), {
            return aws_raise_error(AWS_ERROR_UNKNOWN);
        });
    }

    AWS_NAPI_CALL(env, napi_set_named_property(env, napi_packet, "userProperties", user_property_array), {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    });

    return AWS_OP_SUCCESS;
}

static int s_create_napi_connack_packet(
    napi_env env,
    const struct on_connection_result_user_data *connection_result_ud,
    napi_value *packet_out) {

    if (!connection_result_ud->is_connack_valid) {
        AWS_NAPI_CALL(env, napi_get_null(env, packet_out), { return aws_raise_error(AWS_ERROR_UNKNOWN); });
        return AWS_OP_SUCCESS;
    }

    napi_value packet = NULL;
    AWS_NAPI_CALL(env, napi_create_object(env, &packet), { return aws_raise_error(AWS_ERROR_UNKNOWN); });

    const struct aws_mqtt5_packet_connack_view *connack_view = &connection_result_ud->connack_storage.storage_view;

    if (aws_napi_attach_object_property_boolean(packet, env, "sessionPresent", connack_view->session_present)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_u32(packet, env, "reasonCode", (uint32_t)connack_view->reason_code)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_u32(
            packet, env, "sessionExpiryInterval", connack_view->session_expiry_interval)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_u16(packet, env, "receiveMaximum", connack_view->receive_maximum)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (connack_view->maximum_qos != NULL) {
        uint32_t maximum_qos = *connack_view->maximum_qos;
        if (aws_napi_attach_object_property_u32(packet, env, "maximumQos", maximum_qos)) {
            return aws_raise_error(AWS_ERROR_UNKNOWN);
        }
    }

    if (aws_napi_attach_object_property_optional_boolean(
            packet, env, "retainAvailable", connack_view->retain_available)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_u32(
            packet, env, "maximumPacketSize", connack_view->maximum_packet_size)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_string(
            packet, env, "assignedClientIdentifier", connack_view->assigned_client_identifier)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_u16(
            packet, env, "topicAliasMaximum", connack_view->topic_alias_maximum)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_string(packet, env, "reasonString", connack_view->reason_string)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (s_attach_object_property_user_properties(
            packet, env, connack_view->user_property_count, connack_view->user_properties)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_boolean(
            packet, env, "wildcardSubscriptionsAvailable", connack_view->wildcard_subscriptions_available)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_boolean(
            packet, env, "subscriptionIdentifiersAvailable", connack_view->subscription_identifiers_available)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_boolean(
            packet, env, "sharedSubscriptionsAvailable", connack_view->shared_subscriptions_available)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_u16(packet, env, "serverKeepAlive", connack_view->server_keep_alive)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_string(
            packet, env, "responseInformation", connack_view->response_information)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_string(
            packet, env, "serverReference", connack_view->server_reference)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    *packet_out = packet;

    return AWS_OP_SUCCESS;
}

static void s_on_connection_success_call(napi_env env, napi_value function, void *context, void *user_data) {
    struct aws_mqtt5_client_binding *binding = context;
    struct on_connection_result_user_data *connection_result_ud = user_data;

    if (env) {
        napi_value params[2];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_mqtt5_client_weak_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            goto done;
        }

        if (s_create_napi_connack_packet(env, connection_result_ud, &params[1])) {
            goto done;
        }

        if (params[1] == NULL) {
            goto done;
        }

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(
                env, binding->on_connection_success, NULL, function, num_params, params));
    }

done:

    s_on_connection_result_user_data_destroy(connection_result_ud);
}

static void s_on_connection_failure_call(napi_env env, napi_value function, void *context, void *user_data) {
    struct aws_mqtt5_client_binding *binding = context;
    struct on_connection_result_user_data *connection_result_ud = user_data;

    if (env) {
        napi_value params[3];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_mqtt5_client_weak_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            goto done;
        }

        AWS_NAPI_CALL(env, napi_create_uint32(env, connection_result_ud->error_code, &params[1]), { goto done; });

        if (s_create_napi_connack_packet(env, connection_result_ud, &params[2])) {
            goto done;
        }

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(
                env, binding->on_connection_failure, NULL, function, num_params, params));
    }

done:

    s_on_connection_result_user_data_destroy(connection_result_ud);
}

static int s_create_napi_disconnect_packet(
    napi_env env,
    const struct on_disconnection_user_data *disconnection_ud,
    napi_value *packet_out) {

    if (!disconnection_ud->is_disconnect_valid) {
        AWS_NAPI_CALL(env, napi_get_null(env, packet_out), { return aws_raise_error(AWS_ERROR_UNKNOWN); });
        return AWS_OP_SUCCESS;
    }

    napi_value packet = NULL;
    AWS_NAPI_CALL(env, napi_create_object(env, &packet), { return aws_raise_error(AWS_ERROR_UNKNOWN); });

    const struct aws_mqtt5_packet_disconnect_view *disconnect_view = &disconnection_ud->disconnect_storage.storage_view;

    if (aws_napi_attach_object_property_u32(packet, env, "reasonCode", disconnect_view->reason_code)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_u32(
            packet, env, "sessionExpiryIntervalSeconds", disconnect_view->session_expiry_interval_seconds)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (aws_napi_attach_object_property_optional_string(packet, env, "reasonString", disconnect_view->reason_string)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    if (s_attach_object_property_user_properties(
            packet, env, disconnect_view->user_property_count, disconnect_view->user_properties)) {
        return aws_raise_error(AWS_ERROR_UNKNOWN);
    }

    *packet_out = packet;

    return AWS_OP_SUCCESS;
}

static void s_on_disconnection_call(napi_env env, napi_value function, void *context, void *user_data) {
    struct aws_mqtt5_client_binding *binding = context;
    struct on_disconnection_user_data *disconnection_ud = user_data;

    if (env) {
        napi_value params[3];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_mqtt5_client_weak_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            goto done;
        }

        AWS_NAPI_CALL(env, napi_create_uint32(env, disconnection_ud->error_code, &params[1]), { goto done; });

        if (s_create_napi_disconnect_packet(env, disconnection_ud, &params[2])) {
            goto done;
        }

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(env, binding->on_disconnection, NULL, function, num_params, params));
    }

done:

    s_on_disconnection_user_data_destroy(disconnection_ud);
}

struct aws_napi_mqtt5_user_property_storage {
    struct aws_array_list user_properties;
    struct aws_byte_buf user_property_storage;
};

static int s_aws_mqtt5_user_properties_initialize_from_js_object(
    struct aws_napi_mqtt5_user_property_storage *user_properties_storage,
    napi_env env,
    napi_value node_user_properties) {

    struct aws_allocator *allocator = aws_napi_get_allocator();

    // len of js array
    uint32_t user_property_count = 0;
    AWS_NAPI_CALL(env, napi_get_array_length(env, node_user_properties, &user_property_count), {
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    });

    // compute storage size
    size_t total_property_length = 0;
    for (uint32_t i = 0; i < user_property_count; ++i) {
        napi_value array_element;
        AWS_NAPI_CALL(env, napi_get_element(env, node_user_properties, i, &array_element), {
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        });

        struct aws_byte_buf name_buf;
        AWS_ZERO_STRUCT(name_buf);
        struct aws_byte_buf value_buf;
        AWS_ZERO_STRUCT(value_buf);

        bool found_user_property =
            aws_napi_get_named_property_as_bytebuf(env, array_element, "name", napi_string, &name_buf) &&
            aws_napi_get_named_property_as_bytebuf(env, array_element, "value", napi_string, &value_buf);

        total_property_length += name_buf.len + value_buf.len;

        aws_byte_buf_clean_up(&name_buf);
        aws_byte_buf_clean_up(&value_buf);

        if (!found_user_property) {
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        }
    }

    // allocate
    if (aws_array_list_init_dynamic(
            &user_properties_storage->user_properties,
            allocator,
            user_property_count,
            sizeof(struct aws_mqtt5_user_property))) {
        return AWS_OP_ERR;
    }

    if (aws_byte_buf_init(&user_properties_storage->user_property_storage, allocator, total_property_length)) {
        return AWS_OP_ERR;
    }

    // for each property
    for (uint32_t i = 0; i < user_property_count; ++i) {
        napi_value array_element;
        AWS_NAPI_CALL(env, napi_get_element(env, node_user_properties, i, &array_element), {
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        });

        struct aws_byte_buf name_buf;
        AWS_ZERO_STRUCT(name_buf);
        struct aws_byte_buf value_buf;
        AWS_ZERO_STRUCT(value_buf);

        aws_napi_get_named_property_as_bytebuf(env, array_element, "name", napi_string, &name_buf);
        aws_napi_get_named_property_as_bytebuf(env, array_element, "value", napi_string, &value_buf);

        struct aws_mqtt5_user_property user_property;
        AWS_ZERO_STRUCT(user_property);

        user_property.name = aws_byte_cursor_from_buf(&name_buf);
        user_property.value = aws_byte_cursor_from_buf(&value_buf);

        bool success =
            aws_byte_buf_append_and_update(&user_properties_storage->user_property_storage, &user_property.name) ==
                AWS_OP_SUCCESS &&
            aws_byte_buf_append_and_update(&user_properties_storage->user_property_storage, &user_property.value) ==
                AWS_OP_SUCCESS;

        aws_byte_buf_clean_up(&name_buf);
        aws_byte_buf_clean_up(&value_buf);

        if (!success) {
            return AWS_OP_ERR;
        }

        aws_array_list_push_back(&user_properties_storage->user_properties, &user_property);
    }

    return AWS_OP_SUCCESS;
}

static void s_aws_mqtt5_user_properties_clean_up(struct aws_napi_mqtt5_user_property_storage *user_properties_storage) {
    aws_array_list_clean_up(&user_properties_storage->user_properties);
    aws_byte_buf_clean_up(&user_properties_storage->user_property_storage);
}

struct aws_napi_mqtt5_publish_storage {
    struct aws_byte_buf topic;
    struct aws_byte_buf payload;

    enum aws_mqtt5_payload_format_indicator payload_format;
    uint32_t message_expiry_interval_seconds;

    struct aws_byte_buf response_topic;
    struct aws_byte_cursor response_topic_cursor;

    struct aws_byte_buf correlation_data;
    struct aws_byte_cursor correlation_data_cursor;

    struct aws_byte_buf content_type;
    struct aws_byte_cursor content_type_cursor;

    struct aws_napi_mqtt5_user_property_storage user_properties;
};

static void s_aws_napi_mqtt5_publish_storage_clean_up(struct aws_napi_mqtt5_publish_storage *storage) {
    aws_byte_buf_clean_up(&storage->topic);
    aws_byte_buf_clean_up(&storage->payload);
    aws_byte_buf_clean_up(&storage->response_topic);
    aws_byte_buf_clean_up(&storage->correlation_data);
    aws_byte_buf_clean_up(&storage->content_type);

    s_aws_mqtt5_user_properties_clean_up(&storage->user_properties);
}

static int s_init_publish_options_from_napi(
    napi_env env,
    napi_value node_publish_config,
    struct aws_mqtt5_packet_publish_view *publish_options,
    struct aws_napi_mqtt5_publish_storage *publish_storage) {

    if (!aws_napi_get_named_property_as_bytebuf(
            env, node_publish_config, "topic", napi_string, &publish_storage->topic)) {
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }
    publish_options->topic = aws_byte_cursor_from_buf(&publish_storage->topic);

    if (!aws_napi_get_named_property_as_bytebuf(
            env, node_publish_config, "payload", napi_undefined, &publish_storage->payload)) {
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }
    publish_options->payload = aws_byte_cursor_from_buf(&publish_storage->payload);

    uint32_t qos = 0;
    if (!aws_napi_get_named_property_as_uint32(env, node_publish_config, "qos", &qos)) {
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }
    publish_options->qos = qos;

    aws_napi_get_named_property_as_boolean(env, node_publish_config, "retain", &publish_options->retain);

    uint32_t payload_format = 0;
    if (aws_napi_get_named_property_as_uint32(env, node_publish_config, "payloadFormat", &payload_format)) {
        publish_storage->payload_format = payload_format;
        publish_options->payload_format = &publish_storage->payload_format;
    }

    if (aws_napi_get_named_property_as_uint32(
            env,
            node_publish_config,
            "messageExpiryIntervalSeconds",
            &publish_storage->message_expiry_interval_seconds)) {
        publish_options->message_expiry_interval_seconds = &publish_storage->message_expiry_interval_seconds;
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_publish_config, "responseTopic", napi_string, &publish_storage->response_topic)) {
        publish_storage->response_topic_cursor = aws_byte_cursor_from_buf(&publish_storage->response_topic);
        publish_options->response_topic = &publish_storage->response_topic_cursor;
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_publish_config, "correlationData", napi_undefined, &publish_storage->correlation_data)) {
        publish_storage->correlation_data_cursor = aws_byte_cursor_from_buf(&publish_storage->correlation_data);
        publish_options->correlation_data = &publish_storage->correlation_data_cursor;
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_publish_config, "contentType", napi_string, &publish_storage->content_type)) {
        publish_storage->content_type_cursor = aws_byte_cursor_from_buf(&publish_storage->content_type);
        publish_options->content_type = &publish_storage->content_type_cursor;
    }

    napi_value napi_user_properties = NULL;
    if (aws_napi_get_named_property(env, node_publish_config, "userProperties", napi_object, &napi_user_properties)) {
        if (!aws_napi_is_null_or_undefined(env, napi_user_properties)) {
            if (s_aws_mqtt5_user_properties_initialize_from_js_object(
                    &publish_storage->user_properties, env, napi_user_properties)) {
                return AWS_OP_ERR;
            }

            publish_options->user_property_count =
                aws_array_list_length(&publish_storage->user_properties.user_properties);
            publish_options->user_properties = publish_storage->user_properties.user_properties.data;
        }
    }

    return AWS_OP_SUCCESS;
}

struct aws_napi_mqtt5_connect_storage {
    struct aws_byte_buf client_id;
    struct aws_byte_cursor client_id_cursor;

    struct aws_byte_buf username;
    struct aws_byte_cursor username_cursor;

    struct aws_byte_buf password;
    struct aws_byte_cursor password_cursor;

    uint32_t session_expiry_interval_seconds;
    uint8_t request_response_information;
    uint8_t request_problem_information;
    uint16_t receive_maximum;
    uint32_t maximum_packet_size_bytes;
    uint32_t will_delay_interval_seconds;

    struct aws_napi_mqtt5_publish_storage will_storage;

    struct aws_napi_mqtt5_user_property_storage user_properties;
};

static void s_aws_napi_mqtt5_connect_storage_clean_up(struct aws_napi_mqtt5_connect_storage *storage) {
    aws_byte_buf_clean_up(&storage->client_id);
    aws_byte_buf_clean_up(&storage->username);
    aws_byte_buf_clean_up(&storage->password);

    s_aws_napi_mqtt5_publish_storage_clean_up(&storage->will_storage);

    s_aws_mqtt5_user_properties_clean_up(&storage->user_properties);
}

static int s_init_connect_options_from_napi(
    napi_env env,
    napi_value node_connect_config,
    struct aws_mqtt5_packet_connect_view *connect_options,
    struct aws_mqtt5_packet_publish_view *will_options,
    struct aws_napi_mqtt5_connect_storage *connect_storage) {

    if (!aws_napi_get_named_property_as_uint16(
            env, node_connect_config, "keepAliveIntervalSeconds", &connect_options->keep_alive_interval_seconds)) {
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_connect_config, "clientId", napi_string, &connect_storage->client_id)) {
        connect_options->client_id = aws_byte_cursor_from_buf(&connect_storage->client_id);
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_connect_config, "username", napi_string, &connect_storage->username)) {
        connect_storage->username_cursor = aws_byte_cursor_from_buf(&connect_storage->username);
        connect_options->username = &connect_storage->username_cursor;
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_connect_config, "password", napi_undefined, &connect_storage->password)) {
        connect_storage->password_cursor = aws_byte_cursor_from_buf(&connect_storage->password);
        connect_options->password = &connect_storage->password_cursor;
    }

    if (aws_napi_get_named_property_as_uint32(
            env,
            node_connect_config,
            "sessionExpiryIntervalSeconds",
            &connect_storage->session_expiry_interval_seconds)) {
        connect_options->session_expiry_interval_seconds = &connect_storage->session_expiry_interval_seconds;
    }

    if (aws_napi_get_named_property_boolean_as_u8(
            env, node_connect_config, "requestResponseInformation", &connect_storage->request_response_information)) {
        connect_options->request_response_information = &connect_storage->request_response_information;
    }

    if (aws_napi_get_named_property_boolean_as_u8(
            env, node_connect_config, "requestProblemInformation", &connect_storage->request_problem_information)) {
        connect_options->request_problem_information = &connect_storage->request_problem_information;
    }

    if (aws_napi_get_named_property_as_uint16(
            env, node_connect_config, "receiveMaximum", &connect_storage->receive_maximum)) {
        connect_options->receive_maximum = &connect_storage->receive_maximum;
    }

    if (aws_napi_get_named_property_as_uint32(
            env, node_connect_config, "maximumPacketSizeBytes", &connect_storage->maximum_packet_size_bytes)) {
        connect_options->maximum_packet_size_bytes = &connect_storage->maximum_packet_size_bytes;
    }

    if (aws_napi_get_named_property_as_uint32(
            env, node_connect_config, "willDelayIntervalSeconds", &connect_storage->will_delay_interval_seconds)) {
        connect_options->will_delay_interval_seconds = &connect_storage->will_delay_interval_seconds;
    }

    napi_value napi_will = NULL;
    if (aws_napi_get_named_property(env, node_connect_config, "will", napi_object, &napi_will)) {
        if (!aws_napi_is_null_or_undefined(env, napi_will)) {
            if (s_init_publish_options_from_napi(env, napi_will, will_options, &connect_storage->will_storage)) {
                return AWS_OP_ERR;
            }

            connect_options->will = will_options;
        }
    }

    napi_value napi_user_properties = NULL;
    if (aws_napi_get_named_property(env, node_connect_config, "userProperties", napi_object, &napi_user_properties)) {
        if (!aws_napi_is_null_or_undefined(env, napi_user_properties)) {
            if (s_aws_mqtt5_user_properties_initialize_from_js_object(
                    &connect_storage->user_properties, env, napi_user_properties)) {
                return AWS_OP_ERR;
            }

            connect_options->user_property_count =
                aws_array_list_length(&connect_storage->user_properties.user_properties);
            connect_options->user_properties = connect_storage->user_properties.user_properties.data;
        }
    }

    return AWS_OP_SUCCESS;
}

struct aws_napi_mqtt5_client_creation_storage {
    struct aws_byte_buf host_name;

    struct aws_napi_mqtt5_connect_storage connect_storage;
};

static void s_aws_napi_mqtt5_client_creation_storage_clean_up(struct aws_napi_mqtt5_client_creation_storage *storage) {
    aws_byte_buf_clean_up(&storage->host_name);

    s_aws_napi_mqtt5_connect_storage_clean_up(&storage->connect_storage);
}

static int s_init_client_configuration_from_js_client_configuration(
    napi_env env,
    napi_value node_client_config,
    struct aws_mqtt5_client_options *client_options,
    struct aws_mqtt5_packet_connect_view *connect_options,
    struct aws_mqtt5_packet_publish_view *will_options,
    struct aws_napi_mqtt5_client_creation_storage *options_storage) {

    (void)will_options;
    (void)connect_options;

    /* required config parameters */
    if (!aws_napi_get_named_property_as_bytebuf(
            env, node_client_config, "hostName", napi_string, &options_storage->host_name)) {
        return AWS_OP_ERR;
    }

    client_options->host_name = aws_byte_cursor_from_buf(&options_storage->host_name);

    if (!aws_napi_get_named_property_as_uint16(env, node_client_config, "port", &client_options->port)) {
        return AWS_OP_ERR;
    }

    /* optional config parameters */
    uint32_t session_behavior = 0;
    if (aws_napi_get_named_property_as_uint32(
            env, node_client_config, "sessionBehavior", (uint32_t *)&session_behavior)) {
        client_options->session_behavior = (enum aws_mqtt5_client_session_behavior_type)session_behavior;
    }

    uint32_t extended_validation_and_flow_control_behavior = 0;
    if (aws_napi_get_named_property_as_uint32(
            env,
            node_client_config,
            "extendedValidationAndFlowControlOptions",
            (uint32_t *)&extended_validation_and_flow_control_behavior)) {
        client_options->extended_validation_and_flow_control_options =
            (enum aws_mqtt5_extended_validation_and_flow_control_options)extended_validation_and_flow_control_behavior;
    }

    uint32_t offline_queue_behavior = 0;
    if (aws_napi_get_named_property_as_uint32(
            env, node_client_config, "offlineQueueBehavior", (uint32_t *)&offline_queue_behavior)) {
        client_options->offline_queue_behavior =
            (enum aws_mqtt5_client_operation_queue_behavior_type)offline_queue_behavior;
    }

    uint32_t retry_jitter_mode = 0;
    if (aws_napi_get_named_property_as_uint32(
            env, node_client_config, "retryJitterMode", (uint32_t *)&retry_jitter_mode)) {
        client_options->retry_jitter_mode = (enum aws_mqtt5_client_session_behavior_type)retry_jitter_mode;
    }

    aws_napi_get_named_property_as_uint64(
        env, node_client_config, "minReconnectDelayMs", &client_options->min_reconnect_delay_ms);

    aws_napi_get_named_property_as_uint64(
        env, node_client_config, "maxReconnectDelayMs", &client_options->max_reconnect_delay_ms);

    aws_napi_get_named_property_as_uint64(
        env,
        node_client_config,
        "minConnectedTimeToResetReconnectDelayMs",
        &client_options->min_connected_time_to_reset_reconnect_delay_ms);

    aws_napi_get_named_property_as_uint32(env, node_client_config, "pingTimeoutMs", &client_options->ping_timeout_ms);

    aws_napi_get_named_property_as_uint32(
        env, node_client_config, "connackTimeoutMs", &client_options->connack_timeout_ms);

    aws_napi_get_named_property_as_uint32(
        env, node_client_config, "operationTimeoutSeconds", &client_options->operation_timeout_seconds);

    napi_value napi_value_connect = NULL;
    if (aws_napi_get_named_property(env, node_client_config, "connectProperties", napi_object, &napi_value_connect)) {
        if (s_init_connect_options_from_napi(
                env, napi_value_connect, connect_options, will_options, &options_storage->connect_storage)) {
            return AWS_OP_ERR;
        }
    }

    return AWS_OP_SUCCESS;
}

static int s_init_binding_threadsafe_function(
    struct aws_mqtt5_client_binding *binding,
    napi_env env,
    napi_value node_lifecycle_event_handlers,
    const char *function_name,
    const char *threadsafe_name,
    napi_threadsafe_function_type threadsafe_function,
    napi_threadsafe_function *function_out) {

    napi_value node_function = NULL;
    if (!aws_napi_get_named_property(
            env, node_lifecycle_event_handlers, function_name, napi_function, &node_function)) {
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    if (aws_napi_is_null_or_undefined(env, node_function)) {
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    AWS_NAPI_CALL(
        env,
        aws_napi_create_threadsafe_function(
            env, node_function, threadsafe_name, threadsafe_function, binding, function_out),
        { return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT); });

    return AWS_OP_SUCCESS;
}

static int s_init_lifecycle_event_threadsafe_functions(
    struct aws_mqtt5_client_binding *binding,
    napi_env env,
    napi_value node_lifecycle_event_handlers) {

    if (s_init_binding_threadsafe_function(
            binding,
            env,
            node_lifecycle_event_handlers,
            "onStopped",
            "aws_mqtt5_client_on_stopped",
            s_on_stopped_call,
            &binding->on_stopped)) {
        return AWS_OP_ERR;
    }

    if (s_init_binding_threadsafe_function(
            binding,
            env,
            node_lifecycle_event_handlers,
            "onAttemptingConnect",
            "aws_mqtt5_client_on_attempting_connect",
            s_on_attempting_connect_call,
            &binding->on_attempting_connect)) {
        return AWS_OP_ERR;
    }

    if (s_init_binding_threadsafe_function(
            binding,
            env,
            node_lifecycle_event_handlers,
            "onConnectionSuccess",
            "aws_mqtt5_client_on_connection_success",
            s_on_connection_success_call,
            &binding->on_connection_success)) {
        return AWS_OP_ERR;
    }

    if (s_init_binding_threadsafe_function(
            binding,
            env,
            node_lifecycle_event_handlers,
            "onConnectionFailure",
            "aws_mqtt5_client_on_connection_failure",
            s_on_connection_failure_call,
            &binding->on_connection_failure)) {
        return AWS_OP_ERR;
    }

    if (s_init_binding_threadsafe_function(
            binding,
            env,
            node_lifecycle_event_handlers,
            "onDisconnection",
            "aws_mqtt5_client_on_disconnection",
            s_on_disconnection_call,
            &binding->on_disconnection)) {
        return AWS_OP_ERR;
    }

    return AWS_OP_SUCCESS;
}

static const uint32_t s_default_mqtt_keep_alive_interval_seconds = 1200;
static const uint32_t s_default_socket_connect_timeout_ms = 10000;
static const uint64_t s_default_min_reconnect_delay_ms = 1000;
static const uint64_t s_default_max_reconnect_delay_ms = 120000;
static const uint64_t s_default_min_connected_time_to_reset_reconnect_delay_ms = 30000;
static const uint32_t s_default_ping_timeout_ms = 30000;
static const uint32_t s_default_connack_timeout_ms = 20000;
static const uint32_t s_default_operation_timeout_seconds = 60000;

static void s_init_default_mqtt5_client_options(
    struct aws_mqtt5_client_options *client_options,
    struct aws_mqtt5_packet_connect_view *connect_options) {

    connect_options->keep_alive_interval_seconds = s_default_mqtt_keep_alive_interval_seconds;

    client_options->session_behavior = AWS_MQTT5_CSBT_CLEAN;
    client_options->outbound_topic_aliasing_behavior = AWS_MQTT5_COTABT_DUMB;
    client_options->extended_validation_and_flow_control_options = AWS_MQTT5_EVAFCO_NONE;
    client_options->offline_queue_behavior = AWS_MQTT5_COQBT_FAIL_NON_QOS1_PUBLISH_ON_DISCONNECT;
    client_options->retry_jitter_mode = AWS_EXPONENTIAL_BACKOFF_JITTER_DEFAULT;
    client_options->min_reconnect_delay_ms = s_default_min_reconnect_delay_ms;
    client_options->max_reconnect_delay_ms = s_default_max_reconnect_delay_ms;
    client_options->min_connected_time_to_reset_reconnect_delay_ms =
        s_default_min_connected_time_to_reset_reconnect_delay_ms;
    client_options->ping_timeout_ms = s_default_ping_timeout_ms;
    client_options->connack_timeout_ms = s_default_connack_timeout_ms;
    client_options->operation_timeout_seconds = s_default_operation_timeout_seconds;

    client_options->connect_options = connect_options;
}

napi_value aws_napi_mqtt5_client_new(napi_env env, napi_callback_info info) {

    napi_value node_args[7];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "mqtt5_client_new - Failed to retrieve arguments");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "mqtt5_client_new - needs exactly 7 arguments");
        return NULL;
    }

    int result = AWS_OP_ERR;
    napi_value napi_client_wrapper = NULL;
    napi_value node_external = NULL;
    struct aws_allocator *allocator = aws_napi_get_allocator();

    struct aws_mqtt5_client_binding *binding = aws_mem_calloc(allocator, 1, sizeof(struct aws_mqtt5_client_binding));
    binding->allocator = allocator;

    AWS_NAPI_CALL(env, napi_create_external(env, binding, s_mqtt5_client_finalize, NULL, &node_external), {
        napi_throw_error(env, NULL, "mqtt5_client_new - Failed to create n-api external");
        goto cleanup;
    });

    struct aws_mqtt5_client_options client_options;
    AWS_ZERO_STRUCT(client_options);

    struct aws_mqtt5_packet_connect_view connect_options;
    AWS_ZERO_STRUCT(connect_options);

    struct aws_mqtt5_packet_publish_view will_options;
    AWS_ZERO_STRUCT(will_options);

    struct aws_napi_mqtt5_client_creation_storage options_storage;
    AWS_ZERO_STRUCT(options_storage);

    struct aws_socket_options default_socket_options = {
        .type = AWS_SOCKET_STREAM,
        .connect_timeout_ms = s_default_socket_connect_timeout_ms,
        .keep_alive_timeout_sec = 0,
        .keepalive = false,
        .keep_alive_interval_sec = 0,
    };

    s_init_default_mqtt5_client_options(&client_options, &connect_options);

    napi_value node_client = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_client)) {
        napi_throw_error(env, NULL, "mqtt5_client_new - Required client parameter is null");
        goto cleanup;
    }

    AWS_NAPI_CALL(env, napi_create_reference(env, node_client, 0, &binding->node_mqtt5_client_weak_ref), {
        napi_throw_error(env, NULL, "mqtt5_client_new - Failed to create weak reference to node mqtt5 client");
        goto cleanup;
    });

    napi_value node_client_config = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_client_config)) {
        napi_throw_error(env, NULL, "mqtt5_client_new - Required configuration parameter is null");
        goto cleanup;
    }

    if (s_init_client_configuration_from_js_client_configuration(
            env, node_client_config, &client_options, &connect_options, &will_options, &options_storage)) {
        napi_throw_error(
            env,
            NULL,
            "mqtt5_client_new - failed to initialize native client configuration from js client configuration");
        goto cleanup;
    }

    napi_value node_lifecycle_event_handlers = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_lifecycle_event_handlers)) {
        napi_throw_error(env, NULL, "mqtt5_client_new - required lifecycle event handler set is null");
        goto cleanup;
    }

    if (s_init_lifecycle_event_threadsafe_functions(binding, env, node_lifecycle_event_handlers)) {
        napi_throw_error(env, NULL, "mqtt5_client_new - failed to initialize lifecycle event threadsafe handlers");
        goto cleanup;
    }

    napi_value node_client_bootstrap = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_client_bootstrap)) {
        struct client_bootstrap_binding *client_bootstrap_binding = NULL;
        napi_get_value_external(env, node_client_bootstrap, (void **)&client_bootstrap_binding);

        client_options.bootstrap = aws_napi_get_client_bootstrap(client_bootstrap_binding);
    }

    if (client_options.bootstrap == NULL) {
        client_options.bootstrap = aws_napi_get_default_client_bootstrap();
    }

    napi_value node_socket_options = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_socket_options)) {
        AWS_NAPI_CALL(env, napi_get_value_external(env, node_socket_options, (void **)&client_options.socket_options), {
            napi_throw_error(env, NULL, "mqtt5_client_new - Unable to extract socket_options from external");
            goto cleanup;
        });
    } else {
        client_options.socket_options = &default_socket_options;
    }

    napi_value node_tls = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_tls)) {
        struct aws_tls_ctx *tls_ctx;
        AWS_NAPI_CALL(env, napi_get_value_external(env, node_tls, (void **)&tls_ctx), {
            napi_throw_error(env, NULL, "mqtt5_client_new - Failed to extract tls_ctx from external");
            goto cleanup;
        });

        aws_tls_connection_options_init_from_ctx(&binding->tls_connection_options, tls_ctx);

        client_options.tls_options = &binding->tls_connection_options;
    }

    napi_value node_proxy_options = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_proxy_options)) {
        struct http_proxy_options_binding *proxy_binding = NULL;
        AWS_NAPI_CALL(env, napi_get_value_external(env, node_proxy_options, (void **)&proxy_binding), {
            napi_throw_type_error(env, NULL, "mqtt5_client_new - failed to extract http proxy options from external");
            goto cleanup;
        });
        /* proxy_options are copied internally, no need to go nuts on copies */
        client_options.http_proxy_options = aws_napi_get_http_proxy_options(proxy_binding);
    }

    client_options.publish_received_handler = s_on_publish_received;
    client_options.publish_received_handler_user_data = binding;

    client_options.lifecycle_event_handler = s_lifecycle_event_callback;
    client_options.lifecycle_event_handler_user_data = binding;

    client_options.client_termination_handler = s_mqtt5_client_on_terminate;
    client_options.client_termination_handler_user_data = binding;

    binding->client = aws_mqtt5_client_new(allocator, &client_options);
    if (binding->client == NULL) {
        aws_napi_throw_last_error_with_context(env, "mqtt5_client_new - failed to create client");
        goto cleanup;
    }

    result = AWS_OP_SUCCESS;
    napi_client_wrapper = node_external;

cleanup:

    s_aws_napi_mqtt5_client_creation_storage_clean_up(&options_storage);

    if (result) {
        s_mqtt5_client_finalize(env, binding, NULL);
    }

    return napi_client_wrapper;
}

napi_value aws_napi_mqtt5_client_start(napi_env env, napi_callback_info info) {

    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "aws_napi_mqtt5_client_start - Failed to extract parameter array");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_mqtt5_client_start - needs exactly 1 argument");
        return NULL;
    }

    struct aws_mqtt5_client_binding *binding = NULL;
    napi_value node_binding = *arg++;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_binding, (void **)&binding), {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt5_client_start - Failed to extract client binding from first argument");
        return NULL;
    });

    if (binding == NULL) {
        napi_throw_error(env, NULL, "aws_napi_mqtt5_client_start - binding was null");
        return NULL;
    }

    if (binding->client == NULL) {
        napi_throw_error(env, NULL, "aws_napi_mqtt5_client_start - client was null");
        return NULL;
    }

    if (aws_mqtt5_client_start(binding->client)) {
        aws_napi_throw_last_error_with_context(
            env, "aws_napi_mqtt5_client_start - Failure invoking aws_mqtt5_client_start");
        return NULL;
    }

    return NULL;
}

struct aws_napi_mqtt5_packet_disconnect_storage {
    uint32_t session_expiry_interval_seconds;

    struct aws_byte_buf reason_string;
    struct aws_byte_cursor reason_string_cursor;

    struct aws_napi_mqtt5_user_property_storage user_properties;

    struct aws_byte_buf server_reference;
    struct aws_byte_cursor server_reference_cursor;
};

static void s_aws_napi_mqtt5_packet_disconnect_storage_clean_up(
    struct aws_napi_mqtt5_packet_disconnect_storage *storage) {
    aws_byte_buf_clean_up(&storage->reason_string);

    s_aws_mqtt5_user_properties_clean_up(&storage->user_properties);

    aws_byte_buf_clean_up(&storage->server_reference);
}

static int s_aws_napi_mqtt5_packet_disconnect_storage_initialize_from_js_object(
    struct aws_napi_mqtt5_packet_disconnect_storage *disconnect_storage,
    struct aws_mqtt5_packet_disconnect_view *disconnect_packet,
    napi_env env,
    napi_value node_disconnect_packet) {
    uint32_t reason_code = 0;
    if (aws_napi_get_named_property_as_uint32(env, node_disconnect_packet, "reasonCode", (uint32_t *)&reason_code)) {
        disconnect_packet->reason_code = (enum aws_mqtt5_disconnect_reason_code)reason_code;
    }

    if (aws_napi_get_named_property_as_uint32(
            env,
            node_disconnect_packet,
            "sessionExpiryIntervalSeconds",
            &disconnect_storage->session_expiry_interval_seconds)) {
        disconnect_packet->session_expiry_interval_seconds = &disconnect_storage->session_expiry_interval_seconds;
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_disconnect_packet, "reasonString", napi_string, &disconnect_storage->reason_string)) {
        disconnect_storage->reason_string_cursor = aws_byte_cursor_from_buf(&disconnect_storage->reason_string);
        disconnect_packet->reason_string = &disconnect_storage->reason_string_cursor;
    }

    napi_value user_properties;
    if (aws_napi_get_named_property(env, node_disconnect_packet, "userProperties", napi_object, &user_properties)) {
        if (!aws_napi_is_null_or_undefined(env, user_properties)) {
            if (s_aws_mqtt5_user_properties_initialize_from_js_object(
                    &disconnect_storage->user_properties, env, user_properties)) {
                return AWS_OP_ERR;
            }

            disconnect_packet->user_property_count =
                aws_array_list_length(&disconnect_storage->user_properties.user_properties);
            disconnect_packet->user_properties = disconnect_storage->user_properties.user_properties.data;
        }
    }

    /* Intentionally ignore server reference because it's a client error to send it */

    return AWS_OP_SUCCESS;
}

napi_value aws_napi_mqtt5_client_stop(napi_env env, napi_callback_info info) {

    napi_value node_args[2];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "aws_napi_mqtt5_client_stop - Failed to extract parameter array");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_mqtt5_client_stop - needs exactly 2 arguments");
        return NULL;
    }

    struct aws_mqtt5_client_binding *binding = NULL;
    napi_value node_binding = *arg++;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_binding, (void **)&binding), {
        napi_throw_error(
            env, NULL, "aws_napi_mqtt5_client_stop - Failed to extract client binding from first argument");
        return NULL;
    });

    if (binding == NULL) {
        napi_throw_error(env, NULL, "aws_napi_mqtt5_client_stop - binding was null");
        return NULL;
    }

    if (binding->client == NULL) {
        napi_throw_error(env, NULL, "aws_napi_mqtt5_client_stop - client was null");
        return NULL;
    }

    struct aws_napi_mqtt5_packet_disconnect_storage disconnect_storage;
    AWS_ZERO_STRUCT(disconnect_storage);

    struct aws_mqtt5_packet_disconnect_view *disconnect_view_ptr = NULL;
    struct aws_mqtt5_packet_disconnect_view disconnect_view;
    AWS_ZERO_STRUCT(disconnect_view);

    napi_value node_disconnect_packet = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_disconnect_packet)) {
        if (s_aws_napi_mqtt5_packet_disconnect_storage_initialize_from_js_object(
                &disconnect_storage, &disconnect_view, env, node_disconnect_packet)) {
            napi_throw_error(env, NULL, "aws_napi_mqtt5_client_stop - could not initialize disconnect packet");
            goto done;
        }

        disconnect_view_ptr = &disconnect_view;
    }

    if (aws_mqtt5_client_stop(binding->client, disconnect_view_ptr, NULL)) {
        aws_napi_throw_last_error_with_context(
            env, "aws_napi_mqtt5_client_stop - Failure invoking aws_mqtt5_client_stop");
        goto done;
    }

done:

    s_aws_napi_mqtt5_packet_disconnect_storage_clean_up(&disconnect_storage);

    return NULL;
}