/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#include "mqtt5_client.h"
#include "http_connection.h"
#include "http_message.h"
#include "io.h"

#include <aws/http/proxy.h>
#include <aws/io/socket.h>
#include <aws/io/tls_channel_handler.h>
#include <aws/mqtt/v5/mqtt5_client.h>
#include <aws/mqtt/v5/mqtt5_packet_storage.h>
#include <aws/mqtt/v5/mqtt5_types.h>

/* object key names for referencing mqtt5-related properties on napi objects */
static const char *AWS_NAPI_KEY_NAME = "name";
static const char *AWS_NAPI_KEY_VALUE = "value";
static const char *AWS_NAPI_KEY_USER_PROPERTIES = "userProperties";
static const char *AWS_NAPI_KEY_SESSION_PRESENT = "sessionPresent";
static const char *AWS_NAPI_KEY_REASON_CODE = "reasonCode";
static const char *AWS_NAPI_KEY_SESSION_EXPIRY_INTERVAL = "sessionExpiryInterval";
static const char *AWS_NAPI_KEY_RECEIVE_MAXIMUM = "receiveMaximum";
static const char *AWS_NAPI_KEY_MAXIMUM_QOS = "maximumQos";
static const char *AWS_NAPI_KEY_RETAIN_AVAILABLE = "retainAvailable";
static const char *AWS_NAPI_KEY_MAXIMUM_PACKET_SIZE = "maximumPacketSize";
static const char *AWS_NAPI_KEY_ASSIGNED_CLIENT_IDENTIFIER = "assignedClientIdentifier";
static const char *AWS_NAPI_KEY_TOPIC_ALIAS_MAXIMUM = "topicAliasMaximum";
static const char *AWS_NAPI_KEY_REASON_STRING = "reasonString";
static const char *AWS_NAPI_KEY_WILDCARD_SUBSCRIPTIONS_AVAILABLE = "wildcardSubscriptionsAvailable";
static const char *AWS_NAPI_KEY_SUBSCRIPTION_IDENTIFIERS_AVAILABLE = "subscriptionIdentifiersAvailable";
static const char *AWS_NAPI_KEY_SHARED_SUBSCRIPTIONS_AVAILABLE = "sharedSubscriptionsAvailable";
static const char *AWS_NAPI_KEY_SERVER_KEEP_ALIVE = "serverKeepAlive";
static const char *AWS_NAPI_KEY_RESPONSE_INFORMATION = "responseInformation";
static const char *AWS_NAPI_KEY_SERVER_REFERENCE = "serverReference";
static const char *AWS_NAPI_KEY_RECEIVE_MAXIMUM_FROM_SERVER = "receiveMaximumFromServer";
static const char *AWS_NAPI_KEY_MAXIMUM_PACKET_SIZE_TO_SERVER = "maximumPacketSizeToServer";
static const char *AWS_NAPI_KEY_REJOINED_SESSION = "rejoinedSession";
static const char *AWS_NAPI_KEY_CLIENT_ID = "clientId";
static const char *AWS_NAPI_KEY_SESSION_EXPIRY_INTERVAL_SECONDS = "sessionExpiryIntervalSeconds";
static const char *AWS_NAPI_KEY_TOPIC = "topic";
static const char *AWS_NAPI_KEY_PAYLOAD = "payload";
static const char *AWS_NAPI_KEY_QOS = "qos";
static const char *AWS_NAPI_KEY_RETAIN = "retain";
static const char *AWS_NAPI_KEY_PAYLOAD_FORMAT = "payloadFormat";
static const char *AWS_NAPI_KEY_MESSAGE_EXPIRY_INTERVAL_SECONDS = "messageExpiryIntervalSeconds";
static const char *AWS_NAPI_KEY_RESPONSE_TOPIC = "responseTopic";
static const char *AWS_NAPI_KEY_CORRELATION_DATA = "correlationData";
static const char *AWS_NAPI_KEY_CONTENT_TYPE = "contentType";
static const char *AWS_NAPI_KEY_KEEP_ALIVE_INTERVAL_SECONDS = "keepAliveIntervalSeconds";
static const char *AWS_NAPI_KEY_USERNAME = "username";
static const char *AWS_NAPI_KEY_PASSWORD = "password";
static const char *AWS_NAPI_KEY_REQUEST_RESPONSE_INFORMATION = "requestResponseInformation";
static const char *AWS_NAPI_KEY_REQUEST_PROBLEM_INFORMATION = "requestProblemInformation";
static const char *AWS_NAPI_KEY_MAXIMUM_PACKET_SIZE_BYTES = "maximumPacketSizeBytes";
static const char *AWS_NAPI_KEY_WILL_DELAY_INTERVAL_SECONDS = "willDelayIntervalSeconds";
static const char *AWS_NAPI_KEY_WILL = "will";
static const char *AWS_NAPI_KEY_HOST_NAME = "hostName";
static const char *AWS_NAPI_KEY_PORT = "port";
static const char *AWS_NAPI_KEY_SESSION_BEHAVIOR = "sessionBehavior";
static const char *AWS_NAPI_KEY_EXTENDED_VALIDATION_AND_FLOW_CONTROL_OPTIONS =
    "extendedValidationAndFlowControlOptions";
static const char *AWS_NAPI_KEY_OFFLINE_QUEUE_BEHAVIOR = "offlineQueueBehavior";
static const char *AWS_NAPI_KEY_RETRY_JITTER_MODE = "retryJitterMode";
static const char *AWS_NAPI_KEY_MIN_RECONNECT_DELAY_MS = "minReconnectDelayMs";
static const char *AWS_NAPI_KEY_MAX_RECONNECT_DELAY_MS = "maxReconnectDelayMs";
static const char *AWS_NAPI_KEY_MIN_CONNECTED_TIME_TO_RESET_RECONNECT_DELAY_MS =
    "minConnectedTimeToResetReconnectDelayMs";
static const char *AWS_NAPI_KEY_PING_TIMEOUT_MS = "pingTimeoutMs";
static const char *AWS_NAPI_KEY_CONNACK_TIMEOUT_MS = "connackTimeoutMs";
static const char *AWS_NAPI_KEY_OPERATION_TIMEOUT_SECONDS = "operationTimeoutSeconds";
static const char *AWS_NAPI_KEY_CONNECT_PROPERTIES = "connectProperties";
static const char *AWS_NAPI_KEY_WEBSOCKET_HANDSHAKE_TRANSFORM = "websocketHandshakeTransform";
static const char *AWS_NAPI_KEY_ON_STOPPED = "onStopped";
static const char *AWS_NAPI_KEY_ON_ATTEMPTING_CONNECT = "onAttemptingConnect";
static const char *AWS_NAPI_KEY_ON_CONNECTION_SUCCESS = "onConnectionSuccess";
static const char *AWS_NAPI_KEY_ON_CONNECTION_FAILURE = "onConnectionFailure";
static const char *AWS_NAPI_KEY_ON_DISCONNECTION = "onDisconnection";

/*
 * Binding object that outlives the associated napi wrapper object.  When that object finalizes, then it's a signal
 * to this object to destroy the client (and itself, afterwards).
 */
struct aws_mqtt5_client_binding {
    struct aws_allocator *allocator;
    struct aws_mqtt5_client *client;

    struct aws_tls_connection_options tls_connection_options;

    /*
     * we keep a weak ref to the client to avoid making a strong ref cycle between native and node, which would be
     * unbreakable.  It is *critical* that none of the callbacks capture the Mqtt5Client node object as part of the
     * lambda context, otherwise we'd get another strong ref cycle.
     *
     * Instead, all of the lifecycle callbacks map to static functions that take the client as the first parameter,
     * and we only invoke them if we can (temporarily) convert the weak ref to a strong ref beforehand.
     */
    napi_ref node_mqtt5_client_weak_ref;

    napi_threadsafe_function on_stopped;
    napi_threadsafe_function on_attempting_connect;
    napi_threadsafe_function on_connection_success;
    napi_threadsafe_function on_connection_failure;
    napi_threadsafe_function on_disconnection;

    napi_threadsafe_function transform_websocket;
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

/*
 * Invoked when the node mqtt5 client is garbage collected or if fails construction partway through
 */
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
    AWS_CLEAN_THREADSAFE_FUNCTION(transform_websocket);

    if (binding->client != NULL) {
        /* if client is not null, then this is a successfully constructed client which should shutdown normally */
        aws_mqtt5_client_release(binding->client);
        binding->client = NULL;
    } else {
        /*
         * no client, this must be a creation attempt that failed partway through and we should directly clean up the
         * binding
         */
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

    /* queue a callback in node's libuv thread */
    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_stopped, NULL));
}

static void s_on_attempting_connect(struct aws_mqtt5_client_binding *binding) {
    if (!binding->on_attempting_connect) {
        return;
    }

    /* queue a callback in node's libuv thread */
    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_attempting_connect, NULL));
}

/* unions callback data needed for connection succes and failure as a convenience */
struct on_connection_result_user_data {
    struct aws_allocator *allocator;
    struct aws_mqtt5_packet_connack_storage connack_storage;
    bool is_connack_valid;
    int error_code;
    struct aws_mqtt5_negotiated_settings settings;
};

static void s_on_connection_result_user_data_destroy(struct on_connection_result_user_data *connection_result_ud) {
    if (connection_result_ud == NULL) {
        return;
    }

    aws_mqtt5_packet_connack_storage_clean_up(&connection_result_ud->connack_storage);
    aws_mqtt5_negotiated_settings_clean_up(&connection_result_ud->settings);

    aws_mem_release(connection_result_ud->allocator, connection_result_ud);
}

static struct on_connection_result_user_data *s_on_connection_result_user_data_new(
    struct aws_allocator *allocator,
    const struct aws_mqtt5_packet_connack_view *connack,
    const struct aws_mqtt5_negotiated_settings *settings,
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
    }

    if (settings != NULL) {
        if (aws_mqtt5_negotiated_settings_copy(settings, &connection_result_ud->settings)) {
            goto error;
        }
    }

    return connection_result_ud;

error:

    s_on_connection_result_user_data_destroy(connection_result_ud);

    return NULL;
}

static void s_on_connection_success(
    struct aws_mqtt5_client_binding *binding,
    const struct aws_mqtt5_packet_connack_view *connack,
    const struct aws_mqtt5_negotiated_settings *settings) {

    if (!binding->on_connection_success) {
        return;
    }

    struct on_connection_result_user_data *connection_result_ud =
        s_on_connection_result_user_data_new(binding->allocator, connack, settings, AWS_ERROR_SUCCESS);
    if (connection_result_ud == NULL) {
        return;
    }

    /* queue a callback in node's libuv thread */
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
        s_on_connection_result_user_data_new(binding->allocator, connack, NULL, error_code);
    if (connection_result_ud == NULL) {
        return;
    }

    /* queue a callback in node's libuv thread */
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

    /* queue a callback in node's libuv thread */
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
            s_on_connection_success(binding, event->connack_data, event->settings);
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

/* in-node/libuv-thread function to trigger the emission of a STOPPED client lifecycle event */
static void s_on_stopped_call(napi_env env, napi_value function, void *context, void *user_data) {
    (void)user_data;

    struct aws_mqtt5_client_binding *binding = context;

    if (env) {
        napi_value params[1];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        /*
         * If we can't resolve the weak ref to the mqtt5 client, then it's been garbage collected and we should not
         * do anything.
         */
        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_mqtt5_client_weak_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            AWS_LOGF_INFO(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_on_stopped_call - mqtt5_client node wrapper no longer resolvable",
                (void *)binding->client);
            return;
        }

        AWS_NAPI_ENSURE(
            env, aws_napi_dispatch_threadsafe_function(env, binding->on_stopped, NULL, function, num_params, params));
    }
}

/* in-node/libuv-thread function to trigger the emission of an ATTEMPTING_CONNECT client lifecycle event */
static void s_on_attempting_connect_call(napi_env env, napi_value function, void *context, void *user_data) {
    (void)user_data;

    struct aws_mqtt5_client_binding *binding = context;

    if (env) {
        napi_value params[1];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        /*
         * If we can't resolve the weak ref to the mqtt5 client, then it's been garbage collected and we should not
         * do anything.
         */
        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_mqtt5_client_weak_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            AWS_LOGF_INFO(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_on_attempting_connect_call - mqtt5_client node wrapper no longer resolvable",
                (void *)binding->client);
            return;
        }

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(
                env, binding->on_attempting_connect, NULL, function, num_params, params));
    }
}

/* utility function to attach native-specified user properties to a napi object as an array of user property objects */
static int s_attach_object_property_user_properties(
    napi_value napi_packet,
    napi_env env,
    size_t user_property_count,
    const struct aws_mqtt5_user_property *user_properties) {

    if (env == NULL) {
        return aws_raise_error(AWS_CRT_NODEJS_ERROR_THREADSAFE_FUNCTION_NULL_NAPI_ENV);
    }

    napi_value user_property_array = NULL;
    AWS_NAPI_CALL(env, napi_create_array_with_length(env, user_property_count, &user_property_array), {
        return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE);
    });

    for (size_t i = 0; i < user_property_count; ++i) {
        const struct aws_mqtt5_user_property *property = &user_properties[i];

        napi_value user_property_value = NULL;
        AWS_NAPI_CALL(env, napi_create_object(env, &user_property_value), {
            return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE);
        });

        if (aws_napi_attach_object_property_string(user_property_value, env, AWS_NAPI_KEY_NAME, property->name) ||
            aws_napi_attach_object_property_string(user_property_value, env, AWS_NAPI_KEY_VALUE, property->value)) {
            return AWS_OP_ERR;
        }

        AWS_NAPI_CALL(env, napi_set_element(env, user_property_array, (uint32_t)i, user_property_value), {
            return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE);
        });
    }

    AWS_NAPI_CALL(env, napi_set_named_property(env, napi_packet, AWS_NAPI_KEY_USER_PROPERTIES, user_property_array), {
        return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE);
    });

    return AWS_OP_SUCCESS;
}

/* Builds a napi object that represents a CONNACK packet, matching the AwsMqtt5PacketConnack interface */
static int s_create_napi_connack_packet(
    napi_env env,
    const struct on_connection_result_user_data *connection_result_ud,
    napi_value *packet_out) {

    if (env == NULL) {
        return aws_raise_error(AWS_CRT_NODEJS_ERROR_THREADSAFE_FUNCTION_NULL_NAPI_ENV);
    }

    if (!connection_result_ud->is_connack_valid) {
        AWS_NAPI_CALL(
            env, napi_get_null(env, packet_out), { return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE); });
        return AWS_OP_SUCCESS;
    }

    napi_value packet = NULL;
    AWS_NAPI_CALL(
        env, napi_create_object(env, &packet), { return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE); });

    const struct aws_mqtt5_packet_connack_view *connack_view = &connection_result_ud->connack_storage.storage_view;

    if (aws_napi_attach_object_property_boolean(
            packet, env, AWS_NAPI_KEY_SESSION_PRESENT, connack_view->session_present)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_u32(
            packet, env, AWS_NAPI_KEY_REASON_CODE, (uint32_t)connack_view->reason_code)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_u32(
            packet, env, AWS_NAPI_KEY_SESSION_EXPIRY_INTERVAL, connack_view->session_expiry_interval)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_u16(
            packet, env, AWS_NAPI_KEY_RECEIVE_MAXIMUM, connack_view->receive_maximum)) {
        return AWS_OP_ERR;
    }

    if (connack_view->maximum_qos != NULL) {
        uint32_t maximum_qos = *connack_view->maximum_qos;
        if (aws_napi_attach_object_property_u32(packet, env, AWS_NAPI_KEY_MAXIMUM_QOS, maximum_qos)) {
            return AWS_OP_ERR;
        }
    }

    if (aws_napi_attach_object_property_optional_boolean(
            packet, env, AWS_NAPI_KEY_RETAIN_AVAILABLE, connack_view->retain_available)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_u32(
            packet, env, AWS_NAPI_KEY_MAXIMUM_PACKET_SIZE, connack_view->maximum_packet_size)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_string(
            packet, env, AWS_NAPI_KEY_ASSIGNED_CLIENT_IDENTIFIER, connack_view->assigned_client_identifier)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_u16(
            packet, env, AWS_NAPI_KEY_TOPIC_ALIAS_MAXIMUM, connack_view->topic_alias_maximum)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_string(
            packet, env, AWS_NAPI_KEY_REASON_STRING, connack_view->reason_string)) {
        return AWS_OP_ERR;
    }

    if (s_attach_object_property_user_properties(
            packet, env, connack_view->user_property_count, connack_view->user_properties)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_boolean(
            packet,
            env,
            AWS_NAPI_KEY_WILDCARD_SUBSCRIPTIONS_AVAILABLE,
            connack_view->wildcard_subscriptions_available)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_boolean(
            packet,
            env,
            AWS_NAPI_KEY_SUBSCRIPTION_IDENTIFIERS_AVAILABLE,
            connack_view->subscription_identifiers_available)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_boolean(
            packet, env, AWS_NAPI_KEY_SHARED_SUBSCRIPTIONS_AVAILABLE, connack_view->shared_subscriptions_available)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_u16(
            packet, env, AWS_NAPI_KEY_SERVER_KEEP_ALIVE, connack_view->server_keep_alive)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_string(
            packet, env, AWS_NAPI_KEY_RESPONSE_INFORMATION, connack_view->response_information)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_string(
            packet, env, AWS_NAPI_KEY_SERVER_REFERENCE, connack_view->server_reference)) {
        return AWS_OP_ERR;
    }

    *packet_out = packet;

    return AWS_OP_SUCCESS;
}

/* Builds a napi object that represents connection negotiated settings, using the Mqtt5NegotiatedSettings interface */
static int s_create_napi_negotiated_settings(
    napi_env env,
    const struct aws_mqtt5_negotiated_settings *settings,
    napi_value *value_out) {

    if (env == NULL) {
        return aws_raise_error(AWS_CRT_NODEJS_ERROR_THREADSAFE_FUNCTION_NULL_NAPI_ENV);
    }

    napi_value napi_settings = NULL;
    AWS_NAPI_CALL(
        env, napi_create_object(env, &napi_settings), { return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE); });

    uint32_t maximum_qos = settings->maximum_qos;
    if (aws_napi_attach_object_property_u32(napi_settings, env, AWS_NAPI_KEY_MAXIMUM_QOS, maximum_qos)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_u32(
            napi_settings, env, AWS_NAPI_KEY_SESSION_EXPIRY_INTERVAL, settings->session_expiry_interval)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_u32(
            napi_settings,
            env,
            AWS_NAPI_KEY_RECEIVE_MAXIMUM_FROM_SERVER,
            (uint32_t)settings->receive_maximum_from_server)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_u32(
            napi_settings, env, AWS_NAPI_KEY_MAXIMUM_PACKET_SIZE_TO_SERVER, settings->maximum_packet_size_to_server)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_u32(
            napi_settings, env, AWS_NAPI_KEY_SERVER_KEEP_ALIVE, (uint32_t)settings->server_keep_alive)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_boolean(
            napi_settings, env, AWS_NAPI_KEY_RETAIN_AVAILABLE, settings->retain_available)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_boolean(
            napi_settings,
            env,
            AWS_NAPI_KEY_WILDCARD_SUBSCRIPTIONS_AVAILABLE,
            settings->wildcard_subscriptions_available)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_boolean(
            napi_settings,
            env,
            AWS_NAPI_KEY_SUBSCRIPTION_IDENTIFIERS_AVAILABLE,
            settings->subscription_identifiers_available)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_boolean(
            napi_settings,
            env,
            AWS_NAPI_KEY_SHARED_SUBSCRIPTIONS_AVAILABLE,
            settings->shared_subscriptions_available)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_boolean(
            napi_settings, env, AWS_NAPI_KEY_REJOINED_SESSION, settings->rejoined_session)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_string(
            napi_settings, env, AWS_NAPI_KEY_CLIENT_ID, aws_byte_cursor_from_buf(&settings->client_id_storage))) {
        return AWS_OP_ERR;
    }

    *value_out = napi_settings;

    return AWS_OP_SUCCESS;
}

/* in-node/libuv-thread function to trigger the emission of a CONNECTION_SUCCESS client lifecycle event */
static void s_on_connection_success_call(napi_env env, napi_value function, void *context, void *user_data) {
    struct aws_mqtt5_client_binding *binding = context;
    struct on_connection_result_user_data *connection_result_ud = user_data;

    if (env) {
        napi_value params[3];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        /*
         * If we can't resolve the weak ref to the mqtt5 client, then it's been garbage collected and we should not
         * do anything.
         */
        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_mqtt5_client_weak_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            AWS_LOGF_INFO(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_on_connection_success_call - mqtt5_client node wrapper no longer resolvable",
                (void *)binding->client);
            goto done;
        }

        if (s_create_napi_connack_packet(env, connection_result_ud, &params[1])) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_on_connection_success_call - failed to create connack object",
                (void *)binding->client);
            goto done;
        }

        if (s_create_napi_negotiated_settings(env, &connection_result_ud->settings, &params[2])) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_on_connection_success_call - failed to create negotiated settings object",
                (void *)binding->client);
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

/* in-node/libuv-thread function to trigger the emission of a CONNECTION_FAILURE client lifecycle event */
static void s_on_connection_failure_call(napi_env env, napi_value function, void *context, void *user_data) {
    struct aws_mqtt5_client_binding *binding = context;
    struct on_connection_result_user_data *connection_result_ud = user_data;

    if (env) {
        napi_value params[3];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        /*
         * If we can't resolve the weak ref to the mqtt5 client, then it's been garbage collected and we should not
         * do anything.
         */
        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_mqtt5_client_weak_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            AWS_LOGF_INFO(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_on_connection_failure_call - mqtt5_client node wrapper no longer resolvable",
                (void *)binding->client);
            goto done;
        }

        AWS_NAPI_CALL(env, napi_create_uint32(env, connection_result_ud->error_code, &params[1]), { goto done; });

        if (s_create_napi_connack_packet(env, connection_result_ud, &params[2])) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_on_connection_failure_call - failed to create connack object",
                (void *)binding->client);
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

/* Builds a napi object that represents DISCONNECT packet, using the AwsMqtt5PacketDisconnect interface */
static int s_create_napi_disconnect_packet(
    napi_env env,
    const struct on_disconnection_user_data *disconnection_ud,
    napi_value *packet_out) {

    if (env == NULL) {
        return aws_raise_error(AWS_CRT_NODEJS_ERROR_THREADSAFE_FUNCTION_NULL_NAPI_ENV);
    }

    if (!disconnection_ud->is_disconnect_valid) {
        AWS_NAPI_CALL(
            env, napi_get_null(env, packet_out), { return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE); });
        return AWS_OP_SUCCESS;
    }

    napi_value packet = NULL;
    AWS_NAPI_CALL(
        env, napi_create_object(env, &packet), { return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE); });

    const struct aws_mqtt5_packet_disconnect_view *disconnect_view = &disconnection_ud->disconnect_storage.storage_view;

    if (aws_napi_attach_object_property_u32(packet, env, AWS_NAPI_KEY_REASON_CODE, disconnect_view->reason_code)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_u32(
            packet,
            env,
            AWS_NAPI_KEY_SESSION_EXPIRY_INTERVAL_SECONDS,
            disconnect_view->session_expiry_interval_seconds)) {
        return AWS_OP_ERR;
    }

    if (aws_napi_attach_object_property_optional_string(
            packet, env, AWS_NAPI_KEY_REASON_STRING, disconnect_view->reason_string)) {
        return AWS_OP_ERR;
    }

    if (s_attach_object_property_user_properties(
            packet, env, disconnect_view->user_property_count, disconnect_view->user_properties)) {
        return AWS_OP_ERR;
    }

    *packet_out = packet;

    return AWS_OP_SUCCESS;
}

/* in-node/libuv-thread function to trigger the emission of a DISCONNECTION client lifecycle event */
static void s_on_disconnection_call(napi_env env, napi_value function, void *context, void *user_data) {
    struct aws_mqtt5_client_binding *binding = context;
    struct on_disconnection_user_data *disconnection_ud = user_data;

    if (env) {
        napi_value params[3];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        /*
         * If we can't resolve the weak ref to the mqtt5 client, then it's been garbage collected and we should not
         * do anything.
         */
        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_mqtt5_client_weak_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            AWS_LOGF_INFO(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_on_disconnection_call - mqtt5_client node wrapper no longer resolvable",
                (void *)binding->client);
            goto done;
        }

        AWS_NAPI_CALL(env, napi_create_uint32(env, disconnection_ud->error_code, &params[1]), { goto done; });

        if (s_create_napi_disconnect_packet(env, disconnection_ud, &params[2])) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_on_disconnection_call - failed to create disconnect object",
                (void *)binding->client);
            goto done;
        }

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(env, binding->on_disconnection, NULL, function, num_params, params));
    }

done:

    s_on_disconnection_user_data_destroy(disconnection_ud);
}

/*
 * Persistent storage for user properties.
 */
struct aws_napi_mqtt5_user_property_storage {
    struct aws_array_list user_properties;
    struct aws_byte_buf user_property_storage;
};

/* Extract a set of user properties from a Napi object. */
static int s_aws_mqtt5_user_properties_extract_from_js_object(
    struct aws_mqtt5_client_binding *binding,
    struct aws_napi_mqtt5_user_property_storage *user_properties_storage,
    napi_env env,
    napi_value node_container,
    size_t *user_property_count_out,
    const struct aws_mqtt5_user_property **user_properties_out) {

    napi_value node_user_properties = NULL;
    if (!aws_napi_get_named_property(
            env, node_container, AWS_NAPI_KEY_USER_PROPERTIES, napi_object, &node_user_properties)) {
        return AWS_OP_SUCCESS;
    }

    if (aws_napi_is_null_or_undefined(env, node_user_properties)) {
        return AWS_OP_SUCCESS;
    }

    struct aws_allocator *allocator = aws_napi_get_allocator();

    /* len of js array */
    uint32_t user_property_count = 0;
    AWS_NAPI_CALL(env, napi_get_array_length(env, node_user_properties, &user_property_count), {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_aws_mqtt5_user_properties_extract_from_js_object - user properties is not an array",
            (void *)binding->client);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    });

    /* compute storage size */
    size_t total_property_length = 0;
    for (uint32_t i = 0; i < user_property_count; ++i) {
        napi_value array_element;
        AWS_NAPI_CALL(env, napi_get_element(env, node_user_properties, i, &array_element), {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_aws_mqtt5_user_properties_extract_from_js_object - user properties is not indexable",
                (void *)binding->client);
            return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE);
        });

        struct aws_byte_buf name_buf;
        AWS_ZERO_STRUCT(name_buf);
        struct aws_byte_buf value_buf;
        AWS_ZERO_STRUCT(value_buf);

        bool found_user_property =
            aws_napi_get_named_property_as_bytebuf(env, array_element, AWS_NAPI_KEY_NAME, napi_string, &name_buf) &&
            aws_napi_get_named_property_as_bytebuf(env, array_element, AWS_NAPI_KEY_VALUE, napi_string, &value_buf);

        total_property_length += name_buf.len + value_buf.len;

        aws_byte_buf_clean_up(&name_buf);
        aws_byte_buf_clean_up(&value_buf);

        if (!found_user_property) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "id=%p s_aws_mqtt5_user_properties_extract_from_js_object - malformed property name/value pair",
                (void *)binding->client);
            return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
        }
    }

    /* allocate space */
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

    /* persist each property */
    for (uint32_t i = 0; i < user_property_count; ++i) {
        napi_value array_element;
        AWS_NAPI_CALL(env, napi_get_element(env, node_user_properties, i, &array_element), {
            return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE);
        });

        struct aws_byte_buf name_buf;
        AWS_ZERO_STRUCT(name_buf);
        struct aws_byte_buf value_buf;
        AWS_ZERO_STRUCT(value_buf);

        aws_napi_get_named_property_as_bytebuf(env, array_element, AWS_NAPI_KEY_NAME, napi_string, &name_buf);
        aws_napi_get_named_property_as_bytebuf(env, array_element, AWS_NAPI_KEY_VALUE, napi_string, &value_buf);

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

    *user_property_count_out = user_property_count;
    *user_properties_out = user_properties_storage->user_properties.data;

    return AWS_OP_SUCCESS;
}

static void s_aws_mqtt5_user_properties_clean_up(struct aws_napi_mqtt5_user_property_storage *user_properties_storage) {
    aws_array_list_clean_up(&user_properties_storage->user_properties);
    aws_byte_buf_clean_up(&user_properties_storage->user_property_storage);
}

/*
 * Persistent storage for a publish packet.
 */
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

/* Extract a PUBLISH packet view from a Napi object (AwsMqtt5PacketPublish) and persist its data in storage. */
static int s_init_publish_options_from_napi(
    struct aws_mqtt5_client_binding *binding,
    napi_env env,
    napi_value node_publish_config,
    struct aws_mqtt5_packet_publish_view *publish_options,
    struct aws_napi_mqtt5_publish_storage *publish_storage) {

    if (!aws_napi_get_named_property_as_bytebuf(
            env, node_publish_config, AWS_NAPI_KEY_TOPIC, napi_string, &publish_storage->topic)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_init_publish_options_from_napi - failed to extract required property: topic",
            (void *)binding->client);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }
    publish_options->topic = aws_byte_cursor_from_buf(&publish_storage->topic);

    if (!aws_napi_get_named_property_as_bytebuf(
            env, node_publish_config, AWS_NAPI_KEY_PAYLOAD, napi_undefined, &publish_storage->payload)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_init_publish_options_from_napi - failed to extract required property: payload",
            (void *)binding->client);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }
    publish_options->payload = aws_byte_cursor_from_buf(&publish_storage->payload);

    uint32_t qos = 0;
    if (!aws_napi_get_named_property_as_uint32(env, node_publish_config, AWS_NAPI_KEY_QOS, &qos)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_init_publish_options_from_napi - failed to extract required property: qos",
            (void *)binding->client);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }
    publish_options->qos = qos;

    aws_napi_get_named_property_as_boolean(env, node_publish_config, AWS_NAPI_KEY_RETAIN, &publish_options->retain);

    uint32_t payload_format = 0;
    if (aws_napi_get_named_property_as_uint32(env, node_publish_config, AWS_NAPI_KEY_PAYLOAD_FORMAT, &payload_format)) {
        publish_storage->payload_format = payload_format;
        publish_options->payload_format = &publish_storage->payload_format;
    }

    if (aws_napi_get_named_property_as_uint32(
            env,
            node_publish_config,
            AWS_NAPI_KEY_MESSAGE_EXPIRY_INTERVAL_SECONDS,
            &publish_storage->message_expiry_interval_seconds)) {
        publish_options->message_expiry_interval_seconds = &publish_storage->message_expiry_interval_seconds;
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_publish_config, AWS_NAPI_KEY_RESPONSE_TOPIC, napi_string, &publish_storage->response_topic)) {
        publish_storage->response_topic_cursor = aws_byte_cursor_from_buf(&publish_storage->response_topic);
        publish_options->response_topic = &publish_storage->response_topic_cursor;
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env,
            node_publish_config,
            AWS_NAPI_KEY_CORRELATION_DATA,
            napi_undefined,
            &publish_storage->correlation_data)) {
        publish_storage->correlation_data_cursor = aws_byte_cursor_from_buf(&publish_storage->correlation_data);
        publish_options->correlation_data = &publish_storage->correlation_data_cursor;
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_publish_config, AWS_NAPI_KEY_CONTENT_TYPE, napi_string, &publish_storage->content_type)) {
        publish_storage->content_type_cursor = aws_byte_cursor_from_buf(&publish_storage->content_type);
        publish_options->content_type = &publish_storage->content_type_cursor;
    }

    if (s_aws_mqtt5_user_properties_extract_from_js_object(
            binding,
            &publish_storage->user_properties,
            env,
            node_publish_config,
            &publish_options->user_property_count,
            &publish_options->user_properties)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_init_publish_options_from_napi - failed to extract userProperties",
            (void *)binding->client);
        return AWS_OP_ERR;
    }

    return AWS_OP_SUCCESS;
}

/* Persistent storage for a CONNECT packet. */
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

/* Extract a CONNECT packet view from a Napi object (AwsMqtt5PacketConnect) and persist its data in storage. */
static int s_init_connect_options_from_napi(
    struct aws_mqtt5_client_binding *binding,
    napi_env env,
    napi_value node_connect_config,
    struct aws_mqtt5_packet_connect_view *connect_options,
    struct aws_mqtt5_packet_publish_view *will_options,
    struct aws_napi_mqtt5_connect_storage *connect_storage) {

    if (!aws_napi_get_named_property_as_uint16(
            env,
            node_connect_config,
            AWS_NAPI_KEY_KEEP_ALIVE_INTERVAL_SECONDS,
            &connect_options->keep_alive_interval_seconds)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "s_init_connect_options_from_napi - failed to extract required parameter: keepAliveIntervalSeconds");
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_connect_config, AWS_NAPI_KEY_CLIENT_ID, napi_string, &connect_storage->client_id)) {
        connect_options->client_id = aws_byte_cursor_from_buf(&connect_storage->client_id);
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_connect_config, AWS_NAPI_KEY_USERNAME, napi_string, &connect_storage->username)) {
        connect_storage->username_cursor = aws_byte_cursor_from_buf(&connect_storage->username);
        connect_options->username = &connect_storage->username_cursor;
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_connect_config, AWS_NAPI_KEY_PASSWORD, napi_undefined, &connect_storage->password)) {
        connect_storage->password_cursor = aws_byte_cursor_from_buf(&connect_storage->password);
        connect_options->password = &connect_storage->password_cursor;
    }

    if (aws_napi_get_named_property_as_uint32(
            env,
            node_connect_config,
            AWS_NAPI_KEY_SESSION_EXPIRY_INTERVAL_SECONDS,
            &connect_storage->session_expiry_interval_seconds)) {
        connect_options->session_expiry_interval_seconds = &connect_storage->session_expiry_interval_seconds;
    }

    if (aws_napi_get_named_property_boolean_as_u8(
            env,
            node_connect_config,
            AWS_NAPI_KEY_REQUEST_RESPONSE_INFORMATION,
            &connect_storage->request_response_information)) {
        connect_options->request_response_information = &connect_storage->request_response_information;
    }

    if (aws_napi_get_named_property_boolean_as_u8(
            env,
            node_connect_config,
            AWS_NAPI_KEY_REQUEST_PROBLEM_INFORMATION,
            &connect_storage->request_problem_information)) {
        connect_options->request_problem_information = &connect_storage->request_problem_information;
    }

    if (aws_napi_get_named_property_as_uint16(
            env, node_connect_config, AWS_NAPI_KEY_RECEIVE_MAXIMUM, &connect_storage->receive_maximum)) {
        connect_options->receive_maximum = &connect_storage->receive_maximum;
    }

    if (aws_napi_get_named_property_as_uint32(
            env,
            node_connect_config,
            AWS_NAPI_KEY_MAXIMUM_PACKET_SIZE_BYTES,
            &connect_storage->maximum_packet_size_bytes)) {
        connect_options->maximum_packet_size_bytes = &connect_storage->maximum_packet_size_bytes;
    }

    if (aws_napi_get_named_property_as_uint32(
            env,
            node_connect_config,
            AWS_NAPI_KEY_WILL_DELAY_INTERVAL_SECONDS,
            &connect_storage->will_delay_interval_seconds)) {
        connect_options->will_delay_interval_seconds = &connect_storage->will_delay_interval_seconds;
    }

    napi_value napi_will = NULL;
    if (aws_napi_get_named_property(env, node_connect_config, AWS_NAPI_KEY_WILL, napi_object, &napi_will)) {
        if (!aws_napi_is_null_or_undefined(env, napi_will)) {
            if (s_init_publish_options_from_napi(
                    binding, env, napi_will, will_options, &connect_storage->will_storage)) {
                AWS_LOGF_ERROR(
                    AWS_LS_NODEJS_CRT_GENERAL,
                    "s_init_connect_options_from_napi - failed to destructure will properties");
                return AWS_OP_ERR;
            }

            connect_options->will = will_options;
        }
    }

    if (s_aws_mqtt5_user_properties_extract_from_js_object(
            binding,
            &connect_storage->user_properties,
            env,
            node_connect_config,
            &connect_options->user_property_count,
            &connect_options->user_properties)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL, "s_init_connect_options_from_napi - failed to extract userProperties");
        return AWS_OP_ERR;
    }

    return AWS_OP_SUCCESS;
}

/*
 * Persistent storage for mqtt5 client options
 */
struct aws_napi_mqtt5_client_creation_storage {
    struct aws_byte_buf host_name;

    struct aws_napi_mqtt5_connect_storage connect_storage;
};

static void s_aws_napi_mqtt5_client_creation_storage_clean_up(struct aws_napi_mqtt5_client_creation_storage *storage) {
    aws_byte_buf_clean_up(&storage->host_name);

    s_aws_napi_mqtt5_connect_storage_clean_up(&storage->connect_storage);
}

/* persistent storage for all the data necessary to transform the websocket handshake */
struct mqtt5_transform_websocket_args {
    struct aws_mqtt5_client_binding *binding;

    struct aws_http_message *request;

    aws_mqtt5_transform_websocket_handshake_complete_fn *complete_fn;
    void *complete_ctx;
};

/* invoked from node once the JS handshake transform callback has completed */
static napi_value s_napi_mqtt5_transform_websocket_complete(napi_env env, napi_callback_info cb_info) {

    struct mqtt5_transform_websocket_args *args = NULL;
    int error_code = AWS_ERROR_SUCCESS;

    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, cb_info, &num_args, node_args, NULL, (void **)&args), {
        napi_throw_error(env, NULL, "mqtt5_transform_websocket_complete - Failed to retrieve callback information");
        goto cleanup;
    });
    if (num_args > 1) {
        napi_throw_error(env, NULL, "mqtt5_transform_websocket_complete - needs exactly 0 or 1 arguments");
        goto cleanup;
    }

    napi_value node_error_code = *arg++;
    /* If the user didn't provide an error_code, the napi_value will be undefined, so we can ignore it */
    if (!aws_napi_is_null_or_undefined(env, node_error_code)) {
        AWS_NAPI_CALL(env, napi_get_value_int32(env, node_error_code, &error_code), {
            napi_throw_type_error(
                env, NULL, "mqtt5_transform_websocket_complete - error_code must be a number or undefined");
            goto cleanup;
        });
    }

    args->complete_fn(args->request, error_code, args->complete_ctx);

cleanup:

    if (args != NULL) {
        aws_mem_release(args->binding->allocator, args);
    }

    return NULL;
}

/* in-node/libuv-thread function to trigger websocket handshake transform callback */
static void s_mqtt5_transform_websocket_call(
    napi_env env,
    napi_value transform_websocket,
    void *context,
    void *user_data) {

    (void)context;
    struct mqtt5_transform_websocket_args *args = user_data;

    if (env) {
        napi_value params[2];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        AWS_NAPI_ENSURE(env, aws_napi_http_message_wrap(env, args->request, &params[0]));
        AWS_NAPI_ENSURE(
            env,
            napi_create_function(
                env,
                "mqtt5_transform_websocket_complete",
                NAPI_AUTO_LENGTH,
                &s_napi_mqtt5_transform_websocket_complete,
                args,
                &params[1]));

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(
                env, args->binding->transform_websocket, NULL, transform_websocket, num_params, params));
    } else {
        args->complete_fn(args->request, AWS_CRT_NODEJS_ERROR_THREADSAFE_FUNCTION_NULL_NAPI_ENV, args->complete_ctx);

        aws_mem_release(args->binding->allocator, args);
    }
}

static void s_mqtt5_transform_websocket(
    struct aws_http_message *request,
    void *user_data,
    aws_mqtt5_transform_websocket_handshake_complete_fn *complete_fn,
    void *complete_ctx) {

    struct aws_mqtt5_client_binding *binding = user_data;

    struct mqtt5_transform_websocket_args *args =
        aws_mem_calloc(binding->allocator, 1, sizeof(struct mqtt5_transform_websocket_args));

    args->binding = binding;
    args->request = request;
    args->complete_fn = complete_fn;
    args->complete_ctx = complete_ctx;

    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->transform_websocket, args));
}

/* Extracts all mqtt5 client configuration from a napi Mqtt5ClientConfig object */
static int s_init_client_configuration_from_js_client_configuration(
    napi_env env,
    napi_value node_client_config,
    struct aws_mqtt5_client_binding *binding,
    struct aws_mqtt5_client_options *client_options,
    struct aws_mqtt5_packet_connect_view *connect_options,
    struct aws_mqtt5_packet_publish_view *will_options,
    struct aws_napi_mqtt5_client_creation_storage *options_storage) {

    /* required config parameters */
    if (!aws_napi_get_named_property_as_bytebuf(
            env, node_client_config, AWS_NAPI_KEY_HOST_NAME, napi_string, &options_storage->host_name)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "s_init_client_configuration_from_js_client_configuration - failed to extract required property: hostName");
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    client_options->host_name = aws_byte_cursor_from_buf(&options_storage->host_name);

    if (!aws_napi_get_named_property_as_uint16(env, node_client_config, AWS_NAPI_KEY_PORT, &client_options->port)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "s_init_client_configuration_from_js_client_configuration - failed to extract required property: port");
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    /* optional config parameters */
    uint32_t session_behavior = 0;
    if (aws_napi_get_named_property_as_uint32(
            env, node_client_config, AWS_NAPI_KEY_SESSION_BEHAVIOR, (uint32_t *)&session_behavior)) {
        client_options->session_behavior = (enum aws_mqtt5_client_session_behavior_type)session_behavior;
    }

    uint32_t extended_validation_and_flow_control_behavior = 0;
    if (aws_napi_get_named_property_as_uint32(
            env,
            node_client_config,
            AWS_NAPI_KEY_EXTENDED_VALIDATION_AND_FLOW_CONTROL_OPTIONS,
            (uint32_t *)&extended_validation_and_flow_control_behavior)) {
        client_options->extended_validation_and_flow_control_options =
            (enum aws_mqtt5_extended_validation_and_flow_control_options)extended_validation_and_flow_control_behavior;
    }

    uint32_t offline_queue_behavior = 0;
    if (aws_napi_get_named_property_as_uint32(
            env, node_client_config, AWS_NAPI_KEY_OFFLINE_QUEUE_BEHAVIOR, (uint32_t *)&offline_queue_behavior)) {
        client_options->offline_queue_behavior =
            (enum aws_mqtt5_client_operation_queue_behavior_type)offline_queue_behavior;
    }

    uint32_t retry_jitter_mode = 0;
    if (aws_napi_get_named_property_as_uint32(
            env, node_client_config, AWS_NAPI_KEY_RETRY_JITTER_MODE, (uint32_t *)&retry_jitter_mode)) {
        client_options->retry_jitter_mode = (enum aws_mqtt5_client_session_behavior_type)retry_jitter_mode;
    }

    aws_napi_get_named_property_as_uint64(
        env, node_client_config, AWS_NAPI_KEY_MIN_RECONNECT_DELAY_MS, &client_options->min_reconnect_delay_ms);

    aws_napi_get_named_property_as_uint64(
        env, node_client_config, AWS_NAPI_KEY_MAX_RECONNECT_DELAY_MS, &client_options->max_reconnect_delay_ms);

    aws_napi_get_named_property_as_uint64(
        env,
        node_client_config,
        AWS_NAPI_KEY_MIN_CONNECTED_TIME_TO_RESET_RECONNECT_DELAY_MS,
        &client_options->min_connected_time_to_reset_reconnect_delay_ms);

    aws_napi_get_named_property_as_uint32(
        env, node_client_config, AWS_NAPI_KEY_PING_TIMEOUT_MS, &client_options->ping_timeout_ms);

    aws_napi_get_named_property_as_uint32(
        env, node_client_config, AWS_NAPI_KEY_CONNACK_TIMEOUT_MS, &client_options->connack_timeout_ms);

    aws_napi_get_named_property_as_uint32(
        env, node_client_config, AWS_NAPI_KEY_OPERATION_TIMEOUT_SECONDS, &client_options->operation_timeout_seconds);

    napi_value napi_value_connect = NULL;
    if (aws_napi_get_named_property(
            env, node_client_config, AWS_NAPI_KEY_CONNECT_PROPERTIES, napi_object, &napi_value_connect)) {
        if (s_init_connect_options_from_napi(
                binding, env, napi_value_connect, connect_options, will_options, &options_storage->connect_storage)) {
            AWS_LOGF_ERROR(
                AWS_LS_NODEJS_CRT_GENERAL,
                "s_init_client_configuration_from_js_client_configuration - failed to destructure connect properties");
            return AWS_OP_ERR;
        }
    }

    napi_value node_transform_websocket = NULL;
    if (aws_napi_get_named_property(
            env,
            node_client_config,
            AWS_NAPI_KEY_WEBSOCKET_HANDSHAKE_TRANSFORM,
            napi_function,
            &node_transform_websocket)) {
        if (!aws_napi_is_null_or_undefined(env, node_transform_websocket)) {
            AWS_NAPI_CALL(
                env,
                aws_napi_create_threadsafe_function(
                    env,
                    node_transform_websocket,
                    "aws_mqtt5_client_transform_websocket",
                    s_mqtt5_transform_websocket_call,
                    binding,
                    &binding->transform_websocket),
                { return aws_raise_error(AWS_CRT_NODEJS_ERROR_NAPI_FAILURE); });

            client_options->websocket_handshake_transform = s_mqtt5_transform_websocket;
            client_options->websocket_handshake_transform_user_data = binding;
        }
    }

    return AWS_OP_SUCCESS;
}

/* helper function for creating threadsafe napi functions from napi function objects that are properties of a parent
 * object */
static int s_init_binding_threadsafe_function(
    struct aws_mqtt5_client_binding *binding,
    napi_env env,
    napi_value parent_object,
    const char *property_name,
    const char *threadsafe_name,
    napi_threadsafe_function_type threadsafe_function,
    napi_threadsafe_function *function_out) {

    napi_value node_function = NULL;
    if (!aws_napi_get_named_property(env, parent_object, property_name, napi_function, &node_function)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "s_init_binding_threadsafe_function - failed to find required function property: %s",
            property_name);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    if (aws_napi_is_null_or_undefined(env, node_function)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "s_init_binding_threadsafe_function - required property `%s` is invalid",
            property_name);
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    AWS_NAPI_CALL(
        env,
        aws_napi_create_threadsafe_function(
            env, node_function, threadsafe_name, threadsafe_function, binding, function_out),
        { return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT); });

    return AWS_OP_SUCCESS;
}

/* creates threadsafe functions for all mqtt5 client lifecycle events */
static int s_init_lifecycle_event_threadsafe_functions(
    struct aws_mqtt5_client_binding *binding,
    napi_env env,
    napi_value node_lifecycle_event_handlers) {

    if (s_init_binding_threadsafe_function(
            binding,
            env,
            node_lifecycle_event_handlers,
            AWS_NAPI_KEY_ON_STOPPED,
            "aws_mqtt5_client_on_stopped",
            s_on_stopped_call,
            &binding->on_stopped)) {
        return AWS_OP_ERR;
    }

    if (s_init_binding_threadsafe_function(
            binding,
            env,
            node_lifecycle_event_handlers,
            AWS_NAPI_KEY_ON_ATTEMPTING_CONNECT,
            "aws_mqtt5_client_on_attempting_connect",
            s_on_attempting_connect_call,
            &binding->on_attempting_connect)) {
        return AWS_OP_ERR;
    }

    if (s_init_binding_threadsafe_function(
            binding,
            env,
            node_lifecycle_event_handlers,
            AWS_NAPI_KEY_ON_CONNECTION_SUCCESS,
            "aws_mqtt5_client_on_connection_success",
            s_on_connection_success_call,
            &binding->on_connection_success)) {
        return AWS_OP_ERR;
    }

    if (s_init_binding_threadsafe_function(
            binding,
            env,
            node_lifecycle_event_handlers,
            AWS_NAPI_KEY_ON_CONNECTION_FAILURE,
            "aws_mqtt5_client_on_connection_failure",
            s_on_connection_failure_call,
            &binding->on_connection_failure)) {
        return AWS_OP_ERR;
    }

    if (s_init_binding_threadsafe_function(
            binding,
            env,
            node_lifecycle_event_handlers,
            AWS_NAPI_KEY_ON_DISCONNECTION,
            "aws_mqtt5_client_on_disconnection",
            s_on_disconnection_call,
            &binding->on_disconnection)) {
        return AWS_OP_ERR;
    }

    return AWS_OP_SUCCESS;
}

/*
 * Shared configuration defaults.  These are required parameters at the C level, but we make them optional and give
 * them sensible defaults at the binding level.
 */
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
            env, node_client_config, binding, &client_options, &connect_options, &will_options, &options_storage)) {
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

/* Persistent storage for a DISCONNECT packet. */
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

/* Extract a DISCONNECT packet view from a Napi object (AwsMqtt5PacketDisconnect) and persist its data in storage. */
static int s_aws_napi_mqtt5_packet_disconnect_storage_initialize_from_js_object(
    struct aws_mqtt5_client_binding *binding,
    struct aws_napi_mqtt5_packet_disconnect_storage *disconnect_storage,
    struct aws_mqtt5_packet_disconnect_view *disconnect_packet,
    napi_env env,
    napi_value node_disconnect_packet) {
    uint32_t reason_code = 0;
    if (aws_napi_get_named_property_as_uint32(
            env, node_disconnect_packet, AWS_NAPI_KEY_REASON_CODE, (uint32_t *)&reason_code)) {
        disconnect_packet->reason_code = (enum aws_mqtt5_disconnect_reason_code)reason_code;
    }

    if (aws_napi_get_named_property_as_uint32(
            env,
            node_disconnect_packet,
            AWS_NAPI_KEY_SESSION_EXPIRY_INTERVAL_SECONDS,
            &disconnect_storage->session_expiry_interval_seconds)) {
        disconnect_packet->session_expiry_interval_seconds = &disconnect_storage->session_expiry_interval_seconds;
    }

    if (aws_napi_get_named_property_as_bytebuf(
            env, node_disconnect_packet, AWS_NAPI_KEY_REASON_STRING, napi_string, &disconnect_storage->reason_string)) {
        disconnect_storage->reason_string_cursor = aws_byte_cursor_from_buf(&disconnect_storage->reason_string);
        disconnect_packet->reason_string = &disconnect_storage->reason_string_cursor;
    }

    if (s_aws_mqtt5_user_properties_extract_from_js_object(
            binding,
            &disconnect_storage->user_properties,
            env,
            node_disconnect_packet,
            &disconnect_packet->user_property_count,
            &disconnect_packet->user_properties)) {
        AWS_LOGF_ERROR(
            AWS_LS_NODEJS_CRT_GENERAL,
            "id=%p s_aws_napi_mqtt5_packet_disconnect_storage_initialize_from_js_object - failed to extract "
            "userProperties",
            (void *)binding->client);
        return AWS_OP_ERR;
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
                binding, &disconnect_storage, &disconnect_view, env, node_disconnect_packet)) {
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

napi_value aws_napi_mqtt5_client_subscribe(napi_env env, napi_callback_info info) {
    (void)env;
    (void)info;

    return NULL;
}
