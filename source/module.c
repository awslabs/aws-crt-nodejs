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
#include "crypto.h"
#include "io.h"
#include "mqtt_client.h"
#include "mqtt_client_connection.h"

#include <aws/common/clock.h>

#include <assert.h>
#include <aws/io/event_loop.h>
#include <aws/io/tls_channel_handler.h>
#include <uv.h>

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

    assert(buf);

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
        assert(length == buf->len);
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
            switch (type) {
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
                case napi_bigint64_array:
                case napi_biguint64_array:
                    element_size = 8;
                    break;
            }
            buf->len = length * element_size;
            buf->capacity = buf->len;

            return napi_ok;
        }
    }

    return napi_ok;
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

    aws_load_error_strings();
    aws_io_load_error_strings();

    struct aws_allocator *allocator = aws_default_allocator();
    aws_tls_init_static_state(aws_default_allocator());
    aws_mqtt_library_init(allocator);

    /* Initalize the event loop group */
    aws_event_loop_group_default_init(&s_node_uv_elg, allocator, 1);

    napi_value null;
    napi_get_null(env, &null);

#define CREATE_AND_REGISTER_FN(fn)                                                                                     \
    if (!s_create_and_register_function(env, exports, fn, #fn, sizeof(#fn))) {                                         \
        return null;                                                                                                   \
    }

    /* IO */
    CREATE_AND_REGISTER_FN(error_code_to_string)
    CREATE_AND_REGISTER_FN(is_alpn_available)
    CREATE_AND_REGISTER_FN(io_client_bootstrap_new)
    CREATE_AND_REGISTER_FN(io_client_tls_ctx_new)

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

#undef CREATE_AND_REGISTER_FN

    return exports;
}

NAPI_MODULE(aws_crt_nodejs, s_register_napi_module)
