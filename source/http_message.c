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

#include "class_binder.h"
#include "http_message.h"

#include <aws/http/request_response.h>

static struct aws_napi_class_info s_request_class_info;

static aws_napi_method_fn s_request_constructor;

static aws_napi_property_get_fn s_method_get;
static aws_napi_property_set_fn s_method_set;
static aws_napi_property_get_fn s_path_get;
static aws_napi_property_set_fn s_path_set;
static aws_napi_property_set_fn s_body_set;
static aws_napi_property_get_fn s_num_headers_get;

static aws_napi_method_fn s_add_header;
static aws_napi_method_fn s_set_header;
static aws_napi_method_fn s_get_header;
static aws_napi_method_fn s_erase_header;

napi_status aws_napi_http_message_bind(napi_env env, napi_value exports) {

    static const struct aws_napi_method_info s_request_constructor_info = {
        .name = "HttpRequest",
        .method = s_request_constructor,

        .num_arguments = 0,
        .arg_types = {napi_string, napi_string, napi_external, napi_undefined},
    };

    static const struct aws_napi_property_info s_request_properties[] = {
        {
            .name = "method",
            .type = napi_string,
            .getter = s_method_get,
            .setter = s_method_set,
            .attributes = napi_enumerable | napi_writable,
        },
        {
            .name = "path",
            .type = napi_string,
            .getter = s_path_get,
            .setter = s_path_set,
            .attributes = napi_enumerable | napi_writable,
        },
        {
            .name = "body",
            .setter = s_body_set,
            .attributes = napi_enumerable | napi_writable,
        },
        {
            .name = "num_headers",
            .type = napi_number,
            .getter = s_num_headers_get,
            .attributes = napi_enumerable,
        },
    };

    static const struct aws_napi_method_info s_request_methods[] = {
        {
            .name = "add_header",
            .method = s_add_header,
            .num_arguments = 2,
            .arg_types = {napi_string, napi_string},
        },
        {
            .name = "set_header",
            .method = s_set_header,
            .num_arguments = 2,
            .arg_types = {napi_string, napi_string},
        },
        {
            .name = "get_header",
            .method = s_get_header,
            .num_arguments = 1,
            .arg_types = {napi_number},
        },
        {
            .name = "erase_header",
            .method = s_erase_header,
            .num_arguments = 1,
            .arg_types = {napi_number},
        },
    };

    return aws_napi_define_class(
        env,
        exports,
        &s_request_constructor_info,
        s_request_properties,
        AWS_ARRAY_SIZE(s_request_properties),
        s_request_methods,
        AWS_ARRAY_SIZE(s_request_methods),
        &s_request_class_info);
}

napi_status aws_napi_http_message_wrap(napi_env env, struct aws_http_message *message, napi_value *result) {

    return aws_napi_wrap(env, &s_request_class_info, message, NULL, result);
}

struct aws_http_message *aws_napi_http_message_unwrap(napi_env env, napi_value js_object) {

    struct aws_http_message *message = NULL;
    AWS_NAPI_CALL(env, napi_unwrap(env, js_object, (void **)&message), { return NULL; });
    return message;
}

/***********************************************************************************************************************
 * Constructor
 **********************************************************************************************************************/

static void s_napi_http_request_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;

    aws_http_message_destroy(finalize_data);
}

static napi_value s_request_constructor(napi_env env, const struct aws_napi_callback_info *cb_info) {

    struct aws_allocator *alloc = aws_napi_get_allocator();
    struct aws_http_message *message = aws_http_message_new_request(alloc);
    const struct aws_napi_argument *arg = NULL;

    if (aws_napi_method_next_argument(napi_string, cb_info, &arg)) {
        struct aws_byte_cursor method_cur = aws_byte_cursor_from_buf(&arg->native.string);
        aws_http_message_set_request_method(message, method_cur);
    }

    if (aws_napi_method_next_argument(napi_string, cb_info, &arg)) {
        struct aws_byte_cursor path_cur = aws_byte_cursor_from_buf(&arg->native.string);
        aws_http_message_set_request_path(message, path_cur);
    }

    if (aws_napi_method_next_argument(napi_external, cb_info, &arg)) {
        aws_http_message_set_body_stream(message, arg->native.external);
    }

    if (aws_napi_method_next_argument(napi_undefined, cb_info, &arg)) {
        napi_value node_headers = arg->node;

        bool is_array = false;
        if (napi_is_array(env, node_headers, &is_array) || !is_array) {
            napi_throw_type_error(env, NULL, "headers must be an array of arrays");
            goto cleanup;
        }

        uint32_t num_headers = 0;
        AWS_NAPI_CALL(env, napi_get_array_length(env, node_headers, &num_headers), {
            napi_throw_error(env, NULL, "Could not get length of header array");
            goto cleanup;
        });

        struct aws_byte_buf name_buf;
        struct aws_byte_buf value_buf;
        aws_byte_buf_init(&name_buf, alloc, 256);
        aws_byte_buf_init(&value_buf, alloc, 256);
        for (uint32_t idx = 0; idx < num_headers; ++idx) {
            napi_value node_header = NULL;
            AWS_NAPI_CALL(env, napi_get_element(env, node_headers, idx, &node_header), {
                napi_throw_error(env, NULL, "Failed to extract headers");
                goto header_parse_error;
            });

            AWS_NAPI_CALL(env, napi_is_array(env, node_header, &is_array), {
                napi_throw_error(env, NULL, "Cannot determine if headers are an array");
                goto header_parse_error;
            });
            if (!is_array) {
                napi_throw_type_error(env, NULL, "headers must be an array of 2 element arrays");
                goto header_parse_error;
            }

            uint32_t num_parts = 0;
            AWS_NAPI_CALL(env, napi_get_array_length(env, node_header, &num_parts), {
                napi_throw_error(env, NULL, "Could not get length of header parts");
                goto header_parse_error;
            });
            if (num_parts != 2) {
                napi_throw_error(env, NULL, "Could not get length of header parts or length was not 2");
                goto header_parse_error;
            }
            napi_value node_name = NULL;
            napi_value node = NULL;
            AWS_NAPI_CALL(env, napi_get_element(env, node_header, 0, &node_name), {
                napi_throw_error(env, NULL, "Could not extract header name");
                goto header_parse_error;
            });
            AWS_NAPI_CALL(env, napi_get_element(env, node_header, 1, &node), {
                napi_throw_error(env, NULL, "Could not extract header value");
                goto header_parse_error;
            });
            /* extract the length of the name and value strings, ensure the buffers can hold them, and
            then copy the values out. Should result in buffer re-use most of the time. */
            size_t length = 0;
            AWS_NAPI_CALL(env, napi_get_value_string_utf8(env, node_name, NULL, 0, &length), {
                napi_throw_type_error(env, NULL, "HTTP header was not a string or length could not be extracted");
                goto header_parse_error;
            });
            aws_byte_buf_reserve(&name_buf, length);
            AWS_NAPI_CALL(env, napi_get_value_string_utf8(env, node, NULL, 0, &length), {
                napi_throw_type_error(env, NULL, "HTTP header was not a string or length could not be extracted");
                goto header_parse_error;
            });
            aws_byte_buf_reserve(&value_buf, length);

            AWS_NAPI_CALL(
                env,
                napi_get_value_string_utf8(env, node_name, (char *)name_buf.buffer, name_buf.capacity, &name_buf.len),
                {
                    napi_throw_error(env, NULL, "HTTP header name could not be extracted");
                    goto header_parse_error;
                });
            AWS_NAPI_CALL(
                env,
                napi_get_value_string_utf8(env, node, (char *)value_buf.buffer, value_buf.capacity, &value_buf.len),
                {
                    napi_throw_error(env, NULL, "HTTP header value could not be extracted");
                    goto header_parse_error;
                });

            struct aws_http_header header = {
                .name = aws_byte_cursor_from_buf(&name_buf),
                .value = aws_byte_cursor_from_buf(&value_buf),
            };
            aws_http_message_add_header(message, header);
        }
        aws_byte_buf_clean_up(&name_buf);
        aws_byte_buf_clean_up(&value_buf);
        goto header_parse_success;

    header_parse_error:
        aws_byte_buf_clean_up(&name_buf);
        aws_byte_buf_clean_up(&value_buf);
        goto cleanup;
    }
header_parse_success:;

    napi_value node_this = cb_info->native_this;
    AWS_NAPI_CALL(env, napi_wrap(env, node_this, message, s_napi_http_request_finalize, NULL, NULL), {
        napi_throw_error(env, NULL, "Failed to wrap HttpRequest");
        goto cleanup;
    });

    return node_this;

cleanup:
    if (message) {
        aws_http_message_destroy(message);
    }
    return NULL;
}

/***********************************************************************************************************************
 * Properties
 **********************************************************************************************************************/

static napi_value s_method_get(napi_env env, void *native_this) {

    struct aws_byte_cursor result_cur;
    aws_http_message_get_request_method(native_this, &result_cur);

    napi_value result = NULL;
    AWS_NAPI_CALL(
        env, napi_create_string_utf8(env, (const char *)result_cur.ptr, result_cur.len, &result), { return NULL; });

    return result;
}

static void s_method_set(napi_env env, void *native_this, const struct aws_napi_argument *value) {
    (void)env;

    struct aws_byte_cursor new_value_cur = aws_byte_cursor_from_buf(&value->native.string);
    aws_http_message_set_request_method(native_this, new_value_cur);
}

static napi_value s_path_get(napi_env env, void *native_this) {

    struct aws_byte_cursor result_cur;
    aws_http_message_get_request_path(native_this, &result_cur);

    napi_value result = NULL;
    AWS_NAPI_CALL(
        env, napi_create_string_utf8(env, (const char *)result_cur.ptr, result_cur.len, &result), { return NULL; });

    return result;
}

static void s_path_set(napi_env env, void *native_this, const struct aws_napi_argument *value) {
    (void)env;

    struct aws_byte_cursor new_value_cur = aws_byte_cursor_from_buf(&value->native.string);
    aws_http_message_set_request_path(native_this, new_value_cur);
}

static void s_body_set(napi_env env, void *native_this, const struct aws_napi_argument *value) {
    (void)env;

    aws_http_message_set_body_stream(native_this, value->native.external);
}

static napi_value s_num_headers_get(napi_env env, void *native_this) {
    const size_t header_count = aws_http_message_get_header_count(native_this);

    napi_value result = NULL;
    AWS_NAPI_CALL(env, napi_create_uint32(env, (uint32_t)header_count, &result), { return NULL; });
    return result;
}

/***********************************************************************************************************************
 * Methods
 **********************************************************************************************************************/

static napi_value s_add_header(napi_env env, const struct aws_napi_callback_info *cb_info) {

    AWS_FATAL_ASSERT(cb_info->num_args == 2);
    struct aws_http_message *native_this = cb_info->native_this;
    const struct aws_napi_argument *arg = NULL;

    struct aws_http_header new_header;

    aws_napi_method_next_argument(napi_string, cb_info, &arg);
    new_header.name = aws_byte_cursor_from_buf(&arg->native.string);

    aws_napi_method_next_argument(napi_string, cb_info, &arg);
    new_header.value = aws_byte_cursor_from_buf(&arg->native.string);

    if (aws_http_message_add_header(native_this, new_header)) {
        aws_napi_throw_last_error(env);
    }

    return NULL;
}

static napi_value s_set_header(napi_env env, const struct aws_napi_callback_info *cb_info) {

    AWS_FATAL_ASSERT(cb_info->num_args == 2);
    struct aws_http_message *native_this = cb_info->native_this;
    const struct aws_napi_argument *arg = NULL;

    struct aws_http_header new_header;

    aws_napi_method_next_argument(napi_string, cb_info, &arg);
    new_header.name = aws_byte_cursor_from_buf(&arg->native.string);

    aws_napi_method_next_argument(napi_string, cb_info, &arg);
    new_header.value = aws_byte_cursor_from_buf(&arg->native.string);

    bool found_name = false;
    size_t last_found_idx = 0;

    const size_t num_headers = aws_http_message_get_header_count(native_this);
    for (size_t i = num_headers;; --i) {
        struct aws_http_header header;
        if (aws_http_message_get_header(native_this, &header, i)) {
            aws_napi_throw_last_error(env);
            return NULL;
        }

        if (aws_byte_cursor_eq(&new_header.name, &header.name)) {

            /* If we already knew about a header with this key, delete it, and keep track of the new one */
            if (found_name) {
                if (aws_http_message_erase_header(native_this, last_found_idx)) {
                    aws_napi_throw_last_error(env);
                    return NULL;
                }
            }

            found_name = true;
            last_found_idx = i;
        }

        /* Break here to avoid underflowing i */
        if (i == 0) {
            break;
        }
    }

    /* If we found the header, replace it. Otherwise, add it. */
    if (found_name) {
        if (aws_http_message_set_header(native_this, new_header, last_found_idx)) {
            aws_napi_throw_last_error(env);
            return NULL;
        }
    } else {
        if (aws_http_message_add_header(native_this, new_header)) {
            aws_napi_throw_last_error(env);
            return NULL;
        }
    }

    return NULL;
}

static napi_value s_get_header(napi_env env, const struct aws_napi_callback_info *cb_info) {

    AWS_FATAL_ASSERT(cb_info->num_args == 1);
    struct aws_http_message *native_this = cb_info->native_this;
    const struct aws_napi_argument *arg = NULL;

    aws_napi_method_next_argument(napi_number, cb_info, &arg);
    const int64_t index = arg->native.number;
    if (index < 0 || (size_t)index > SIZE_MAX) {
        napi_throw_error(env, NULL, "Header index is out of bounds");
        return NULL;
    }

    struct aws_http_header header;
    if (aws_http_message_get_header(native_this, &header, (size_t)index)) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    napi_value node_header = NULL;
    AWS_NAPI_ENSURE(env, napi_create_array(env, &node_header));

    napi_value node_name = NULL;
    napi_value node = NULL;
    AWS_NAPI_ENSURE(env, napi_create_string_utf8(env, (const char *)header.name.ptr, header.name.len, &node_name));
    AWS_NAPI_ENSURE(env, napi_create_string_utf8(env, (const char *)header.value.ptr, header.value.len, &node));
    AWS_NAPI_ENSURE(env, napi_set_element(env, node_header, 0, node_name));
    AWS_NAPI_ENSURE(env, napi_set_element(env, node_header, 1, node));

    return node_header;
}

static napi_value s_erase_header(napi_env env, const struct aws_napi_callback_info *cb_info) {

    AWS_FATAL_ASSERT(cb_info->num_args == 1);
    struct aws_http_message *native_this = cb_info->native_this;
    const struct aws_napi_argument *arg = NULL;

    aws_napi_method_next_argument(napi_number, cb_info, &arg);
    const int64_t index = arg->native.number;
    if (index < 0 || (size_t)index > SIZE_MAX) {
        napi_throw_error(env, NULL, "Header index is out of bounds");
        return NULL;
    }

    if (aws_http_message_erase_header(native_this, (size_t)index)) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    return NULL;
}
