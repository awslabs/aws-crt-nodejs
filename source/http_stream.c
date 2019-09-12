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

#include "http_stream.h"
#include "http_connection.h"
#include "module.h"
#include "uv_interop.h"

#include <aws/http/request_response.h>
#include <aws/io/stream.h>

struct http_stream_binding {
    struct aws_http_stream *stream;
    napi_ref node_external;
    struct aws_uv_context *uv_context;
    struct aws_napi_callback on_complete;
    struct aws_napi_callback on_response;
    struct aws_napi_callback on_body;
    struct aws_http_message *response; /* used to buffer response headers/status code */
    struct aws_http_message *request;
    struct aws_byte_buf body;             /* request body */
    struct aws_input_stream *body_stream; /* stream pointing at request body */
};

static int s_on_response_params(napi_env env, napi_value *params, size_t *num_params, void *user_data) {
    struct aws_http_message *response = user_data;

    int32_t status_code = 0;
    aws_http_message_get_response_status(response, &status_code);
    if (napi_create_int32(env, status_code, &params[0])) {
        return AWS_OP_ERR;
    }

    napi_value node_headers = NULL;
    if (napi_create_array(env, &node_headers)) {
        return AWS_OP_ERR;
    }
    params[1] = node_headers;

    const size_t num_headers = aws_http_message_get_header_count(response);
    for (size_t idx = 0; idx < num_headers; ++idx) {
        struct aws_http_header header;
        aws_http_message_get_header(response, &header, idx);

        napi_value node_header = NULL;
        if (napi_create_array(env, &node_header)) {
            return AWS_OP_ERR;
        }

        napi_value node_name = NULL;
        napi_value node_value = NULL;
        if (napi_create_string_utf8(env, (const char *)header.name.ptr, header.name.len, &node_name) ||
            napi_create_string_utf8(env, (const char *)header.value.ptr, header.value.len, &node_value)) {
            return AWS_OP_ERR;
        }
        if (napi_set_element(env, node_header, 0, node_name) || napi_set_element(env, node_header, 1, node_value)) {
            return AWS_OP_ERR;
        }

        if (napi_set_element(env, node_headers, idx, node_header)) {
            return AWS_OP_ERR;
        }
    }

    *num_params = 2;
    return AWS_OP_SUCCESS;
}

static int s_on_response_headers(
    struct aws_http_stream *stream,
    enum aws_http_header_block block_type,
    const struct aws_http_header *header_array,
    size_t num_headers,
    void *user_data) {
    (void)stream;
    (void)block_type;
    struct http_stream_binding *binding = user_data;
    if (!binding->on_response.callback) {
        return AWS_OP_SUCCESS;
    }

    if (!binding->response) {
        binding->response = aws_http_message_new_response(aws_default_allocator());
    }
    return aws_http_message_add_header_array(binding->response, header_array, num_headers);
}

static void s_on_response_dispatch(void *user_data) {
    struct http_stream_binding *binding = user_data;
    aws_napi_callback_dispatch(&binding->on_response, binding->response);
    aws_http_message_destroy(binding->response);
    binding->response = NULL;
}

static int s_on_response_header_block_done(
    struct aws_http_stream *stream,
    enum aws_http_header_block block_type,
    void *user_data) {
    (void)block_type;
    struct http_stream_binding *binding = user_data;
    if (binding->on_response.callback) {
        int status_code = 0;
        aws_http_stream_get_incoming_response_status(stream, &status_code);
        aws_http_message_set_response_status(binding->response, status_code);
        aws_uv_context_enqueue(binding->uv_context, s_on_response_dispatch, binding);
    }
    return AWS_OP_SUCCESS;
}

struct on_body_args {
    struct http_stream_binding *binding;
    struct aws_byte_buf chunk;
};

static int s_on_body_params(napi_env env, napi_value *params, size_t *num_params, void *user_data) {
    struct on_body_args *args = user_data;

    if (napi_get_reference_value(env, args->binding->node_external, &params[0]) ||
        napi_create_external_arraybuffer(env, args->chunk.buffer, args->chunk.len, NULL, NULL, &params[1])) {
        return AWS_OP_ERR;
    }

    *num_params = 2;
    return AWS_OP_SUCCESS;
}

static void s_on_body_dispatch(void *user_data) {
    struct on_body_args *args = user_data;
    struct aws_allocator *allocator = aws_default_allocator();
    aws_napi_callback_dispatch(&args->binding->on_body, args);
    aws_byte_buf_clean_up(&args->chunk);
    aws_mem_release(allocator, args);
}

static int s_on_response_body(struct aws_http_stream *stream, const struct aws_byte_cursor *data, void *user_data) {
    (void)stream;
    struct http_stream_binding *binding = user_data;
    if (AWS_UNLIKELY(!binding->on_body.callback)) {
        return AWS_OP_SUCCESS;
    }

    struct aws_allocator *allocator = aws_default_allocator();
    struct on_body_args *args = aws_mem_calloc(allocator, 1, sizeof(struct on_body_args));
    AWS_FATAL_ASSERT(args);

    args->binding = binding;
    if (aws_byte_buf_init_copy_from_cursor(&args->chunk, allocator, *data)) {
        AWS_FATAL_ASSERT(args->chunk.buffer);
    }

    aws_uv_context_enqueue(binding->uv_context, s_on_body_dispatch, args);

    return AWS_OP_SUCCESS;
}

struct on_complete_args {
    struct http_stream_binding *binding;
    int error_code;
};

static int s_on_complete_params(napi_env env, napi_value *params, size_t *num_params, void *user_data) {
    struct on_complete_args *args = user_data;

    if (napi_create_int32(env, args->error_code, &params[0])) {
        return AWS_OP_ERR;
    }

    *num_params = 1;
    return AWS_OP_SUCCESS;
}

static void s_on_complete_dispatch(void *user_data) {
    struct on_complete_args *args = user_data;
    aws_napi_callback_dispatch(&args->binding->on_complete, args);
    aws_mem_release(aws_default_allocator(), args);
}

static void s_on_complete(struct aws_http_stream *stream, int error_code, void *user_data) {
    (void)stream;
    struct http_stream_binding *binding = user_data;
    struct aws_allocator *allocator = aws_default_allocator();
    struct on_complete_args *args = aws_mem_calloc(allocator, 1, sizeof(struct on_complete_args));
    AWS_FATAL_ASSERT(args);
    args->binding = binding;
    args->error_code = error_code;
    aws_uv_context_enqueue(binding->uv_context, s_on_complete_dispatch, args);
}

static void s_http_stream_binding_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;
    struct http_stream_binding *binding = finalize_data;
    struct aws_allocator *allocator = aws_default_allocator();
    aws_http_message_destroy(binding->request);
    aws_http_message_destroy(binding->response);
    aws_input_stream_destroy(binding->body_stream);
    aws_byte_buf_clean_up(&binding->body);
    aws_mem_release(allocator, binding);
}

napi_value aws_napi_http_stream_new(napi_env env, napi_callback_info info) {
    struct aws_allocator *allocator = aws_default_allocator();
    napi_value result = NULL;

    napi_value node_args[8];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retrieve callback information");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "http_stream_new needs exactly 8 arguments");
        return NULL;
    }

    struct http_connection_binding *connection_binding = NULL;
    if (napi_get_value_external(env, node_args[0], (void **)&connection_binding)) {
        napi_throw_error(env, NULL, "Unable to extract connection from external");
        return NULL;
    }

    struct aws_string *method = aws_string_new_from_napi(env, node_args[1]);
    struct aws_string *path = aws_string_new_from_napi(env, node_args[2]);
    struct aws_byte_buf body;
    AWS_ZERO_STRUCT(body);
    if (!method) {
        napi_throw_error(env, NULL, "method must be a string");
        goto argument_error;
    }

    if (!path) {
        napi_throw_error(env, NULL, "path must be a string");
        goto argument_error;
    }

    struct aws_input_stream *body_stream = NULL;
    if (!aws_napi_is_null_or_undefined(env, node_args[3])) {
        if (aws_byte_buf_init_from_napi(&body, env, node_args[3])) {
            napi_throw_error(env, NULL, "Unable to init request body buffer");
            goto argument_error;
        }
        struct aws_byte_cursor body_cursor = aws_byte_cursor_from_buf(&body);
        body_stream = aws_input_stream_new_from_cursor(allocator, &body_cursor);
    }

    struct aws_http_message *request = aws_http_message_new_request(allocator);
    if (!request) {
        aws_napi_throw_last_error(env);
        goto argument_error;
    }
    aws_http_message_set_request_method(request, aws_byte_cursor_from_string(method));
    aws_http_message_set_request_path(request, aws_byte_cursor_from_string(path));
    aws_http_message_set_body_stream(request, body_stream);

    napi_value node_headers = node_args[4];
    bool is_array = false;
    if (napi_is_array(env, node_headers, &is_array) || !is_array) {
        napi_throw_error(env, NULL, "headers must be an array of arrays");
        goto argument_error;
    }

    uint32_t num_headers = 0;
    if (napi_get_array_length(env, node_headers, &num_headers)) {
        napi_throw_error(env, NULL, "Could not get length of header array");
        goto argument_error;
    }

    struct aws_byte_buf name_buf;
    struct aws_byte_buf value_buf;
    aws_byte_buf_init(&name_buf, allocator, 256);
    aws_byte_buf_init(&value_buf, allocator, 256);
    for (uint32_t idx = 0; idx < num_headers; ++idx) {
        napi_value node_header = NULL;
        if (napi_get_element(env, node_headers, idx, &node_header)) {
            napi_throw_error(env, NULL, "Failed to extract headers");
            goto argument_error;
        }

        if (napi_is_array(env, node_header, &is_array) || !is_array) {
            napi_throw_error(env, NULL, "headers must be an array of 2 element arrays");
            goto argument_error;
        }

        uint32_t num_parts = 0;
        if (napi_get_array_length(env, node_header, &num_parts) || num_parts != 2) {
            napi_throw_error(env, NULL, "Could not get length of header parts or length was not 2");
            goto argument_error;
        }
        napi_value node_name = NULL;
        napi_value node_value = NULL;
        if (napi_get_element(env, node_header, 0, &node_name) || napi_get_element(env, node_header, 1, &node_value)) {
            napi_throw_error(env, NULL, "Could not extract header parts");
            goto argument_error;
        }
        /* extract the length of the name and value strings, ensure the buffers can hold them, and
           then copy the values out. Should result in buffer re-use most of the time. */
        size_t length = 0;
        if (napi_get_value_string_utf8(env, node_name, NULL, 0, &length)) {
            napi_throw_error(env, NULL, "HTTP header was not a string or length could not be extracted");
            goto argument_error;
        }
        aws_byte_buf_reserve(&name_buf, length);
        if (napi_get_value_string_utf8(env, node_value, NULL, 0, &length)) {
            napi_throw_error(env, NULL, "HTTP header was not a string or length could not be extracted");
            goto argument_error;
        }
        aws_byte_buf_reserve(&value_buf, length);
        if (napi_get_value_string_utf8(env, node_name, (char *)name_buf.buffer, name_buf.capacity, &name_buf.len) ||
            napi_get_value_string_utf8(env, node_value, (char *)value_buf.buffer, value_buf.capacity, &value_buf.len)) {
            napi_throw_error(env, NULL, "HTTP header could not be extracted");
            goto argument_error;
        }
        struct aws_http_header header = {.name = aws_byte_cursor_from_buf(&name_buf),
                                         .value = aws_byte_cursor_from_buf(&value_buf)};
        aws_http_message_add_header(request, header);
    }
    aws_byte_buf_clean_up(&name_buf);
    aws_byte_buf_clean_up(&value_buf);

    struct aws_napi_callback on_complete;
    AWS_ZERO_STRUCT(on_complete);
    if (aws_napi_callback_init(&on_complete, env, node_args[5], "aws_http_stream_on_complete", s_on_complete_params)) {
        napi_throw_error(env, NULL, "on_complete must be a callback");
        return NULL;
    }

    struct aws_napi_callback on_response;
    AWS_ZERO_STRUCT(on_response);
    if (!aws_napi_is_null_or_undefined(env, node_args[6])) {
        if (aws_napi_callback_init(
                &on_response, env, node_args[6], "aws_http_stream_on_response", s_on_response_params)) {
            napi_throw_error(env, NULL, "Unable to bind on_response callback");
            return NULL;
        }
    }

    struct aws_napi_callback on_body;
    AWS_ZERO_STRUCT(on_body);
    if (!aws_napi_is_null_or_undefined(env, node_args[7])) {
        if (aws_napi_callback_init(&on_body, env, node_args[7], "aws_http_stream_on_body", s_on_body_params)) {
            napi_throw_error(env, NULL, "Unable to bind on_body callback");
            return NULL;
        }
    }

    struct http_stream_binding *binding = aws_mem_calloc(allocator, 1, sizeof(struct http_stream_binding));
    if (!binding) {
        aws_napi_throw_last_error(env);
        goto failed_binding_alloc;
    }

    binding->body = body;
    binding->body_stream = body_stream;
    binding->on_complete = on_complete;
    binding->on_response = on_response;
    binding->on_body = on_body;
    binding->request = request;

    struct aws_http_make_request_options request_options = {
        .self_size = sizeof(struct aws_http_make_request_options),
        .request = request,
        .user_data = binding,
        .on_response_headers = s_on_response_headers,
        .on_response_header_block_done = s_on_response_header_block_done,
        .on_response_body = s_on_response_body,
        .on_complete = s_on_complete,
        .manual_window_management = false,
    };

    /* becomes the native_handle for the JS object */
    if (napi_create_external(env, binding, s_http_stream_binding_finalize, NULL, &result)) {
        napi_throw_error(env, NULL, "Unable to create stream external");
        goto failed_binding_alloc;
    }

    if (napi_create_reference(env, result, 1, &binding->node_external)) {
        napi_throw_error(env, NULL, "Unable to reference stream external");
        result = NULL;
        goto failed_external;
    }

    struct aws_http_connection *connection = aws_napi_get_http_connection(connection_binding);
    binding->stream = aws_http_connection_make_request(connection, &request_options);

    if (!binding->stream) {
        napi_throw_error(env, NULL, "Unable to create native aws_http_stream");
        result = NULL;
        goto failed_request;
    }

    binding->uv_context = aws_uv_context_get_default();
    if (aws_uv_context_acquire(binding->uv_context, env)) {
        napi_throw_error(env, NULL, "Unable to acquire uv context");
        goto failed_uv;
    }

    goto done;

failed_uv:
failed_request:
failed_external:
failed_binding_alloc:
    aws_napi_callback_clean_up(&on_complete);
    aws_napi_callback_clean_up(&on_response);
    aws_napi_callback_clean_up(&on_body);
    aws_http_message_destroy(request);
    aws_byte_buf_clean_up(&body);
    aws_input_stream_destroy(body_stream);

argument_error:
done:
    aws_string_destroy(method);
    aws_string_destroy(path);

    return result;
}

napi_value aws_napi_http_stream_close(napi_env env, napi_callback_info info) {
    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retrieve callback information");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "http_stream_new needs exactly 8 arguments");
        return NULL;
    }

    struct http_stream_binding *binding = NULL;
    if (napi_get_value_external(env, node_args[0], (void **)&binding)) {
        napi_throw_error(env, NULL, "Unable to extract stream from external");
        return NULL;
    }

    aws_uv_context_release(binding->uv_context);
    aws_napi_callback_clean_up(&binding->on_response);
    aws_napi_callback_clean_up(&binding->on_body);
    aws_napi_callback_clean_up(&binding->on_complete);
    napi_delete_reference(env, binding->node_external);
    aws_http_stream_release(binding->stream);

    return NULL;
}
