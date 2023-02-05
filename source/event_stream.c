/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#include "event_stream.h"

#include <aws/event-stream/event_stream_rpc_client.h>
#include <aws/io/socket.h>
#include <aws/io/tls_channel_handler.h>

/*
 * Binding object that outlives the associated napi wrapper object.  When that object finalizes, then it's a signal
 * to this object to destroy the connection (and itself, afterwards).
 */
struct aws_event_stream_client_connection_binding {
    struct aws_allocator *allocator;

    /*
     * We ref count the binding itself because there are anomalous situations where the binding must outlive even
     * the native client.  In particular, if we have a native client being destroyed it may emit lifecycle events
     * or completion callbacks for submitted operations as it does so.  Those events get marshalled across to the
     * node/libuv thread and in the time it takes to do so, the native client may have completed destruction.  But
     * we still need the binding when we're processing those events/callbacks in the libuv thread so the binding
     * must not simply destroy itself as soon as the native client has destroyed itself.
     *
     * We handle this by having all operations/events inc/dec this ref count as well as the base of one from
     * creating the client.  In this way, the binding will only destroy itself when the native client is completely
     * gone and all callbacks and events have been successfully emitted to node.
     */
    struct aws_ref_count ref_count;

    struct aws_event_stream_rpc_client_connection *connection;
    bool is_closed;

    /*
     * Cached config since connect is separate
     */
    struct aws_string *host;
    uint16_t port;
    struct aws_socket_options socket_options;
    struct aws_tls_connection_options tls_connection_options;

    /*
     * Single count ref to the JS connection object.
     */
    napi_ref node_event_stream_client_connection_ref;

    /*
     * Single count ref to the node external managed by the binding.
     */
    napi_ref node_event_stream_client_connection_external_ref;

    napi_threadsafe_function on_disconnect;
    napi_threadsafe_function on_protocol_message;
    napi_threadsafe_function on_connection_setup;
};

static void s_aws_event_stream_client_connection_binding_on_zero(void *context) {
    if (context == NULL) {
        return;
    }

    struct aws_event_stream_client_connection_binding *binding = context;

    aws_string_destroy(binding->host);
    aws_tls_connection_options_clean_up(&binding->tls_connection_options);

    AWS_CLEAN_THREADSAFE_FUNCTION(binding, on_disconnect);
    AWS_CLEAN_THREADSAFE_FUNCTION(binding, on_protocol_message);
    AWS_CLEAN_THREADSAFE_FUNCTION(binding, on_connection_setup);

    aws_mem_release(binding->allocator, binding);
}

static struct aws_event_stream_client_connection_binding *s_aws_event_stream_client_connection_binding_acquire(
    struct aws_event_stream_client_connection_binding *binding) {
    if (binding == NULL) {
        return NULL;
    }

    aws_ref_count_acquire(&binding->ref_count);
    return binding;
}

static struct aws_event_stream_client_connection_binding *s_aws_event_stream_client_connection_binding_release(
    struct aws_event_stream_client_connection_binding *binding) {
    if (binding != NULL) {
        aws_ref_count_release(&binding->ref_count);
    }

    return NULL;
}

/*
 * Invoked when the node mqtt5 client is garbage collected or if fails construction partway through
 */
static void s_aws_event_stream_client_connection_extern_finalize(
    napi_env env,
    void *finalize_data,
    void *finalize_hint) {
    (void)finalize_hint;
    (void)env;

    struct aws_event_stream_client_connection_binding *binding = finalize_data;

    AWS_LOGF_INFO(
        AWS_LS_NODEJS_CRT_GENERAL,
        "id=%p s_aws_event_tream_client_connection_extern_finalize - event stream client connection node wrapper is "
        "being finalized",
        (void *)binding->connection);

    if (binding->connection != NULL) {
        /* if connection is not null, then this is a successful connection which should shutdown normally */
        aws_event_stream_rpc_client_connection_release(binding->connection);
        binding->connection = NULL;
    } else if (!binding->is_closed) {
        /*
         * no connection, just release the binding
         * If this was a failed construction, the binding will be immediately destroyed.
         * If this is mid-connection, then the closed flag will indicate to the connection callback that the
         * node object has gone away and it should close the connection and eventually destroy itself.
         */
        binding->is_closed = true;
        s_aws_event_stream_client_connection_binding_release(binding);
    }
}

static void s_napi_event_stream_connection_on_disconnect(
    napi_env env,
    napi_value function,
    void *context,
    void *user_data) {
    (void)env;
    (void)function;
    (void)context;
    (void)user_data;
}

static void s_napi_event_stream_connection_on_protocol_message(
    napi_env env,
    napi_value function,
    void *context,
    void *user_data) {
    (void)env;
    (void)function;
    (void)context;
    (void)user_data;
}

static const char *AWS_EVENT_STREAM_PROPERTY_NAME_HOST = "hostName";
static const char *AWS_EVENT_STREAM_PROPERTY_NAME_PORT = "port";

static int s_init_event_stream_connection_configuration_from_js_connection_configuration(
    napi_env env,
    napi_value node_connection_options,
    struct aws_event_stream_client_connection_binding *binding) {
    napi_value host_name_property;
    if (aws_napi_get_named_property(
            env, node_connection_options, AWS_EVENT_STREAM_PROPERTY_NAME_HOST, napi_string, &host_name_property) !=
        AWS_NGNPR_VALID_VALUE) {
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    binding->host = aws_string_new_from_napi(env, host_name_property);
    if (binding->host == NULL) {
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    if (aws_napi_get_named_property_as_uint16(
            env, node_connection_options, AWS_EVENT_STREAM_PROPERTY_NAME_PORT, &binding->port) !=
        AWS_NGNPR_VALID_VALUE) {
        return aws_raise_error(AWS_ERROR_INVALID_ARGUMENT);
    }

    return AWS_OP_SUCCESS;
}

napi_value aws_napi_event_stream_client_connection_new(napi_env env, napi_callback_info info) {
    napi_value node_args[6];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "event_stream_client_connection_new - Failed to retrieve arguments");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "event_stream_client_connection_new - needs exactly 6 arguments");
        return NULL;
    }

    napi_value node_external = NULL;
    struct aws_allocator *allocator = aws_napi_get_allocator();

    struct aws_event_stream_client_connection_binding *binding =
        aws_mem_calloc(allocator, 1, sizeof(struct aws_event_stream_client_connection_binding));
    binding->allocator = allocator;
    aws_ref_count_init(&binding->ref_count, binding, s_aws_event_stream_client_connection_binding_on_zero);

    AWS_NAPI_CALL(
        env,
        napi_create_external(env, binding, s_aws_event_stream_client_connection_extern_finalize, NULL, &node_external),
        {
            napi_throw_error(env, NULL, "event_stream_client_connection_new - Failed to create n-api external");
            goto error;
        });

    /* Arg #1: the js event stream connection */
    napi_value node_connection = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_connection)) {
        napi_throw_error(env, NULL, "event_stream_client_connection_new - Required connection parameter is null");
        goto error;
    }

    AWS_NAPI_CALL(env, napi_create_reference(env, node_connection, 1, &binding->node_event_stream_client_connection_ref), {
        napi_throw_error(
            env,
            NULL,
            "event_stream_client_connection_new - Failed to create reference to node event stream connection");
        goto error;
    });

    /* Arg #2: the event stream connection options object */
    napi_value node_connection_options = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_connection_options)) {
        napi_throw_error(env, NULL, "event_stream_client_connection_new - Required options parameter is null");
        goto error;
    }

    if (s_init_event_stream_connection_configuration_from_js_connection_configuration(
            env, node_connection_options, binding)) {
        napi_throw_error(
            env,
            NULL,
            "event_stream_client_connection_new - failed to initialize native connection configuration from js "
            "connection configuration");
        goto error;
    }

    /* Arg #3: on disconnect event handler */
    napi_value on_disconnect_event_handler = *arg++;
    if (aws_napi_is_null_or_undefined(env, on_disconnect_event_handler)) {
        napi_throw_error(
            env, NULL, "event_stream_client_connection_new - required on_disconnect event handler is null");
        goto error;
    }

    AWS_NAPI_CALL(
        env,
        aws_napi_create_threadsafe_function(
            env,
            on_disconnect_event_handler,
            "aws_event_stream_client_connection_on_disconnect",
            s_napi_event_stream_connection_on_disconnect,
            NULL,
            &binding->on_disconnect),
        {
            napi_throw_error(
                env, NULL, "event_stream_client_connection_new - failed to initialize on_disconnect event handler");
            goto error;
        });

    /* Arg #4: on protocol message event handler */
    napi_value on_protocol_message_event_handler = *arg++;
    if (aws_napi_is_null_or_undefined(env, on_protocol_message_event_handler)) {
        napi_throw_error(
            env, NULL, "event_stream_client_connection_new - required on_protocol_message event handler is null");
        goto error;
    }

    AWS_NAPI_CALL(
        env,
        aws_napi_create_threadsafe_function(
            env,
            on_protocol_message_event_handler,
            "aws_event_stream_client_connection_on_protocol_message",
            s_napi_event_stream_connection_on_protocol_message,
            NULL,
            &binding->on_protocol_message),
        {
            napi_throw_error(
                env,
                NULL,
                "event_stream_client_connection_new - failed to initialize on_protocol_message event handler");
            goto error;
        });

    /* Arg #5: socket options */
    napi_value node_socket_options = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_socket_options)) {
        struct aws_socket_options *socket_options_ptr = NULL;
        AWS_NAPI_CALL(env, napi_get_value_external(env, node_socket_options, (void **)&socket_options_ptr), {
            napi_throw_error(
                env, NULL, "event_stream_client_connection_new - Unable to extract socket_options from external");
            goto error;
        });

        if (socket_options_ptr == NULL) {
            napi_throw_error(env, NULL, "event_stream_client_connection_new - Null socket options");
            goto error;
        }

        binding->socket_options = *socket_options_ptr;
    }

    /* Arg #6: tls options */
    napi_value node_tls = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_tls)) {
        struct aws_tls_ctx *tls_ctx;
        AWS_NAPI_CALL(env, napi_get_value_external(env, node_tls, (void **)&tls_ctx), {
            napi_throw_error(env, NULL, "event_stream_client_connection_new - Failed to extract tls_ctx from external");
            goto error;
        });

        aws_tls_connection_options_init_from_ctx(&binding->tls_connection_options, tls_ctx);
    }

    AWS_NAPI_CALL(
        env, napi_create_reference(env, node_external, 1, &binding->node_event_stream_client_connection_external_ref), {
            napi_throw_error(
                env,
                NULL,
                "event_stream_client_connection_new - Failed to create one count reference to napi external");
            goto error;
        });

    return node_external;

error:

    s_aws_event_stream_rpc_client_connection_binding_release(binding);

    return NULL;
}

napi_value aws_napi_event_stream_client_connection_close(napi_env env, napi_callback_info info) {
    (void)env;
    (void)info;

    return NULL;
}

/*
struct aws_event_stream_rpc_client_connection_options {
    const char *host_name;
    uint16_t port;
    const struct aws_socket_options *socket_options;
    const struct aws_tls_connection_options *tls_options;
    struct aws_client_bootstrap *bootstrap;
    aws_event_stream_rpc_client_on_connection_setup_fn *on_connection_setup;
    aws_event_stream_rpc_client_connection_protocol_message_fn *on_connection_protocol_message;
    aws_event_stream_rpc_client_on_connection_shutdown_fn *on_connection_shutdown;
    void *user_data;
};
*/

napi_value aws_napi_event_stream_client_connection_connect(napi_env env, napi_callback_info info) {
    (void)env;
    (void)info;

    return NULL;
}

napi_value aws_napi_event_stream_client_connection_send_protocol_message(napi_env env, napi_callback_info info) {
    (void)env;
    (void)info;

    return NULL;
}

napi_value aws_napi_event_stream_client_stream_new(napi_env env, napi_callback_info info) {
    (void)env;
    (void)info;

    return NULL;
}

napi_value aws_napi_event_stream_client_stream_close(napi_env env, napi_callback_info info) {
    (void)env;
    (void)info;

    return NULL;
}

napi_value aws_napi_event_stream_client_stream_activate(napi_env env, napi_callback_info info) {
    (void)env;
    (void)info;

    return NULL;
}

napi_value aws_napi_event_stream_client_stream_send_message(napi_env env, napi_callback_info info) {
    (void)env;
    (void)info;

    return NULL;
}
