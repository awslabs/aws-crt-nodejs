/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#include "event_stream.h"

#include <aws/event-stream/event_stream_rpc_client.h>
#include <aws/io/socket.h>
#include <aws/io/tls_channel_handler.h>

static const char *AWS_EVENT_STREAM_PROPERTY_NAME_HOST = "hostName";
static const char *AWS_EVENT_STREAM_PROPERTY_NAME_PORT = "port";

/*
 * Binding object that outlives the associated napi wrapper object.  When that object finalizes, then it's a signal
 * to this object to destroy the connection (and itself, afterwards).
 *
 * WARNING
 * Data Access Rules:
 *  (1) If in the libuv thread (called from JS or in the invocation of a thread-safe function), you may access anything
 *      in the binding
 *  (2) Otherwise, you may only access thread-safe functions or the binding's ref count APIs.  In particular,
 *      'connection' and 'is_closed' are off-limits unless you're in the libuv thread.
 */
struct aws_event_stream_client_connection_binding {
    struct aws_allocator *allocator;

    /*
     * We ref count the binding itself because there's two independent time intervals that together create a union
     * that we must honor.
     *
     * Interval #1: The binding must live from new() to extern finalizer, which is only triggered by a call to close()
     * Interval #2: The binding must live from connect() to {connection failure || connection shutdown} as processed
     *    by the libuv thread.  It is incorrect to react to those events in the event loop callback; we must bundle
     *    and ship them across to the libuv thread.  When the libuv thread is processing a connection failure or
     *    a connection shutdown, we know that no other events can possibly be pending ()hey would have already been
     *    processed in the libuv thread).
     */
    struct aws_ref_count ref_count;

    /*
     * May only be accessed from within the libuv thread.  This includes connection APIs like acquire and release.
     */
    struct aws_event_stream_rpc_client_connection *connection;
    bool is_closed;

    /*
     * Cached config since connect is separate
     *
     * Const post-creation.
     */
    struct aws_string *host;
    uint16_t port;
    struct aws_socket_options socket_options;
    struct aws_tls_connection_options tls_connection_options;
    bool using_tls;

    /*
     * Single count ref to the JS connection object.
     */
    napi_ref node_event_stream_client_connection_ref;

    /*
     * Single count ref to the node external managed by the binding.
     */
    napi_ref node_event_stream_client_connection_external_ref;

    napi_threadsafe_function on_connection_setup;
    napi_threadsafe_function on_connection_shutdown;
    napi_threadsafe_function on_protocol_message;
};

static void s_aws_event_stream_client_connection_binding_on_zero(void *context) {
    if (context == NULL) {
        return;
    }

    struct aws_event_stream_client_connection_binding *binding = context;

    aws_string_destroy(binding->host);
    aws_tls_connection_options_clean_up(&binding->tls_connection_options);

    AWS_CLEAN_THREADSAFE_FUNCTION(binding, on_connection_setup);
    AWS_CLEAN_THREADSAFE_FUNCTION(binding, on_connection_shutdown);
    AWS_CLEAN_THREADSAFE_FUNCTION(binding, on_protocol_message);

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

static void s_close_binding(napi_env env, struct aws_event_stream_client_connection_binding *binding) {
    AWS_FATAL_ASSERT(env != NULL);

    binding->is_closed = true;

    napi_ref node_event_stream_client_connection_external_ref =
        binding->node_event_stream_client_connection_external_ref;
    binding->node_event_stream_client_connection_external_ref = NULL;

    napi_ref node_event_stream_client_connection_ref = binding->node_event_stream_client_connection_ref;
    binding->node_event_stream_client_connection_ref = NULL;

    if (node_event_stream_client_connection_external_ref != NULL) {
        napi_delete_reference(env, node_event_stream_client_connection_external_ref);
    }

    if (node_event_stream_client_connection_ref != NULL) {
        napi_delete_reference(env, node_event_stream_client_connection_ref);
    }
}

/*
 * Invoked when the node connection object is garbage collected or if fails construction partway through
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

    /*
     * Only an explicit call to close() from JS will break the extern ref that keeps the finalizer from being called.
     * If we're here, this must be true.
     */
    AWS_FATAL_ASSERT(binding->is_closed);

    /*
     * Release the allocation-ref on the binding.  If there is a connection in progress (or being shutdown) there
     * is a second ref outstanding which is removed on connection shutdown or failed setup.
     */
    s_aws_event_stream_client_connection_binding_release(binding);
}

/*
 * Holds relevant information about a connection setup or shutdown callback from the event loop.  This is shipped
 * over to a threadsafe function that runs on the libuv thread.
 */
struct aws_event_stream_connection_event_data {
    struct aws_allocator *allocator;

    struct aws_event_stream_client_connection_binding *binding;
    int error_code;
    struct aws_event_stream_rpc_client_connection *connection;
};

static void s_napi_event_stream_connection_on_connection_shutdown(
    napi_env env,
    napi_value function,
    void *context,
    void *user_data) {

    (void)context;

    struct aws_event_stream_connection_event_data *shutdown_data = user_data;
    struct aws_event_stream_client_connection_binding *binding = shutdown_data->binding;

    AWS_FATAL_ASSERT(binding->connection != NULL);

    AWS_LOGF_INFO(
        AWS_LS_NODEJS_CRT_GENERAL,
        "s_napi_event_stream_connection_on_connection_shutdown - event stream connection has completed shutdown");

    if (env && !binding->is_closed) {
        napi_value params[2];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        /*
         * If we can't resolve the weak ref to the event stream connection, then it's been garbage collected and we
         * should not do anything.
         */
        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_event_stream_client_connection_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            AWS_LOGF_INFO(
                AWS_LS_NODEJS_CRT_GENERAL,
                "s_napi_event_stream_connection_on_connection_shutdown - event_stream_client_connection node wrapper "
                "no longer resolvable");
            goto done;
        }

        AWS_NAPI_CALL(env, napi_create_uint32(env, shutdown_data->error_code, &params[1]), { goto done; });

        /* Unsure if the destruction of node_event_stream_client_connection_ref will impact the dispatch call */
        binding->is_closed = true;

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(
                env, binding->on_connection_shutdown, NULL, function, num_params, params));
    }

done:

    /*
     * Release our reference, which in this case, allows the connection to finally delete itself.
     */
    aws_event_stream_rpc_client_connection_release(binding->connection);
    binding->connection = NULL;

    /*
     * Our invariant is that for the time interval between attempting to connect and either
     *
     *  (1) connection establishment failed, or
     *  (2) connection establishment succeeded and some arbitrary time later, gets shutdown
     *
     * we maintain a ref on the binding itself, ie native event stream can safely invoke callbacks that are
     * guaranteed to reach a valid binding.
     *
     * It's trickier than normal because, while we acquire in a single spot (the connect() call), we release in
     * two very different spots:
     *
     *  (1) connection establishment failed: in s_napi_on_event_stream_client_connection_setup
     *  (2) connection establishment succeeded: here
     *
     * Additionally, we can only release when we're in the libuv thread.
     */
    s_aws_event_stream_client_connection_binding_release(binding);

    aws_mem_release(shutdown_data->allocator, shutdown_data);
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

static void s_aws_event_stream_rpc_client_connection_protocol_message_fn(
    struct aws_event_stream_rpc_client_connection *connection,
    const struct aws_event_stream_rpc_message_args *message_args,
    void *user_data) {

    (void)connection;
    (void)message_args;
    (void)user_data;
}

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

    napi_value node_connection_ref = NULL;
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
            aws_mem_release(allocator, binding);
            napi_throw_error(env, NULL, "event_stream_client_connection_new - Failed to create n-api external");
            goto done;
        });

    /* Arg #1: the js event stream connection */
    napi_value node_connection = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_connection)) {
        napi_throw_error(env, NULL, "event_stream_client_connection_new - Required connection parameter is null");
        goto done;
    }

    AWS_NAPI_CALL(
        env, napi_create_reference(env, node_connection, 1, &binding->node_event_stream_client_connection_ref), {
            napi_throw_error(
                env,
                NULL,
                "event_stream_client_connection_new - Failed to create reference to node event stream connection");
            goto done;
        });

    /* Arg #2: the event stream connection options object */
    napi_value node_connection_options = *arg++;
    if (aws_napi_is_null_or_undefined(env, node_connection_options)) {
        napi_throw_error(env, NULL, "event_stream_client_connection_new - Required options parameter is null");
        goto done;
    }

    if (s_init_event_stream_connection_configuration_from_js_connection_configuration(
            env, node_connection_options, binding)) {
        napi_throw_error(
            env,
            NULL,
            "event_stream_client_connection_new - failed to initialize native connection configuration from js "
            "connection configuration");
        goto done;
    }

    /* Arg #3: on disconnect event handler */
    napi_value on_connection_shutdown_event_handler = *arg++;
    if (aws_napi_is_null_or_undefined(env, on_connection_shutdown_event_handler)) {
        napi_throw_error(
            env, NULL, "event_stream_client_connection_new - required on_connection_shutdown event handler is null");
        goto done;
    }

    AWS_NAPI_CALL(
        env,
        aws_napi_create_threadsafe_function(
            env,
            on_connection_shutdown_event_handler,
            "aws_event_stream_client_connection_on_connection_shutdown",
            s_napi_event_stream_connection_on_connection_shutdown,
            NULL,
            &binding->on_connection_shutdown),
        {
            napi_throw_error(
                env,
                NULL,
                "event_stream_client_connection_new - failed to initialize on_connection_shutdown event handler");
            goto done;
        });

    /* Arg #4: on protocol message event handler */
    napi_value on_protocol_message_event_handler = *arg++;
    if (aws_napi_is_null_or_undefined(env, on_protocol_message_event_handler)) {
        napi_throw_error(
            env, NULL, "event_stream_client_connection_new - required on_protocol_message event handler is null");
        goto done;
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
            goto done;
        });

    /* Arg #5: socket options */
    napi_value node_socket_options = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_socket_options)) {
        struct aws_socket_options *socket_options_ptr = NULL;
        AWS_NAPI_CALL(env, napi_get_value_external(env, node_socket_options, (void **)&socket_options_ptr), {
            napi_throw_error(
                env, NULL, "event_stream_client_connection_new - Unable to extract socket_options from external");
            goto done;
        });

        if (socket_options_ptr == NULL) {
            napi_throw_error(env, NULL, "event_stream_client_connection_new - Null socket options");
            goto done;
        }

        binding->socket_options = *socket_options_ptr;
    }

    /* Arg #6: tls options */
    napi_value node_tls = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_tls)) {
        struct aws_tls_ctx *tls_ctx;
        AWS_NAPI_CALL(env, napi_get_value_external(env, node_tls, (void **)&tls_ctx), {
            napi_throw_error(env, NULL, "event_stream_client_connection_new - Failed to extract tls_ctx from external");
            goto done;
        });

        aws_tls_connection_options_init_from_ctx(&binding->tls_connection_options, tls_ctx);
        binding->using_tls = true;
    }

    AWS_NAPI_CALL(
        env, napi_create_reference(env, node_external, 1, &binding->node_event_stream_client_connection_external_ref), {
            napi_throw_error(
                env,
                NULL,
                "event_stream_client_connection_new - Failed to create one count reference to napi external");
            goto done;
        });

    node_connection_ref = node_external;

done:

    return node_connection_ref;
}

napi_value aws_napi_event_stream_client_connection_close(napi_env env, napi_callback_info info) {
    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(env, NULL, "aws_napi_event_stream_client_connection_close - Failed to retrieve arguments");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_event_stream_client_connection_close - needs exactly 1 argument");
        return NULL;
    }

    struct aws_event_stream_client_connection_binding *binding = NULL;
    napi_value node_binding = *arg++;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_binding, (void **)&binding), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_event_stream_client_connection_close - Failed to extract connection binding from first argument");
        return NULL;
    });

    if (binding == NULL) {
        napi_throw_error(env, NULL, "aws_napi_event_stream_client_connection_close - binding was null");
        return NULL;
    }

    /* This severs the ability to call back into JS and makes the binding's extern available for garbage collection */
    s_close_binding(env, binding);

    if (binding->connection != NULL) {
        aws_event_stream_rpc_client_connection_close(binding->connection, AWS_CRT_NODEJS_ERROR_EVENT_STREAM_USER_CLOSE);
    }

    return NULL;
}

/* An internal helper function that lets us fake socket closes (at least from the binding's perspective) */
napi_value aws_napi_event_stream_client_connection_close_internal(napi_env env, napi_callback_info info) {
    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(
            env, NULL, "aws_napi_event_stream_client_connection_close_internal - Failed to retrieve arguments");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(
            env, NULL, "aws_napi_event_stream_client_connection_close_internal - needs exactly 1 argument");
        return NULL;
    }

    struct aws_event_stream_client_connection_binding *binding = NULL;
    napi_value node_binding = *arg++;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_binding, (void **)&binding), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_event_stream_client_connection_close_internal - Failed to extract connection binding from first "
            "argument");
        return NULL;
    });

    if (binding == NULL) {
        napi_throw_error(env, NULL, "aws_napi_event_stream_client_connection_close_internal - binding was null");
        return NULL;
    }

    if (binding->connection != NULL) {
        aws_event_stream_rpc_client_connection_close(binding->connection, AWS_IO_SOCKET_CLOSED);
    }

    return NULL;
}

static void s_aws_event_stream_rpc_client_on_connection_shutdown_fn(
    struct aws_event_stream_rpc_client_connection *connection,
    int error_code,
    void *user_data) {

    struct aws_allocator *allocator = aws_napi_get_allocator();
    struct aws_event_stream_client_connection_binding *binding = user_data;

    struct aws_event_stream_connection_event_data *shutdown_data =
        aws_mem_calloc(allocator, 1, sizeof(struct aws_event_stream_connection_event_data));
    shutdown_data->allocator = allocator;
    shutdown_data->error_code = error_code;
    shutdown_data->binding = binding;       /* we already have a ref from the original connect call */
    shutdown_data->connection = connection; /* not really necessary with shutdown, but doesn't hurt */

    /* queue a callback in node's libuv thread */
    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_connection_shutdown, shutdown_data));
}

static void s_napi_on_event_stream_client_connection_setup(
    napi_env env,
    napi_value function,
    void *context,
    void *user_data) {

    (void)context;

    struct aws_event_stream_connection_event_data *setup_data = user_data;
    struct aws_event_stream_client_connection_binding *binding = setup_data->binding;

    /*
     * We took a reference to the connection when we initialized setup_data.  That is our reference; no need to take
     * one here.
     */
    binding->connection = setup_data->connection;

    if (env && !binding->is_closed) {
        napi_value params[2];
        const size_t num_params = AWS_ARRAY_SIZE(params);

        /*
         * If we can't resolve the weak ref to the event stream connection, then it's been garbage collected and we
         * should not do anything.
         */
        params[0] = NULL;
        if (napi_get_reference_value(env, binding->node_event_stream_client_connection_ref, &params[0]) != napi_ok ||
            params[0] == NULL) {
            AWS_LOGF_INFO(
                AWS_LS_NODEJS_CRT_GENERAL,
                "s_napi_on_event_stream_client_connection_setup - event_stream_client_connection node wrapper no "
                "longer resolvable");
            goto close;
        }

        AWS_NAPI_CALL(env, napi_create_uint32(env, setup_data->error_code, &params[1]), { goto close; });

        AWS_NAPI_ENSURE(
            env,
            aws_napi_dispatch_threadsafe_function(
                env, binding->on_connection_setup, NULL, function, num_params, params));

        /* Successful callback, skip ahead */
        goto done;
    }

close:

    /*
     * We hit here only if the JS object has been closed or there was a terminal failure in trying to invoke
     * the setup callback.  In all cases, log it, and shutdown the connection.
     */
    AWS_LOGF_INFO(
        AWS_LS_NODEJS_CRT_GENERAL,
        "s_napi_on_event_stream_client_connection_setup - node wrapper has been closed or hit a terminal failure, "
        "halting connection setup");

    /*
     * Close the connection, starting the shutdown process
     */
    if (binding->connection != NULL) {
        aws_event_stream_rpc_client_connection_close(binding->connection, AWS_CRT_NODEJS_ERROR_EVENT_STREAM_USER_CLOSE);
    }

done:

    /*
     * Our invariant is that for the time interval between attempting to connect and either
     *
     *  (1) connection establishment failed, or
     *  (2) connection establishment succeeded and some arbitrary time later, gets shutdown
     *
     * we maintain a ref on the binding itself, ie native event stream can safely invoke callbacks that are
     * guaranteed to reach a valid binding.
     *
     * It's trickier than normal because, while we acquire in a single spot (the connect() call), we release in
     * two very different spots:
     *
     *  (1) connection establishment failed: here
     *  (2) connection establishment succeeded: in s_napi_on_event_stream_client_connection_shutdown
     *
     * Important: in the case that we successfully connected but close had already been called, we don't release
     * the binding yet and instead let shutdown release it.
     */
    if (!setup_data->connection) {
        /*
         * Only release the binding if this was a failure to connect.
         */
        s_aws_event_stream_client_connection_binding_release(binding);
    }

    aws_mem_release(setup_data->allocator, setup_data);
}

static void s_aws_event_stream_rpc_client_on_connection_setup_fn(
    struct aws_event_stream_rpc_client_connection *connection,
    int error_code,
    void *user_data) {

    struct aws_allocator *allocator = aws_napi_get_allocator();
    struct aws_event_stream_client_connection_binding *binding = user_data;

    struct aws_event_stream_connection_event_data *setup_data =
        aws_mem_calloc(allocator, 1, sizeof(struct aws_event_stream_connection_event_data));
    setup_data->allocator = allocator;
    setup_data->error_code = error_code;
    setup_data->binding = binding; /* we already have a ref from the original connect call */
    setup_data->connection = connection;

    if (connection != NULL) {
        /*
         * We don't own the initial ref (the channel does, sigh).  While we are in setup data atm, this acquire
         * represents the binding's reference.
         */
        aws_event_stream_rpc_client_connection_acquire(setup_data->connection);
    }

    /* queue a callback in node's libuv thread */
    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(binding->on_connection_setup, setup_data));
}

napi_value aws_napi_event_stream_client_connection_connect(napi_env env, napi_callback_info info) {
    struct aws_allocator *allocator = aws_napi_get_allocator();

    napi_value node_args[2];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL), {
        napi_throw_error(
            env, NULL, "aws_napi_event_stream_client_connection_connect - Failed to extract parameter array");
        return NULL;
    });

    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_napi_event_stream_client_connection_connect - needs exactly 2 arguments");
        return NULL;
    }

    struct aws_event_stream_client_connection_binding *binding = NULL;
    napi_value node_binding = *arg++;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_binding, (void **)&binding), {
        napi_throw_error(
            env,
            NULL,
            "aws_napi_event_stream_client_connection_connect - Failed to extract connection binding from first "
            "argument");
        return NULL;
    });

    if (binding == NULL) {
        napi_throw_error(env, NULL, "aws_napi_event_stream_client_connection_connect - binding was null");
        return NULL;
    }

    if (binding->is_closed) {
        napi_throw_error(env, NULL, "aws_napi_event_stream_client_connection_connect - connection already closed");
        return NULL;
    }

    AWS_FATAL_ASSERT(binding->connection == NULL);

    napi_value connection_setup_callback = *arg++;
    AWS_NAPI_CALL(
        env,
        aws_napi_create_threadsafe_function(
            env,
            connection_setup_callback,
            "aws_event_stream_client_connection_on_connection_setup",
            s_napi_on_event_stream_client_connection_setup,
            binding,
            &binding->on_connection_setup),
        {
            napi_throw_error(
                env,
                NULL,
                "aws_napi_event_stream_client_connection_connect - failed to create threadsafe callback function");
            return NULL;
        });

    struct aws_tls_connection_options *tls_options = NULL;
    if (binding->using_tls) {
        tls_options = &binding->tls_connection_options;
    }

    struct aws_event_stream_rpc_client_connection_options connect_options = {
        .host_name = aws_string_c_str(binding->host),
        .port = binding->port,
        .socket_options = &binding->socket_options,
        .tls_options = tls_options,
        .bootstrap = aws_napi_get_default_client_bootstrap(),
        .on_connection_setup = s_aws_event_stream_rpc_client_on_connection_setup_fn,
        .on_connection_protocol_message = s_aws_event_stream_rpc_client_connection_protocol_message_fn,
        .on_connection_shutdown = s_aws_event_stream_rpc_client_on_connection_shutdown_fn,
        .user_data = binding,
    };

    s_aws_event_stream_client_connection_binding_acquire(binding);

    if (aws_event_stream_rpc_client_connection_connect(allocator, &connect_options)) {
        /* Undo the acquire just above */
        s_aws_event_stream_client_connection_binding_release(binding);
        aws_napi_throw_last_error_with_context(
            env,
            "aws_napi_event_stream_client_connection_connect - synchronous failure invoking "
            "aws_event_stream_rpc_client_connection_connect");
        return NULL;
    }

    return NULL;
}

napi_value aws_napi_event_stream_client_connection_send_protocol_message(napi_env env, napi_callback_info info) {
    (void)info;

    napi_throw_error(env, NULL, "aws_napi_event_stream_client_connection_send_protocol_message - NYI");

    return NULL;
}

napi_value aws_napi_event_stream_client_stream_new(napi_env env, napi_callback_info info) {
    (void)info;

    napi_throw_error(env, NULL, "aws_napi_event_stream_client_stream_new - NYI");

    return NULL;
}

napi_value aws_napi_event_stream_client_stream_close(napi_env env, napi_callback_info info) {
    (void)info;

    napi_throw_error(env, NULL, "aws_napi_event_stream_client_stream_close - NYI");

    return NULL;
}

napi_value aws_napi_event_stream_client_stream_activate(napi_env env, napi_callback_info info) {
    (void)info;

    napi_throw_error(env, NULL, "aws_napi_event_stream_client_stream_activate - NYI");

    return NULL;
}

napi_value aws_napi_event_stream_client_stream_send_message(napi_env env, napi_callback_info info) {
    (void)info;

    napi_throw_error(env, NULL, "aws_napi_event_stream_client_stream_send_message - NYI");

    return NULL;
}
