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

#include <aws/http/request_response.h>

enum aws_napi_http_message_properties {
    AWS_NAPI_HTTP_MESSAGE_INVALID_PROPERTY,

    AWS_NAPI_HTTP_REQUEST_METHOD,
    AWS_NAPI_HTTP_REQUEST_PATH,
    AWS_NAPI_HTTP_REQUEST_BODY,

    AWS_NAPI_HTTP_MESSAGE_NUM_HEADERS,
};

enum aws_napi_http_message_methods {
    AWS_NAPI_HTTP_MESSAGE_INVALID_METHOD,

    AWS_NAPI_HTTP_MESSAGE_ADD_HEADER,
    AWS_NAPI_HTTP_MESSAGE_SET_HEADER,
    AWS_NAPI_HTTP_MESSAGE_GET_HEADER,
    AWS_NAPI_HTTP_MESSAGE_ERASE_HEADER,
};

struct aws_napi_http_message_method_info {
    enum aws_napi_http_message_methods method;
    size_t num_arguments; /* 0 -> 2 */

    napi_valuetype arg_types[2];
};

static void s_napi_http_request_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;

    aws_http_message_destroy(finalize_data);
}

static napi_value s_napi_http_request_constructor(napi_env env, napi_callback_info info) {

    struct aws_allocator *alloc = aws_default_allocator();

    struct aws_http_message *message = NULL;

    napi_value node_args[4];
    napi_value node_this = NULL;
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, &node_this, NULL), {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    });
    if (num_args > AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "HttpRequest takes no more than 4 arguments");
        goto cleanup;
    }
    if (node_this == NULL) {
        napi_throw_error(env, NULL, "HttpRequest must be called as a constructor");
        goto cleanup;
    }

    message = aws_http_message_new_request(alloc);

    napi_value node_method = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_method)) {
        struct aws_byte_buf method;
        AWS_NAPI_CALL(env, aws_byte_buf_init_from_napi(&method, env, node_method), {
            napi_throw_error(env, NULL, "Failed to extract method from first argument");
            goto cleanup;
        });
        struct aws_byte_cursor method_cur = aws_byte_cursor_from_buf(&method);
        aws_http_message_set_request_method(message, method_cur);
        aws_byte_buf_clean_up(&method);
    }

    napi_value node_path = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_path)) {
        struct aws_byte_buf path;
        AWS_NAPI_CALL(env, aws_byte_buf_init_from_napi(&path, env, node_path), {
            napi_throw_error(env, NULL, "Failed to extract path from second argument");
            goto cleanup;
        });

        struct aws_byte_cursor path_cur = aws_byte_cursor_from_buf(&path);
        aws_http_message_set_request_path(message, path_cur);
        aws_byte_buf_clean_up(&path);
    }

    napi_value node_stream = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_stream)) {
        struct aws_input_stream *body_stream = NULL;
        AWS_NAPI_CALL(env, napi_get_value_external(env, node_stream, (void **)&body_stream), {
            napi_throw_error(env, NULL, "Unable to acquire request body stream");
            goto cleanup;
        });

        aws_http_message_set_body_stream(message, body_stream);
    }

    napi_value node_headers = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_headers)) {
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
            napi_value node_value = NULL;
            AWS_NAPI_CALL(env, napi_get_element(env, node_header, 0, &node_name), {
                napi_throw_error(env, NULL, "Could not extract header name");
                goto header_parse_error;
            });
            AWS_NAPI_CALL(env, napi_get_element(env, node_header, 1, &node_value), {
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
            AWS_NAPI_CALL(env, napi_get_value_string_utf8(env, node_value, NULL, 0, &length), {
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
                napi_get_value_string_utf8(
                    env, node_value, (char *)value_buf.buffer, value_buf.capacity, &value_buf.len),
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
header_parse_success:

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

static napi_value s_napi_http_message_getter(napi_env env, napi_callback_info info) {

    struct aws_http_message *message = NULL;

    napi_value node_this = NULL;
    size_t num_args = 0;
    void *data = NULL;
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, NULL, &node_this, &data), {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    });
    if (num_args != 0) {
        napi_throw_error(env, NULL, "HTTP Message getter needs exactly 0 arguments");
        goto cleanup;
    }

    AWS_NAPI_CALL(env, napi_unwrap(env, node_this, (void **)&message), {
        napi_throw_error(env, NULL, "HTTP Message getter must be called on instance of HTTP Message");
        goto cleanup;
    });

    enum aws_napi_http_message_properties property = (enum aws_napi_http_message_properties)data;

    napi_value result = NULL;
    switch (property) {
        case AWS_NAPI_HTTP_REQUEST_METHOD:
        case AWS_NAPI_HTTP_REQUEST_PATH: {
            struct aws_byte_cursor result_cur;

            if (property == AWS_NAPI_HTTP_REQUEST_METHOD) {
                aws_http_message_get_request_method(message, &result_cur);
            } else if (property == AWS_NAPI_HTTP_REQUEST_PATH) {
                aws_http_message_get_request_path(message, &result_cur);
            } else {
                AWS_FATAL_ASSERT(false);
            }

            AWS_NAPI_CALL(env, napi_create_string_utf8(env, (const char *)result_cur.ptr, result_cur.len, &result), {
                goto cleanup;
            });
            break;
        }
        case AWS_NAPI_HTTP_MESSAGE_NUM_HEADERS: {
            const size_t header_count = aws_http_message_get_header_count(message);
            AWS_NAPI_CALL(env, napi_create_uint32(env, (uint32_t)header_count, &result), { goto cleanup; });
            break;
        }
        default:
            AWS_FATAL_ASSERT(false);
            break;
    }

    return result;

cleanup:
    return NULL;
}

static napi_value s_napi_http_message_setter(napi_env env, napi_callback_info info) {

    struct aws_http_message *message = NULL;

    napi_value node_this = NULL;

    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    void *data = NULL;
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, &node_this, &data), {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        goto cleanup;
    });
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "HTTP Message setter needs exactly 1 arguments");
        goto cleanup;
    }

    AWS_NAPI_CALL(env, napi_unwrap(env, node_this, (void **)&message), {
        napi_throw_error(env, NULL, "HTTP Message setter must be called on instance of HTTP Message");
        goto cleanup;
    });

    enum aws_napi_http_message_properties property = (enum aws_napi_http_message_properties)data;

    napi_value node_new_value = *arg++;
    switch (property) {
        case AWS_NAPI_HTTP_REQUEST_METHOD:
        case AWS_NAPI_HTTP_REQUEST_PATH: {

            struct aws_byte_buf new_value;
            AWS_NAPI_CALL(env, aws_byte_buf_init_from_napi(&new_value, env, node_new_value), {
                napi_throw_type_error(env, NULL, "HttpRequest setter first argument must be a string");
                goto cleanup;
            });

            struct aws_byte_cursor new_value_cur = aws_byte_cursor_from_buf(&new_value);
            if (property == AWS_NAPI_HTTP_REQUEST_METHOD) {
                aws_http_message_set_request_method(message, new_value_cur);
            } else if (property == AWS_NAPI_HTTP_REQUEST_PATH) {
                aws_http_message_set_request_path(message, new_value_cur);
            } else {
                AWS_FATAL_ASSERT(false);
            }
            aws_byte_buf_clean_up(&new_value);

            break;
        }
        case AWS_NAPI_HTTP_REQUEST_BODY: {
            struct aws_input_stream *body_stream = NULL;
            AWS_NAPI_CALL(env, napi_get_value_external(env, node_new_value, (void **)&body_stream), {
                napi_throw_error(env, NULL, "Unable to acquire request body stream");
                goto cleanup;
            });

            aws_http_message_set_body_stream(message, body_stream);
            break;
        }
        default:
            AWS_FATAL_ASSERT(false);
            break;
    }

cleanup:
    return NULL;
}

union aws_napi_message_argument {
    struct aws_byte_buf string;
    int64_t number;
};

static napi_value s_napi_http_message_add_header(napi_env env, napi_callback_info info) {

    struct aws_http_message *message = NULL;
    union aws_napi_message_argument args[2];
    AWS_ZERO_ARRAY(args);

    napi_value node_this = NULL;

    napi_value node_args[2];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    void *data = NULL;
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, &node_this, &data), {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    });

    struct aws_napi_http_message_method_info *method_info = data;
    if (num_args != method_info->num_arguments) {
        napi_throw_error(env, NULL, "HttpRequest setter needs exactly 1 arguments");
        goto cleanup;
    }

    AWS_NAPI_CALL(env, napi_unwrap(env, node_this, (void **)&message), {
        napi_throw_error(env, NULL, "HttpRequest setter must be called on instance of HttpRequest");
        goto cleanup;
    });

    for (size_t i = 0; i < method_info->num_arguments; ++i) {
        napi_value node_arg = *arg++;

        switch (method_info->arg_types[i]) {
            case napi_string: {
                AWS_NAPI_CALL(env, aws_byte_buf_init_from_napi(&args[i].string, env, node_arg), {
                    napi_throw_type_error(env, NULL, "HttpRequest argument expected a string");
                    goto cleanup;
                });

                break;
            }
            case napi_number: {
                AWS_NAPI_CALL(env, napi_get_value_int64(env, node_arg, &args[i].number), {
                    napi_throw_type_error(env, NULL, "HttpRequest argument expected a string");
                    goto cleanup;
                });

                break;
            }
            default:
                AWS_FATAL_ASSERT(false);
                break;
        }
    }

    switch (method_info->method) {
        case AWS_NAPI_HTTP_MESSAGE_ADD_HEADER: {

            struct aws_http_header new_header = {
                .name = aws_byte_cursor_from_buf(&args[0].string),
                .value = aws_byte_cursor_from_buf(&args[1].string),
            };

            if (aws_http_message_add_header(message, new_header)) {
                aws_napi_throw_last_error(env);
                goto cleanup;
            }

            break;
        }

        case AWS_NAPI_HTTP_MESSAGE_SET_HEADER: {
            const size_t num_headers = aws_http_message_get_header_count(message);

            struct aws_http_header new_header = {
                .name = aws_byte_cursor_from_buf(&args[0].string),
                .value = aws_byte_cursor_from_buf(&args[1].string),
            };

            bool found_name = false;
            size_t last_found_idx = 0;

            for (size_t i = num_headers;; --i) {
                struct aws_http_header header;
                if (aws_http_message_get_header(message, &header, i)) {
                    aws_napi_throw_last_error(env);
                    goto cleanup;
                }

                if (aws_byte_cursor_eq(&new_header.name, &header.name)) {

                    /* If we already knew about a header with this key, delete it, and keep track of the new one */
                    if (found_name) {
                        if (aws_http_message_erase_header(message, last_found_idx)) {
                            aws_napi_throw_last_error(env);
                            goto cleanup;
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
                if (aws_http_message_set_header(message, new_header, last_found_idx)) {
                    aws_napi_throw_last_error(env);
                    goto cleanup;
                }
            } else {
                if (aws_http_message_add_header(message, new_header)) {
                    aws_napi_throw_last_error(env);
                    goto cleanup;
                }
            }

            break;
        }

        case AWS_NAPI_HTTP_MESSAGE_GET_HEADER: {

            if (args[0].number < 0 || (size_t)args[0].number > SIZE_MAX) {
                napi_throw_error(env, NULL, "Header index is out of bounds");
                goto cleanup;
            }

            struct aws_http_header header;
            if (aws_http_message_get_header(message, &header, args[0].number)) {
                aws_napi_throw_last_error(env);
                goto cleanup;
            }

            napi_value node_header = NULL;
            AWS_NAPI_ENSURE(env, napi_create_array(env, &node_header));

            napi_value node_name = NULL;
            napi_value node_value = NULL;
            AWS_NAPI_ENSURE(
                env, napi_create_string_utf8(env, (const char *)header.name.ptr, header.name.len, &node_name));
            AWS_NAPI_ENSURE(
                env, napi_create_string_utf8(env, (const char *)header.value.ptr, header.value.len, &node_value));
            AWS_NAPI_ENSURE(env, napi_set_element(env, node_header, 0, node_name));
            AWS_NAPI_ENSURE(env, napi_set_element(env, node_header, 1, node_value));

            return node_header;
        }

        case AWS_NAPI_HTTP_MESSAGE_ERASE_HEADER: {
            if (args[0].number < 0 || (size_t)args[0].number > SIZE_MAX) {
                napi_throw_error(env, NULL, "Header index is out of bounds");
                goto cleanup;
            }

            if (aws_http_message_erase_header(message, args[0].number)) {
                aws_napi_throw_last_error(env);
                goto cleanup;
            }

            break;
        }

        default:
            AWS_FATAL_ASSERT(false);
            break;
    }

cleanup:
    for (size_t i = 0; i < method_info->num_arguments; ++i) {
        switch (method_info->arg_types[i]) {
            case napi_string:
                aws_byte_buf_clean_up(&args[i].string);
                break;

            default:
                break;
        }
    }
    return NULL;
}

static struct aws_napi_http_message_method_info s_method_infos[] = {
    [AWS_NAPI_HTTP_MESSAGE_ADD_HEADER] =
        {
            .method = AWS_NAPI_HTTP_MESSAGE_ADD_HEADER,
            .num_arguments = 2,
            .arg_types = {napi_string, napi_string},
        },
    [AWS_NAPI_HTTP_MESSAGE_SET_HEADER] =
        {
            .method = AWS_NAPI_HTTP_MESSAGE_SET_HEADER,
            .num_arguments = 2,
            .arg_types = {napi_string, napi_string},
        },
    [AWS_NAPI_HTTP_MESSAGE_GET_HEADER] =
        {
            .method = AWS_NAPI_HTTP_MESSAGE_GET_HEADER,
            .num_arguments = 1,
            .arg_types = {napi_number},
        },
    [AWS_NAPI_HTTP_MESSAGE_ERASE_HEADER] =
        {
            .method = AWS_NAPI_HTTP_MESSAGE_ERASE_HEADER,
            .num_arguments = 1,
            .arg_types = {napi_number},
        },
};

static const napi_property_descriptor s_http_request_properties[] = {
    /* PROPERTIES */
    {
        .utf8name = "method",
        .getter = s_napi_http_message_getter,
        .setter = s_napi_http_message_setter,
        .attributes = napi_writable | napi_enumerable,
        .data = (void *)AWS_NAPI_HTTP_REQUEST_METHOD,
    },
    {
        .utf8name = "path",
        .getter = s_napi_http_message_getter,
        .setter = s_napi_http_message_setter,
        .attributes = napi_writable | napi_enumerable,
        .data = (void *)AWS_NAPI_HTTP_REQUEST_PATH,
    },
    {
        .utf8name = "body",
        .getter = NULL,
        .setter = s_napi_http_message_setter,
        .attributes = napi_writable | napi_enumerable,
        .data = (void *)AWS_NAPI_HTTP_REQUEST_BODY,
    },
    {
        .utf8name = "num_headers",
        .getter = s_napi_http_message_getter,
        .setter = NULL,
        .attributes = napi_default | napi_enumerable,
        .data = (void *)AWS_NAPI_HTTP_MESSAGE_NUM_HEADERS,
    },

    /* METHODS */
    {
        .utf8name = "add_header",
        .method = s_napi_http_message_add_header,
        .data = &s_method_infos[AWS_NAPI_HTTP_MESSAGE_ADD_HEADER],
    },
    {
        .utf8name = "set_header",
        .method = s_napi_http_message_add_header,
        .data = &s_method_infos[AWS_NAPI_HTTP_MESSAGE_SET_HEADER],
    },
    {
        .utf8name = "get_header",
        .method = s_napi_http_message_add_header,
        .data = &s_method_infos[AWS_NAPI_HTTP_MESSAGE_GET_HEADER],
    },
    {
        .utf8name = "erase_header",
        .method = s_napi_http_message_add_header,
        .data = &s_method_infos[AWS_NAPI_HTTP_MESSAGE_ERASE_HEADER],
    },
};

napi_status aws_napi_http_message_bind(napi_env env, napi_value exports) {

    napi_value http_request_ctor = NULL;
    AWS_NAPI_CALL(
        env,
        napi_define_class(
            env,
            "http_request",
            NAPI_AUTO_LENGTH,
            s_napi_http_request_constructor,
            NULL,
            AWS_ARRAY_SIZE(s_http_request_properties),
            s_http_request_properties,
            &http_request_ctor),
        { return status; });

    AWS_NAPI_CALL(env, napi_set_named_property(env, exports, "http_request", http_request_ctor), { return status; });

    return napi_ok;
}

napi_status aws_napi_http_message_wrap(napi_env env, struct aws_http_message *message, napi_value *result) {
    /* Wrap shouldn't take a finalizer, because it's very likely that this object isn't owned by JS */
    AWS_NAPI_CALL(env, napi_wrap(env, *result, message, NULL, NULL, NULL), {
        napi_throw_error(env, NULL, "Failed to wrap HttpRequest");
        return status;
    });

    return napi_ok;
}

struct aws_http_message *aws_napi_http_message_unwrap(napi_env env, napi_value js_object) {

    struct aws_http_message *message = NULL;
    AWS_NAPI_CALL(env, napi_unwrap(env, js_object, (void **)&message), { return NULL; });
    return message;
}
