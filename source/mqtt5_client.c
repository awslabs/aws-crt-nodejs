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
#include <aws/mqtt/v5/mqtt5_types.h>

struct aws_mqtt5_client_binding {
    struct aws_allocator *allocator;
    struct aws_mqtt5_client *client;

    struct aws_tls_connection_options tls_connection_options;
};

static void s_mqtt5_client_on_terminate(void *user_data) {
    struct aws_mqtt5_client_binding *binding = user_data;

    aws_tls_connection_options_clean_up(&binding->tls_connection_options);

    aws_mem_release(binding->allocator, binding);
}

static void s_mqtt5_client_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;

    struct aws_mqtt5_client_binding *binding = finalize_data;

    aws_mqtt5_client_release(binding->client);
}

static void s_on_publish_received(const struct aws_mqtt5_packet_publish_view *publish_packet, void *user_data) {
    (void)publish_packet;
    (void)user_data;
}

static void s_lifecycle_event_callback(const struct aws_mqtt5_client_lifecycle_event *event) {
    (void)event;
}

struct aws_napi_mqtt5_client_creation_storage {
    struct aws_byte_buf host_name;
};

static void s_aws_napi_mqtt5_client_creation_storage_clean_up(struct aws_napi_mqtt5_client_creation_storage *storage) {
    aws_byte_buf_clean_up(&storage->host_name);
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
            env, node_client_config, "host_name", napi_string, &options_storage->host_name)) {
        return AWS_OP_ERR;
    }

    client_options->host_name = aws_byte_cursor_from_buf(&options_storage->host_name);

    if (!aws_napi_get_named_property_as_uint16(env, node_client_config, "port", napi_number, &client_options->port)) {
        return AWS_OP_ERR;
    }

    /* optional config parameters */
    uint32_t session_behavior = 0;
    if (aws_napi_get_named_property_as_uint32(
            env, node_client_config, "session_behavior", napi_number, (uint32_t *)&session_behavior)) {
        client_options->session_behavior = (enum aws_mqtt5_client_session_behavior_type)session_behavior;
    }

    uint32_t extended_validation_and_flow_control_behavior = 0;
    if (aws_napi_get_named_property_as_uint32(
            env,
            node_client_config,
            "extended_validation_and_flow_control_options",
            napi_number,
            (uint32_t *)&extended_validation_and_flow_control_behavior)) {
        client_options->extended_validation_and_flow_control_options =
            (enum aws_mqtt5_extended_validation_and_flow_control_options)extended_validation_and_flow_control_behavior;
    }

    uint32_t offline_queue_behavior = 0;
    if (aws_napi_get_named_property_as_uint32(
            env, node_client_config, "offline_queue_behavior", napi_number, (uint32_t *)&offline_queue_behavior)) {
        client_options->offline_queue_behavior =
            (enum aws_mqtt5_client_operation_queue_behavior_type)offline_queue_behavior;
    }

    uint32_t retry_jitter_mode = 0;
    if (aws_napi_get_named_property_as_uint32(
            env, node_client_config, "retry_jitter_mode", napi_number, (uint32_t *)&retry_jitter_mode)) {
        client_options->retry_jitter_mode = (enum aws_mqtt5_client_session_behavior_type)retry_jitter_mode;
    }

    aws_napi_get_named_property_as_uint64(
        env, node_client_config, "min_reconnect_delay_ms", napi_number, &client_options->min_reconnect_delay_ms);

    aws_napi_get_named_property_as_uint64(
        env, node_client_config, "max_reconnect_delay_ms", napi_number, &client_options->max_reconnect_delay_ms);

    aws_napi_get_named_property_as_uint64(
        env,
        node_client_config,
        "min_connected_time_to_reset_reconnect_delay_ms",
        napi_number,
        &client_options->min_connected_time_to_reset_reconnect_delay_ms);

    aws_napi_get_named_property_as_uint32(
        env, node_client_config, "ping_timeout_ms", napi_number, &client_options->ping_timeout_ms);

    aws_napi_get_named_property_as_uint32(
        env, node_client_config, "connack_timeout_ms", napi_number, &client_options->connack_timeout_ms);

    aws_napi_get_named_property_as_uint32(
        env, node_client_config, "operation_timeout_seconds", napi_number, &client_options->operation_timeout_seconds);

    return AWS_OP_SUCCESS;
}

napi_value aws_napi_mqtt5_client_new(napi_env env, napi_callback_info info) {

    napi_value node_args[5];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "mqtt5_client_new - Failed to retrieve arguments");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "mqtt5_client_new - needs exactly 5 arguments");
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

    napi_value node_client_bootstrap = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_client_config)) {
        struct client_bootstrap_binding *client_bootstrap_binding = NULL;
        napi_get_value_external(env, node_client_bootstrap, (void **)&client_bootstrap_binding);

        client_options.bootstrap = aws_napi_get_client_bootstrap(client_bootstrap_binding);
    }

    if (client_options.bootstrap == NULL) {
        client_options.bootstrap = aws_napi_get_default_client_bootstrap();
    }

    napi_value node_socket_options = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_client_config)) {
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
        napi_throw_type_error(env, NULL, "mqtt5_client_new - failed to create client");
        goto cleanup;
    }

    result = AWS_OP_SUCCESS;
    napi_client_wrapper = node_external;

cleanup:

    s_aws_napi_mqtt5_client_creation_storage_clean_up(&options_storage);

    if (result) {
        s_mqtt5_client_on_terminate(binding);
    }

    return napi_client_wrapper;
}
