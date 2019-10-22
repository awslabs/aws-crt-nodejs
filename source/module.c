/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

#include "module.h"

#include "crypto.h"
#include "http_connection.h"
#include "http_connection_manager.h"
#include "http_stream.h"
#include "io.h"
#include "logger.h"
#include "mqtt_client.h"
#include "mqtt_client_connection.h"

#include <aws/common/clock.h>
#include <aws/common/logging.h>

#include <aws/io/event_loop.h>
#include <aws/io/tls_channel_handler.h>

#include <aws/http/http.h>

#include <uv.h>

/* aws-crt-nodejs requires N-API version 4 or above for the threadsafe function API */
AWS_STATIC_ASSERT(NAPI_VERSION >= 4);

static struct aws_log_subject_info s_log_subject_infos[] = {
    DEFINE_LOG_SUBJECT_INFO(AWS_LS_NODE, "node", "Node/N-API failures"),
};

static struct aws_log_subject_info_list s_log_subject_list = {
    .subject_list = s_log_subject_infos,
    .count = AWS_ARRAY_SIZE(s_log_subject_infos),
};

static uv_loop_t *s_node_uv_loop = NULL;
static struct aws_event_loop *s_node_uv_event_loop = NULL;
static struct aws_event_loop_group s_node_uv_elg;

napi_status aws_byte_buf_init_from_napi(struct aws_byte_buf *buf, napi_env env, napi_value node_str) {

    AWS_ASSERT(buf);

    napi_valuetype type = napi_undefined;
    AWS_NAPI_CALL(env, napi_typeof(env, node_str, &type), { return status; });

    if (type == napi_string) {

        size_t length = 0;
        AWS_NAPI_CALL(env, napi_get_value_string_utf8(env, node_str, NULL, 0, &length), { return status; });

        /* Node requires that the null terminator be written */
        if (aws_byte_buf_init(buf, aws_default_allocator(), length + 1)) {
            return napi_generic_failure;
        }

        AWS_NAPI_CALL(env, napi_get_value_string_utf8(env, node_str, (char *)buf->buffer, buf->capacity, &buf->len), {
            return status;
        });
        AWS_ASSERT(length == buf->len);
        return napi_ok;

    } else if (type == napi_object) {

        bool is_expected = false;

        /* Try ArrayBuffer */
        AWS_NAPI_CALL(env, napi_is_arraybuffer(env, node_str, &is_expected), { return status; });
        if (is_expected) {
            napi_status status = napi_get_arraybuffer_info(env, node_str, (void **)&buf->buffer, &buf->len);
            buf->capacity = buf->len;
            return status;
        }

        /* Try DataView */
        AWS_NAPI_CALL(env, napi_is_dataview(env, node_str, &is_expected), { return status; });
        if (is_expected) {
            napi_status status = napi_get_dataview_info(env, node_str, &buf->len, (void **)&buf->buffer, NULL, NULL);
            buf->capacity = buf->len;
            return status;
        }

        /* Try TypedArray */
        AWS_NAPI_CALL(env, napi_is_typedarray(env, node_str, &is_expected), { return status; });
        if (is_expected) {
            napi_typedarray_type type = napi_uint8_array;
            size_t length = 0;
            AWS_NAPI_CALL(
                env, napi_get_typedarray_info(env, node_str, &type, &length, (void **)&buf->buffer, NULL, NULL), {
                    return status;
                });

            size_t element_size = 0;

            /* whoever added napi_bigint64_array to the node api deserves a good thrashing!!!! */
            int type_hack = type;
            switch (type_hack) {
                case napi_int8_array:
                case napi_uint8_array:
                case napi_uint8_clamped_array:
                    element_size = 1;
                    break;

                case napi_int16_array:
                case napi_uint16_array:
                    element_size = 2;
                    break;

                case napi_int32_array:
                case napi_uint32_array:
                case napi_float32_array:
                    element_size = 4;
                    break;

                case napi_float64_array:
                case 9:  /*napi_bigint64_array */
                case 10: /*napi_biguint64_array*/
                    element_size = 8;
                    break;
            }
            buf->len = length * element_size;
            buf->capacity = buf->len;

            return napi_ok;
        }
    }

    return napi_invalid_arg;
}

struct aws_string *aws_string_new_from_napi(napi_env env, napi_value node_str) {

    struct aws_byte_buf temp_buf;
    if (aws_byte_buf_init_from_napi(&temp_buf, env, node_str)) {
        return NULL;
    }

    struct aws_string *string = aws_string_new_from_array(aws_default_allocator(), temp_buf.buffer, temp_buf.len);
    aws_byte_buf_clean_up(&temp_buf);
    return string;
}

napi_status aws_napi_create_dataview_from_byte_cursor(
    napi_env env,
    const struct aws_byte_cursor *cur,
    napi_value *result) {

    void *data = NULL;
    napi_value arraybuffer;
    AWS_NAPI_CALL(env, napi_create_arraybuffer(env, cur->len, &data, &arraybuffer), { return status; });

    struct aws_byte_buf arraybuffer_buf = aws_byte_buf_from_empty_array(data, cur->len);
    struct aws_byte_cursor input = *cur;
    if (!aws_byte_buf_write_from_whole_cursor(&arraybuffer_buf, input)) {
        return napi_generic_failure;
    }

    AWS_NAPI_CALL(env, napi_create_dataview(env, cur->len, arraybuffer, 0, result), { return status; });

    return napi_ok;
}

bool aws_napi_is_null_or_undefined(napi_env env, napi_value value) {

    napi_valuetype type = napi_undefined;
    if (napi_ok != napi_typeof(env, value, &type)) {
        return true;
    }

    return type == napi_null || type == napi_undefined;
}

void aws_napi_throw_last_error(napi_env env) {
    const int error_code = aws_last_error();
    napi_throw_error(env, aws_error_str(error_code), aws_error_debug_str(error_code));
}

struct uv_loop_s *aws_napi_get_node_uv_loop(void) {
    return s_node_uv_loop;
}
struct aws_event_loop *aws_napi_get_node_event_loop(void) {
    return s_node_uv_event_loop;
}
struct aws_event_loop_group *aws_napi_get_node_elg(void) {
    return &s_node_uv_elg;
}

const char *aws_napi_status_to_str(napi_status status) {
    const char *reason = "UNKNOWN";
    switch (status) {
        case napi_ok:
            reason = "OK";
            break;
        case napi_invalid_arg:
            reason = "napi_invalid_arg: an invalid argument was supplied";
            break;
        case napi_object_expected:
            reason = "napi_object_expected";
            break;
        case napi_string_expected:
            reason = "napi_name_expected";
            break;
        case napi_name_expected:
            reason = "napi_name_expected";
            break;
        case napi_function_expected:
            reason = "napi_function_expected";
            break;
        case napi_number_expected:
            reason = "napi_number_expected";
            break;
        case napi_boolean_expected:
            reason = "napi_boolean_expected";
            break;
        case napi_array_expected:
            reason = "napi_array_expected";
            break;
        case napi_generic_failure:
            reason = "napi_generic_failure";
            break;
        case napi_pending_exception:
            reason = "napi_pending_exception";
            break;
        case napi_cancelled:
            reason = "napi_cancelled";
            break;
        case napi_escape_called_twice:
            reason = "napi_escape_called_twice";
            break;
        case napi_handle_scope_mismatch:
            reason = "napi_handle_scope_mismatch";
            break;
        case napi_callback_scope_mismatch:
            reason = "napi_callback_scope_mismatch";
            break;
#if NAPI_VERSION >= 3
        case napi_queue_full:
            reason = "napi_queue_full";
            break;
        case napi_closing:
            reason = "napi_closing";
            break;
        case napi_bigint_expected:
            reason = "napi_bigint_expected";
            break;
#endif
    }
    return reason;
}

static void s_handle_failed_callback(napi_env env, napi_value function, napi_status status) {
    /* Figure out if there's an exception pending, if so, no callbacks will ever succeed again until it's cleared */
    bool pending_exception = status == napi_pending_exception;
    AWS_NAPI_ENSURE(env, napi_is_exception_pending(env, &pending_exception));
    /* if there's no pending exception, but failure occurred, log what we can find and get out */
    if (!pending_exception) {
        const napi_extended_error_info *node_error_info = NULL;
        AWS_NAPI_ENSURE(env, napi_get_last_error_info(env, &node_error_info));
        AWS_NAPI_LOGF_ERROR(
            "Extended error info: engine_error_code=%u error_code=%s error_message=%s",
            node_error_info->engine_error_code,
            aws_napi_status_to_str(node_error_info->error_code),
            node_error_info->error_message);
        return;
    }
    /* get the current exception and report it, and clear it so that execution can continue */
    napi_value node_exception = NULL;
    AWS_NAPI_ENSURE(env, napi_get_and_clear_last_exception(env, &node_exception));

    /* figure out what the exception is */
    bool is_error = false;
    AWS_NAPI_ENSURE(env, napi_is_error(env, node_exception, &is_error));

    /* 
     * Convert the function to a string. If it's a lambda, this will produce the source of the lambda, if
     * it's a class function or free function, it will produce the name 
     */
    napi_value node_function_str = NULL;
    AWS_NAPI_ENSURE(env, napi_coerce_to_string(env, function, &node_function_str));
    struct aws_string *function_str = aws_string_new_from_napi(env, node_function_str);
    if (function_str) {
        AWS_NAPI_LOGF_ERROR("Calling %s", (const char *)aws_string_bytes(function_str));
    }

    /* If it's an Error, extract info from it and log it */
    if (is_error) {
        /* get the Error.message field */
        napi_value node_message = NULL;
        AWS_NAPI_ENSURE(env, napi_get_named_property(env, node_exception, "message", &node_message));

        /* extract and log the message */
        struct aws_string *message = NULL;
        if ((message = aws_string_new_from_napi(env, node_message))) {
            AWS_NAPI_LOGF_ERROR("Error: %s", aws_string_bytes(message));
            aws_string_destroy(message);
        } else {
            AWS_NAPI_LOGF_ERROR("aws_string_new_from_napi(exception.message) failed");
            return;
        }

        /* get the Error.stack field */
        napi_value node_stack = NULL;
        AWS_NAPI_ENSURE(env, napi_get_named_property(env, node_exception, "stack", &node_stack));

        /* extract and log the stack trace */
        struct aws_string *stacktrace = NULL;
        if ((stacktrace = aws_string_new_from_napi(env, node_stack))) {
            AWS_NAPI_LOGF_ERROR("Stack:\n%s", aws_string_bytes(stacktrace));
            aws_string_destroy(stacktrace);
        } else {
            AWS_NAPI_LOGF_ERROR("aws_string_new_from_napi(exception.stack) failed");
            return;
        }

        /* the Error has been reported and cleared, that's all we can do */
        return;
    }

    /* The last thing thrown was some other sort of object/primitive, so convert it to a string and log it */
    napi_value node_error_str = NULL;
    AWS_NAPI_ENSURE(env, napi_coerce_to_string(env, node_exception, &node_error_str));

    struct aws_string *error_str = NULL;
    if ((error_str = aws_string_new_from_napi(env, node_error_str))) {
        AWS_NAPI_LOGF_ERROR("Error: %s", aws_string_bytes(error_str));
    } else {
        AWS_NAPI_LOGF_ERROR("aws_string_new_from_napi(ToString(exception)) failed");
        return;
    }
}

napi_status aws_napi_dispatch_threadsafe_function(
    napi_env env,
    napi_threadsafe_function tsfn,
    napi_value this_ptr,
    napi_value function,
    size_t argc,
    napi_value *argv) {

    napi_status call_status = napi_ok;
    if (!this_ptr) {
        AWS_NAPI_ENSURE(env, napi_get_undefined(env, &this_ptr));
    }
    AWS_NAPI_CALL(env, napi_call_function(env, this_ptr, function, argc, argv, NULL), {
        call_status = status;
        s_handle_failed_callback(env, function, status);
    });
    /* Must always decrement the ref count, or the function will be pinned */
    napi_status release_status = napi_release_threadsafe_function(tsfn, napi_tsfn_release);
    return (call_status != napi_ok) ? call_status : release_status;
}

napi_status aws_napi_create_threadsafe_function(
    napi_env env,
    napi_value function,
    const char *name,
    napi_threadsafe_function_call_js call_js,
    void *context,
    napi_threadsafe_function *result) {

    napi_value resource_name = NULL;
    AWS_NAPI_ENSURE(env, napi_create_string_utf8(env, name, NAPI_AUTO_LENGTH, &resource_name));

    AWS_NAPI_CALL(
        env,
        napi_create_threadsafe_function(env, function, NULL, resource_name, 0, 1, NULL, NULL, context, call_js, result),
        { return status; });
    /* convert to a weak reference */
    return napi_unref_threadsafe_function(env, *result);
}

napi_status aws_napi_queue_threadsafe_function(napi_threadsafe_function function, void *user_data) {
    /* increase the ref count, gets decreased when the call completes */
    AWS_NAPI_ENSURE(env, napi_acquire_threadsafe_function(function));
    return napi_call_threadsafe_function(function, user_data, napi_tsfn_nonblocking);
}

static void s_napi_context_finalize(napi_env env, void *user_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;
    struct aws_napi_context *ctx = user_data;
    aws_napi_logger_destroy(ctx->logger);
    aws_mem_release(ctx->allocator, ctx);
}

static struct aws_napi_context *s_napi_context_new(struct aws_allocator *allocator, napi_env env, napi_value exports) {
    struct aws_napi_context *ctx = aws_mem_calloc(allocator, 1, sizeof(struct aws_napi_context));
    AWS_FATAL_ASSERT(ctx && "Failed to initialize napi context");
    ctx->allocator = allocator;

    /* bind the context to exports, thus binding its lifetime to that object */
    AWS_NAPI_ENSURE(env, napi_wrap(env, exports, ctx, s_napi_context_finalize, NULL, NULL));

    ctx->logger = aws_napi_logger_new(allocator, env);

    return ctx;
}

/** Helper for creating and registering a function */
static bool s_create_and_register_function(
    napi_env env,
    napi_value exports,
    napi_callback fn,
    const char *fn_name,
    size_t fn_name_len) {

    napi_value napi_fn;
    AWS_NAPI_CALL(env, napi_create_function(env, fn_name, fn_name_len, fn, NULL, &napi_fn), {
        napi_throw_error(env, NULL, "Unable to wrap native function");
        return false;
    });

    AWS_NAPI_CALL(env, napi_set_named_property(env, exports, fn_name, napi_fn), {
        napi_throw_error(env, NULL, "Unable to populate exports");
        return false;
    });

    return true;
}

/* napi_value */ NAPI_MODULE_INIT() /* (napi_env env, napi_value exports) */ {

    struct aws_allocator *allocator = aws_default_allocator();
    /* context is bound to exports, will be cleaned up by finalizer */
    s_napi_context_new(allocator, env, exports);

    aws_http_library_init(allocator);
    aws_mqtt_library_init(allocator);
    aws_register_log_subject_info_list(&s_log_subject_list);

    /* Initalize the event loop group */
    aws_event_loop_group_default_init(&s_node_uv_elg, allocator, 1);

    napi_value null;
    napi_get_null(env, &null);

#define CREATE_AND_REGISTER_FN(fn)                                                                                     \
    if (!s_create_and_register_function(env, exports, aws_napi_##fn, #fn, sizeof(#fn))) {                              \
        return null;                                                                                                   \
    }

    /* IO */
    CREATE_AND_REGISTER_FN(error_code_to_string)
    CREATE_AND_REGISTER_FN(error_code_to_name)
    CREATE_AND_REGISTER_FN(io_logging_enable)
    CREATE_AND_REGISTER_FN(is_alpn_available)
    CREATE_AND_REGISTER_FN(io_client_bootstrap_new)
    CREATE_AND_REGISTER_FN(io_client_tls_ctx_new)
    CREATE_AND_REGISTER_FN(io_socket_options_new)
    CREATE_AND_REGISTER_FN(io_input_stream_new)
    CREATE_AND_REGISTER_FN(io_input_stream_append)

    /* MQTT Client */
    CREATE_AND_REGISTER_FN(mqtt_client_new)

    /* MQTT Client Connection */
    CREATE_AND_REGISTER_FN(mqtt_client_connection_new)
    CREATE_AND_REGISTER_FN(mqtt_client_connection_connect)
    CREATE_AND_REGISTER_FN(mqtt_client_connection_reconnect)
    CREATE_AND_REGISTER_FN(mqtt_client_connection_publish)
    CREATE_AND_REGISTER_FN(mqtt_client_connection_subscribe)
    CREATE_AND_REGISTER_FN(mqtt_client_connection_unsubscribe)
    CREATE_AND_REGISTER_FN(mqtt_client_connection_disconnect)
    CREATE_AND_REGISTER_FN(mqtt_client_connection_close)

    /* Crypto */
    CREATE_AND_REGISTER_FN(hash_md5_new)
    CREATE_AND_REGISTER_FN(hash_sha256_new)
    CREATE_AND_REGISTER_FN(hash_update)
    CREATE_AND_REGISTER_FN(hash_digest)
    CREATE_AND_REGISTER_FN(hash_md5_compute)
    CREATE_AND_REGISTER_FN(hash_sha256_compute)
    CREATE_AND_REGISTER_FN(hmac_sha256_new)
    CREATE_AND_REGISTER_FN(hmac_update)
    CREATE_AND_REGISTER_FN(hmac_digest)
    CREATE_AND_REGISTER_FN(hmac_sha256_compute)

    /* HTTP */
    CREATE_AND_REGISTER_FN(http_connection_new)
    CREATE_AND_REGISTER_FN(http_connection_close)
    CREATE_AND_REGISTER_FN(http_stream_new)
    CREATE_AND_REGISTER_FN(http_stream_close)
    CREATE_AND_REGISTER_FN(http_connection_manager_new)
    CREATE_AND_REGISTER_FN(http_connection_manager_close)
    CREATE_AND_REGISTER_FN(http_connection_manager_acquire)
    CREATE_AND_REGISTER_FN(http_connection_manager_release)

#undef CREATE_AND_REGISTER_FN

    return exports;
}
