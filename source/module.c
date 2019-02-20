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
#include "io.h"
#include "mqtt_client.h"
#include "mqtt_client_connection.h"

#include <uv.h>

#include <aws/common/clock.h>

#include <aws/io/event_loop.h>
#include <aws/io/tls_channel_handler.h>

static uv_loop_t *s_node_uv_loop = NULL;
static struct aws_event_loop *s_node_uv_event_loop = NULL;
static struct aws_event_loop_group s_node_uv_elg;

napi_status aws_byte_buf_init_from_napi(struct aws_byte_buf *buf, napi_env env, napi_value node_str) {

    assert(buf);

    napi_status result = napi_ok;

    size_t length = 0;
    result = napi_get_value_string_utf8(env, node_str, NULL, 0, &length);
    if (result != napi_ok) {
        return result;
    }

    aws_byte_buf_init(buf, aws_default_allocator(), length + 1);

    result = napi_get_value_string_utf8(env, node_str, (char *)buf->buffer, buf->len, &buf->len);
    assert(result == napi_ok);
    assert(length == buf->len);

    return result;
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

static struct aws_event_loop *s_new_uv_event_loop(struct aws_allocator *alloc, aws_io_clock_fn *clock, void *userdata) {

    napi_env env = userdata;

    if (!s_node_uv_loop) {
        if (napi_get_uv_event_loop(env, &s_node_uv_loop)) {
            return NULL;
        }
    }

    if (!s_node_uv_event_loop) {
        s_node_uv_event_loop = aws_event_loop_existing_libuv(alloc, s_node_uv_loop, clock);
    } else {
        assert(false); /* Should only be 1 event loop */
    }

    return s_node_uv_event_loop;
}

/** Helper for creating and registering a function */
static bool s_create_and_register_function(napi_env env, napi_value exports, napi_callback fn, const char *fn_name, size_t fn_name_len) {
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
    aws_mqtt_load_error_strings();

    aws_tls_init_static_state(aws_default_allocator());

    /* Initalize the event loop group */
    aws_event_loop_group_init(&s_node_uv_elg, aws_default_allocator(), aws_high_res_clock_get_ticks, 1, s_new_uv_event_loop, env);

    napi_value null;
    napi_get_null(env, &null);

#define CREATE_AND_REGISTER_FN(fn) if (!s_create_and_register_function(env, exports, fn, #fn, sizeof(#fn))) { return null; }

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

#undef CREATE_AND_REGISTER_FN

    return exports;
}

NAPI_MODULE(aws_crt_nodejs, s_register_napi_module)
