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
#include "module.h"

#include <aws/io/channel_bootstrap.h>
#include <aws/io/event_loop.h>
#include <aws/io/tls_channel_handler.h>

napi_value aws_nodejs_is_alpn_available(napi_env env, napi_callback_info info) {

    (void)info;

    const bool is_alpn_available = aws_tls_is_alpn_available();

    napi_value node_bool;
    if (napi_ok!= napi_get_boolean(env, is_alpn_available, &node_bool)) {

        napi_throw_error(env, NULL, "Failed to get boolean value");
        return NULL;
    }

    return node_bool;
}

/** Finalizer for an ELG external */
static void s_elg_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct aws_event_loop_group *elg = finalize_data;
    assert(elg);

    struct aws_allocator *allocator = elg->allocator;

    aws_event_loop_group_clean_up(elg);
    aws_mem_release(allocator, elg);
}

napi_value aws_nodejs_io_event_loop_group_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();

    size_t num_args = 1;
    napi_value node_num_threads;
    if (napi_ok != napi_get_cb_info(env, info, &num_args, &node_num_threads, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    }
    if (num_args < 1) {
        napi_throw_error(env, NULL, "aws_nodejs_io_event_loop_group_new needs at least 1 argument");
        return NULL;
    }

    uint32_t num_threads = 0;
    napi_status status = napi_get_value_uint32(env, node_num_threads, &num_threads);
    if (status == napi_invalid_arg) {
        napi_throw_type_error(env, NULL, "Expected number");
        return NULL;
    }
    assert(status == napi_ok); /* napi_ok and napi_invalid_arg are the only possible return values */

    struct aws_event_loop_group *elg = aws_mem_acquire(allocator, sizeof(struct aws_event_loop_group));
    if (!elg) {
        napi_throw_error(env, NULL, "Failed to allocate memory");
        return NULL;
    }
    AWS_ZERO_STRUCT(*elg);

    if (aws_event_loop_group_default_init(elg, allocator, num_threads)) {
        aws_mem_release(allocator, elg);
        napi_throw_error(env, NULL, "Failed init ELG");
        return NULL;
    }

    napi_value node_external;
    if (napi_ok != napi_create_external(env, elg, s_elg_finalize, NULL, &node_external)) {
        aws_event_loop_group_clean_up(elg);
        aws_mem_release(allocator, elg);
        napi_throw_error(env, NULL, "Failed create n-api external");
        return NULL;
    }

    return node_external;
}

/** Finalizer for an client_bootstrap external */
static void s_client_bootstrap_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct aws_client_bootstrap *client_bootstrap = finalize_data;
    assert(client_bootstrap);

    struct aws_allocator *allocator = client_bootstrap->allocator;

    aws_client_bootstrap_clean_up(client_bootstrap);
    aws_mem_release(allocator, client_bootstrap);
}

napi_value aws_nodejs_io_client_bootstrap_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();

    size_t num_args = 1;
    napi_value node_elg;
    if (napi_ok != napi_get_cb_info(env, info, &num_args, &node_elg, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    }
    if (num_args < 1) {
        napi_throw_error(env, NULL, "aws_nodejs_io_client_bootstrap_new needs at least 1 argument");
        return NULL;
    }

    struct aws_event_loop_group *elg = NULL;
    napi_status status = napi_get_value_external(env, node_elg, (void **)&elg);
    if (status == napi_invalid_arg) {
        napi_throw_type_error(env, NULL, "Expected event loop group");
        return NULL;
    }
    assert(status == napi_ok); /* napi_ok and napi_invalid_arg are the only possible return values */

    struct aws_client_bootstrap *client_bootstrap = aws_mem_acquire(allocator, sizeof(struct aws_client_bootstrap));
    if (!client_bootstrap) {
        napi_throw_error(env, NULL, "Failed to allocate memory");
        return NULL;
    }
    AWS_ZERO_STRUCT(*client_bootstrap);

    if (aws_client_bootstrap_init(client_bootstrap, allocator, elg, NULL, NULL)) {
        aws_mem_release(allocator, client_bootstrap);
        napi_throw_error(env, NULL, "Failed init client_bootstrap");
        return NULL;
    }

    napi_value node_external;
    if (napi_ok != napi_create_external(env, client_bootstrap, s_client_bootstrap_finalize, NULL, &node_external)) {
        aws_client_bootstrap_clean_up(client_bootstrap);
        aws_mem_release(allocator, client_bootstrap);
        napi_throw_error(env, NULL, "Failed create n-api external");
        return NULL;
    }

    return node_external;
}

/** Finalizer for a tls_ctx external */
static void s_tls_ctx_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct aws_tls_ctx *tls_ctx = finalize_data;
    assert(tls_ctx);

    aws_tls_ctx_destroy(tls_ctx);
}

napi_value aws_nodejs_io_client_tls_ctx_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *alloc = aws_default_allocator();
    napi_status status = napi_ok;

    size_t num_args = 9;
    napi_value node_args[9];
    if (napi_ok != napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    }
    if (num_args != 9) {
        napi_throw_error(env, NULL, "aws_nodejs_io_client_tls_ctx_new needs exactly 9 arguments");
        return NULL;
    }

    napi_value result = NULL;

    struct aws_tls_ctx_options ctx_options;
    aws_tls_ctx_options_init_default_client(&ctx_options);

    if (!aws_napi_is_null_or_undefined(env, node_args[0])) {
        napi_value node_tls_ver;
        if (napi_ok != napi_coerce_to_number(env, node_args[0], &node_tls_ver)) {
            napi_throw_type_error(env, NULL, "First argument must be a Number (or convertable to a Number)");
            return result;
        }
        status = napi_get_value_uint32(env, node_tls_ver, &ctx_options.minimum_tls_version);
        assert(status == napi_ok); /* We coerced the value to a number, so this must return ok */
    }

    struct aws_byte_buf ca_file;
    AWS_ZERO_STRUCT(ca_file);
    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&ca_file, env, node_args[1])) {
            napi_throw_type_error(env, NULL, "Second argument must be a String (or convertable to a String)");
            goto cleanup;
        }
        ctx_options.ca_file = (const char *)ca_file.buffer;
    }

    struct aws_byte_buf ca_path;
    AWS_ZERO_STRUCT(ca_path);
    if (!aws_napi_is_null_or_undefined(env, node_args[2])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&ca_path, env, node_args[2])) {
            napi_throw_type_error(env, NULL, "Third argument must be a String (or convertable to a String)");
            goto cleanup;
        }
        ctx_options.ca_path = (const char *)ca_path.buffer;
    }

    struct aws_byte_buf alpn_list;
    AWS_ZERO_STRUCT(alpn_list);
    if (!aws_napi_is_null_or_undefined(env, node_args[3])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&alpn_list, env, node_args[3])) {
            napi_throw_type_error(env, NULL, "Fourth argument must be a String (or convertable to a String)");
            goto cleanup;
        }
        aws_tls_ctx_options_set_alpn_list(&ctx_options, (const char *)alpn_list.buffer);
    }

    struct aws_byte_buf certificate_path;
    AWS_ZERO_STRUCT(certificate_path);
    if (!aws_napi_is_null_or_undefined(env, node_args[4])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&certificate_path, env, node_args[4])) {
            napi_throw_type_error(env, NULL, "Fifth argument must be a String (or convertable to a String)");
            goto cleanup;
        }
        ctx_options.certificate_path = (const char *)certificate_path.buffer;
    }

    struct aws_byte_buf private_key_path;
    AWS_ZERO_STRUCT(private_key_path);
    if (!aws_napi_is_null_or_undefined(env, node_args[5])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&private_key_path, env, node_args[5])) {
            napi_throw_type_error(env, NULL, "Sixth argument must be a String (or convertable to a String)");
            goto cleanup;
        }
        ctx_options.private_key_path = (const char *)private_key_path.buffer;
    }

    struct aws_byte_buf pkcs12_path;
    AWS_ZERO_STRUCT(pkcs12_path);
    if (!aws_napi_is_null_or_undefined(env, node_args[6])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&pkcs12_path, env, node_args[6])) {
            napi_throw_type_error(env, NULL, "Seventh argument must be a String (or convertable to a String)");
            goto cleanup;
        }
        ctx_options.pkcs12_path = (const char *)pkcs12_path.buffer;
    }

    struct aws_byte_buf pkcs12_password;
    AWS_ZERO_STRUCT(pkcs12_password);
    if (!aws_napi_is_null_or_undefined(env, node_args[7])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&pkcs12_password, env, node_args[7])) {
            napi_throw_type_error(env, NULL, "Eighth argument must be a String (or convertable to a String)");
            goto cleanup;
        }
        ctx_options.pkcs12_password = (const char *)pkcs12_password.buffer;
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[8])) {
        napi_value node_verify_peer;
        if (napi_ok != napi_coerce_to_bool(env, node_args[8], &node_verify_peer)) {
            napi_throw_type_error(env, NULL, "Ninth argument must be a Bool (or convertable to a Bool)");
            goto cleanup;
        }

        bool verify_peer = false;
        status = napi_get_value_bool(env, node_verify_peer, &verify_peer);
        assert(status == napi_ok);
        aws_tls_ctx_options_set_verify_peer(&ctx_options, verify_peer);
    }

    struct aws_tls_ctx *tls_ctx = aws_tls_client_ctx_new(alloc, &ctx_options);
    if (!tls_ctx) {
        napi_throw_error(env, NULL, "Unable to create TLS context");
        goto cleanup;
    }

    napi_value node_external;
    if (napi_ok != napi_create_external(env, tls_ctx, s_tls_ctx_finalize, NULL, &node_external)) {
        napi_throw_error(env, NULL, "Failed create n-api external");
        goto cleanup;
    }

    result = node_external;

cleanup:
    aws_byte_buf_clean_up(&ca_file);
    aws_byte_buf_clean_up(&ca_path);
    aws_byte_buf_clean_up(&alpn_list);
    aws_byte_buf_clean_up(&certificate_path);
    aws_byte_buf_clean_up(&private_key_path);
    aws_byte_buf_clean_up(&pkcs12_path);
    aws_byte_buf_clean_up(&pkcs12_password);

    return result;
}
