/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#include "mqtt5_client.h"

#include <aws/mqtt/v5/mqtt5_client.h>
#include <aws/mqtt/v5/mqtt5_types.h>

struct aws_mqtt5_client_binding {
    struct aws_allocator *allocator;
    struct aws_mqtt5_client *client;

    struct aws_tls_connection_options tls_connection_options;

    napi_env env;
};

static void s_mqtt5_client_on_terminate(void *user_data) {
    struct aws_mqtt5_client_binding *binding = user_data;

    aws_tls_connection_options_clean_up(&binding->tls_connection_options);

    aws_memory_release(binding->allocator, binding);
}

static void s_mqtt5_client_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;

    struct aws_mqtt5_client_binding *binding = finalize_data;

    aws_mqtt_client_release(binding->client);
}

static void s_on_publish_received(const struct aws_mqtt5_packet_publish_view *publish_packet, void *user_data) {
    (void)publish_packet;
    (void)user_data;
}

static void s_lifecycle_event_callback(const struct aws_mqtt5_client_lifecycle_event *event) {
    (void)event;
}

static const uint32_t s_default_socket_connect_timeout_ms = 10000;

static void s_init_default_mqtt5_client_options(
    struct aws_mqtt5_client_options *client_options,
    struct aws_mqtt5_packet_connect_view *connect_options) {
    client_options->connect_options = connect_options;
}

static int s_init_client_configuration_from_js_client_configuration(
    napi_value node_client_config,
    struct aws_mqtt5_client_options *client_options,
    struct aws_mqtt5_packet_connect_view *connect_options,
    struct aws_mqtt5_packet_publish_view *will_options) {
    (void)node_client_config;
    (void)client_options;
    (void)connect_options;
    (void)will_options;

    return AWS_OP_SUCCESS;
}

napi_value aws_napi_mqtt5_client_new(napi_env env, napi_callback_info info) {

    napi_value node_args[5];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, cb_info, &num_args, node_args, NULL, NULL), {
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

    struct aws_mqtt5_client_binding *binding = aws_mem_calloc(allocator, 1, sizeof(struct aws_mqtt5_client_binding));
    binding->allocator = allocator;
    binding->env = env;

    AWS_NAPI_CALL(env, napi_create_external(env, binding, s_mqtt5_client_finalize, NULL, &node_external), {
        napi_throw_error(env, NULL, "mqtt5_client_new - Failed to create n-api external");
        goto cleanup;
    });

    struct aws_mqtt5_client_options client_options;
    AWS_ZERO_STRUCT(client_options);

    struct aws_mqtt5_packet_connect_view connect_options;
    AWS_ZERO_STRUCT(connection_options);

    struct aws_mqtt5_packet_publish_view will_options;
    AWS_ZERO_STRUCT(will_options);

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
            node_client_config, &client_options, &connect_options, &will_options)) {
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
        AWS_NAPI_CALL(env, napi_get_value_external(env, node_socket_options, (void **)&options.socket_options), {
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

        aws_tls_connection_options_init_from_ctx(&binding->tls_options, tls_ctx);

        client_options.tls_options = &binding->tls_options;
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

    binding->client = aws_mqtt5_client_new(&client_options);
    if (binding->client == NULL) {
        napi_throw_type_error(env, NULL, "mqtt5_client_new - failed to create client");
        goto cleanup;
    }

    result = AWS_OP_SUCCESS;
    napi_client_wrapper = node_external;

cleanup:

    if (result) {
        s_mqtt5_client_on_terminate(binding);
    }

    return napi_client_wrapper;
}
