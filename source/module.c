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
#include "mqtt_client.h"
#include "mqtt_client_connection.h"

#include <aws/common/clock.h>
#include <aws/common/logging.h>

#include <aws/io/event_loop.h>
#include <aws/io/tls_channel_handler.h>

#include <aws/http/http.h>

#include <uv.h>

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

/* Helper to call an napi function and handle the result. Assumes no cleanup step to perform. */
#define NAPI_CHECK_CALL(expr)                                                                                          \
    do {                                                                                                               \
        napi_status _status = (expr);                                                                                  \
        if (_status != napi_ok) {                                                                                      \
            return _status;                                                                                            \
        }                                                                                                              \
    } while (false)

napi_status aws_byte_buf_init_from_napi(struct aws_byte_buf *buf, napi_env env, napi_value node_str) {

    AWS_ASSERT(buf);

    napi_valuetype type = napi_undefined;
    NAPI_CHECK_CALL(napi_typeof(env, node_str, &type));

    if (type == napi_string) {

        size_t length = 0;
        NAPI_CHECK_CALL(napi_get_value_string_utf8(env, node_str, NULL, 0, &length));

        /* Node requires that the null terminator be written */
        if (aws_byte_buf_init(buf, aws_default_allocator(), length + 1)) {
            return napi_generic_failure;
        }

        NAPI_CHECK_CALL(napi_get_value_string_utf8(env, node_str, (char *)buf->buffer, buf->capacity, &buf->len));
        AWS_ASSERT(length == buf->len);
        return napi_ok;

    } else if (type == napi_object) {

        bool is_expected = false;

        /* Try ArrayBuffer */
        NAPI_CHECK_CALL(napi_is_arraybuffer(env, node_str, &is_expected));
        if (is_expected) {
            napi_status status = napi_get_arraybuffer_info(env, node_str, (void **)&buf->buffer, &buf->len);
            buf->capacity = buf->len;
            return status;
        }

        /* Try DataView */
        NAPI_CHECK_CALL(napi_is_dataview(env, node_str, &is_expected));
        if (is_expected) {
            napi_status status = napi_get_dataview_info(env, node_str, &buf->len, (void **)&buf->buffer, NULL, NULL);
            buf->capacity = buf->len;
            return status;
        }

        /* Try TypedArray */
        NAPI_CHECK_CALL(napi_is_typedarray(env, node_str, &is_expected));
        if (is_expected) {
            napi_typedarray_type type = napi_uint8_array;
            size_t length = 0;
            NAPI_CHECK_CALL(napi_get_typedarray_info(env, node_str, &type, &length, (void **)&buf->buffer, NULL, NULL));

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
    NAPI_CHECK_CALL(napi_create_arraybuffer(env, cur->len, &data, &arraybuffer));

    struct aws_byte_buf arraybuffer_buf = aws_byte_buf_from_empty_array(data, cur->len);
    struct aws_byte_cursor input = *cur;
    if (!aws_byte_buf_write_from_whole_cursor(&arraybuffer_buf, input)) {
        return napi_generic_failure;
    }

    NAPI_CHECK_CALL(napi_create_dataview(env, cur->len, arraybuffer, 0, result));

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
    }
    return reason;
}

int aws_napi_callback_init(
    struct aws_napi_callback *cb,
    napi_env env,
    napi_value callback,
    const char *name,
    aws_napi_callback_params_builder *build_params) {

    cb->env = env;
    cb->build_params = build_params;

    napi_value resource_name = NULL;
    if (napi_create_string_utf8(env, name, NAPI_AUTO_LENGTH, &resource_name)) {
        napi_throw_error(env, NULL, "Could not create string to name async resource");
        goto failure;
    }
    if (napi_async_init(env, NULL, resource_name, &cb->async_context)) {
        napi_throw_error(env, NULL, "Could not initialize async context");
        goto failure;
    }
    if (napi_create_reference(env, callback, 1, &cb->callback)) {
        napi_throw_error(env, NULL, "Could not create reference to callback");
        goto failure;
    }

    return AWS_OP_SUCCESS;

failure:
    aws_napi_callback_clean_up(cb);
    return AWS_OP_ERR;
}

int aws_napi_callback_clean_up(struct aws_napi_callback *cb) {
    if (cb->env) {
        napi_handle_scope handle_scope = NULL;
        AWS_FATAL_ASSERT(napi_ok == napi_open_handle_scope(cb->env, &handle_scope));
        if (cb->async_context) {
            napi_async_destroy(cb->env, cb->async_context);
        }
        if (cb->callback) {
            napi_delete_reference(cb->env, cb->callback);
        }
        napi_close_handle_scope(cb->env, handle_scope);
    }

    AWS_ZERO_STRUCT(*cb);
    return AWS_OP_SUCCESS;
}

static void s_handle_failed_callback(napi_env env, napi_status status) {
    /* Figure out if there's an exception pending, if so, no callbacks will ever succeed again until it's cleared */
    bool pending_exception = status == napi_pending_exception;
    if ((status = napi_is_exception_pending(env, &pending_exception))) {
        AWS_LOGF_ERROR(AWS_LS_NODE, "napi_is_exception_pending failed: %s", aws_napi_status_to_str(status));
        return;
    }
    /* if there's no pending exception, but failure occurred, log what we can find and get out */
    if (!pending_exception) {
        const napi_extended_error_info *node_error_info = NULL;
        if ((status = napi_get_last_error_info(env, &node_error_info))) {
            AWS_LOGF_ERROR(AWS_LS_NODE, "napi_get_last_error_info failed: %s", aws_napi_status_to_str(status));
        }
        AWS_LOGF_ERROR(
            AWS_LS_NODE,
            "Extended error info: engine_error_code=%u error_code=%s error_message=%s",
            node_error_info->engine_error_code,
            aws_napi_status_to_str(node_error_info->error_code),
            node_error_info->error_message);
        return;
    }
    /* get the current exception and report it, and clear it so that execution can continue */
    napi_value node_exception = NULL;
    if ((status = napi_get_and_clear_last_exception(env, &node_exception))) {
        AWS_LOGF_ERROR(AWS_LS_NODE, "napi_get_and_clear_last_exception failed: %s", aws_napi_status_to_str(status));
        return;
    }
    /* figure out what the exception is */
    bool is_error = false;
    if ((status = napi_is_error(env, node_exception, &is_error))) {
        AWS_LOGF_ERROR(AWS_LS_NODE, "napi_is_error failed: %s", aws_napi_status_to_str(status));
        return;
    }

    /* If it's an Error, extract info from it and log it */
    if (is_error) {
        /* get the Error.message field */
        napi_value node_message_key = NULL;
        if ((status = napi_create_string_utf8(env, "message", NAPI_AUTO_LENGTH, &node_message_key))) {
            AWS_LOGF_ERROR(
                AWS_LS_NODE, "napi_create_string_utf8('message') failed: %s", aws_napi_status_to_str(status));
            return;
        }
        napi_value node_message = NULL;
        if ((status = napi_get_property(env, node_exception, node_message_key, &node_message))) {
            AWS_LOGF_ERROR(
                AWS_LS_NODE, "napi_get_property(exception, 'message') failed: %s", aws_napi_status_to_str(status));
            return;
        }
        /* extract and log the message */
        struct aws_string *message = NULL;
        if ((message = aws_string_new_from_napi(env, node_message))) {
            AWS_LOGF_ERROR(AWS_LS_NODE, "Error: %s", aws_string_bytes(message));
            aws_string_destroy(message);
        } else {
            AWS_LOGF_ERROR(AWS_LS_NODE, "aws_string_new_from_napi(exception.message) failed");
            return;
        }

        /* get the Error.stack field */
        napi_value node_stack_key = NULL;
        if ((status = napi_create_string_utf8(env, "stack", NAPI_AUTO_LENGTH, &node_stack_key))) {
            AWS_LOGF_ERROR(AWS_LS_NODE, "napi_create_string_utf8('stack'): failed: %s", aws_napi_status_to_str(status));
            return;
        }
        napi_value node_stack = NULL;
        if ((status = napi_get_property(env, node_exception, node_stack_key, &node_stack))) {
            AWS_LOGF_ERROR(
                AWS_LS_NODE, "napi_get_property(exception, 'stack') failed: %s", aws_napi_status_to_str(status));
            return;
        }
        /* extract and log the stack trace */
        struct aws_string *stacktrace = NULL;
        if ((stacktrace = aws_string_new_from_napi(env, node_stack))) {
            AWS_LOGF_ERROR(AWS_LS_NODE, "Stack:\n%s", aws_string_bytes(stacktrace));
            aws_string_destroy(stacktrace);
        } else {
            AWS_LOGF_ERROR(AWS_LS_NODE, "aws_string_new_from_napi(exception.stack) failed");
            return;
        }
        /* the Error has been reported and cleared, that's all we can do */
        return;
    }

    /* The last thing thrown was some other sort of object/primitive, so convert it to a string and log it */
    napi_value node_error_str = NULL;
    if ((status = napi_coerce_to_string(env, node_exception, &node_error_str))) {
        AWS_LOGF_ERROR(AWS_LS_NODE, "napi_coerce_to_string(exception) failed: %s", aws_napi_status_to_str(status));
        return;
    }
    struct aws_string *error_str = NULL;
    if ((error_str = aws_string_new_from_napi(env, node_error_str))) {
        AWS_LOGF_ERROR(AWS_LS_NODE, "Error: %s", aws_string_bytes(error_str));
    } else {
        AWS_LOGF_ERROR(AWS_LS_NODE, "aws_string_new_from_napi(ToString(exception)) failed");
        return;
    }
}

int aws_napi_callback_dispatch(struct aws_napi_callback *cb, void *user_data) {
    if (!cb->callback) {
        return AWS_OP_SUCCESS;
    }

    napi_env env = cb->env;
    napi_handle_scope handle_scope = NULL;
    napi_callback_scope callback_scope = NULL;
    int result = AWS_OP_ERR;
    napi_status status = napi_ok;

    if ((status = napi_open_handle_scope(env, &handle_scope))) {
        AWS_LOGF_ERROR(AWS_LS_NODE, "napi_open_handle_scope failed: %s", aws_napi_status_to_str(status));
        goto cleanup;
    }

    napi_value node_function = NULL;
    if ((status = napi_get_reference_value(env, cb->callback, &node_function))) {
        AWS_LOGF_ERROR(AWS_LS_NODE, "napi_get_reference_value(callback) failed: %s", aws_napi_status_to_str(status));
        goto cleanup;
    }
    if (!node_function) {
        AWS_LOGF_ERROR(AWS_LS_NODE, "Unable to resolve target function for callback");
        goto cleanup;
    }

    napi_value resource_object = NULL;
    if ((status = napi_create_object(env, &resource_object))) {
        AWS_LOGF_ERROR(AWS_LS_NODE, "napi_create_object(resource_object) failed: %s", aws_napi_status_to_str(status));
        goto cleanup;
    }

    if ((status = napi_open_callback_scope(env, resource_object, cb->async_context, &callback_scope))) {
        AWS_LOGF_ERROR(AWS_LS_NODE, "napi_open_callback_scope failed: %s", aws_napi_status_to_str(status));
        goto cleanup;
    }

    napi_value this_object = NULL;
    if ((status = napi_get_global(env, &this_object))) {
        AWS_LOGF_ERROR(
            AWS_LS_NODE,
            "Unable to get global this scope for callback: napi_get_global failed: %s",
            aws_napi_status_to_str(status));
        goto cleanup;
    }

    napi_value params[16];
    size_t num_params = 0;
    if (cb->build_params(env, params, &num_params, user_data)) {
        AWS_LOGF_ERROR(AWS_LS_NODE, "Unable to prepare params for callback");
        goto cleanup;
    }
    AWS_FATAL_ASSERT(num_params < AWS_ARRAY_SIZE(params));

    if ((status = napi_make_callback(env, cb->async_context, this_object, node_function, num_params, params, NULL))) {
        AWS_LOGF_ERROR(
            AWS_LS_NODE, "Callback invocation failed: napi_make_callback failed: %s", aws_napi_status_to_str(status));
        s_handle_failed_callback(env, status);
        goto cleanup;
    }

    result = AWS_OP_SUCCESS;

cleanup:
    if (callback_scope) {
        if ((status = napi_close_callback_scope(env, callback_scope))) {
            AWS_LOGF_ERROR(AWS_LS_NODE, "napi_close_callback_scope failed: %s", aws_napi_status_to_str(status));
        }
    }
    if (handle_scope) {
        if ((status = napi_close_handle_scope(env, handle_scope))) {
            AWS_LOGF_ERROR(AWS_LS_NODE, "napi_close_handle_scope failed: %s", aws_napi_status_to_str(status));
        }
    }

    return result;
}

/** Helper for creating and registering a function */
static bool s_create_and_register_function(
    napi_env env,
    napi_value exports,
    napi_callback fn,
    const char *fn_name,
    size_t fn_name_len) {

    napi_value napi_fn;
    napi_status status = napi_create_function(env, fn_name, fn_name_len, fn, NULL, &napi_fn);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap native function");
        return false;
    }

    status = napi_set_named_property(env, exports, fn_name, napi_fn);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to populate exports");
        return false;
    }

    return true;
}

napi_value s_register_napi_module(napi_env env, napi_value exports) {

    struct aws_allocator *allocator = aws_default_allocator();
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

NAPI_MODULE(aws_crt_nodejs, s_register_napi_module)
