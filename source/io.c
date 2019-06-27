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

napi_value error_code_to_string(napi_env env, napi_callback_info info) {

    size_t num_args = 1;
    napi_value node_args[1];
    if (napi_ok != napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    }
    if (num_args != 1) {
        napi_throw_error(env, NULL, "error_code_to_string needs exactly 1 argument");
        return NULL;
    }

    napi_value error_number_val = NULL;
    if (napi_coerce_to_number(env, node_args[0], &error_number_val)) {
        return NULL;
    }

    int64_t error_code = 0;
    if (napi_get_value_int64(env, error_number_val, &error_code)) {
        assert(false); /* Coerce should make this impossible */
    }

    const char *error_string = aws_error_debug_str((int)error_code);

    napi_value error_string_val = NULL;
    napi_create_string_utf8(env, error_string, NAPI_AUTO_LENGTH, &error_string_val);

    return error_string_val;
}

napi_value is_alpn_available(napi_env env, napi_callback_info info) {

    (void)info;

    const bool is_alpn_available = aws_tls_is_alpn_available();

    napi_value node_bool = NULL;
    if (napi_ok != napi_get_boolean(env, is_alpn_available, &node_bool)) {

        napi_throw_error(env, NULL, "Failed to get boolean value");
        return NULL;
    }

    return node_bool;
}

/** Finalizer for an client_bootstrap external */
static void s_client_bootstrap_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct aws_nodejs_client_bootstrap *node_bootstrap = finalize_data;
    assert(node_bootstrap);

    struct aws_allocator *allocator = node_bootstrap->bootstrap->allocator;

    aws_host_resolver_clean_up(&node_bootstrap->resolver);
    aws_client_bootstrap_destroy(node_bootstrap->bootstrap);

    aws_mem_release(allocator, node_bootstrap);
}

napi_value io_client_bootstrap_new(napi_env env, napi_callback_info info) {
    (void)info;

    struct aws_allocator *allocator = aws_default_allocator();

    struct aws_nodejs_client_bootstrap *node_bootstrap =
        aws_mem_acquire(allocator, sizeof(struct aws_nodejs_client_bootstrap));
    AWS_ZERO_STRUCT(*node_bootstrap);

    if (aws_host_resolver_init_default(&node_bootstrap->resolver, allocator, 64, aws_napi_get_node_elg())) {
        goto clean_up;
    }

    node_bootstrap->bootstrap =
        aws_client_bootstrap_new(allocator, aws_napi_get_node_elg(), &node_bootstrap->resolver, NULL);
    if (!node_bootstrap->bootstrap) {
        napi_throw_error(env, NULL, "Failed init client_bootstrap");
        goto clean_up;
    }

    napi_value node_external = NULL;
    if (napi_ok != napi_create_external(env, node_bootstrap, s_client_bootstrap_finalize, NULL, &node_external)) {
        napi_throw_error(env, NULL, "Failed create n-api external");
        goto clean_up;
    }

    return node_external;

clean_up:
    if (node_bootstrap->bootstrap) {
        aws_client_bootstrap_destroy(node_bootstrap->bootstrap);
    }
    if (node_bootstrap->resolver.vtable) {
        aws_host_resolver_clean_up(&node_bootstrap->resolver);
    }
    if (node_bootstrap) {
        aws_mem_release(allocator, node_bootstrap);
    }

    return NULL;
}

/** Finalizer for a tls_ctx external */
static void s_tls_ctx_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct aws_tls_ctx *tls_ctx = finalize_data;
    assert(tls_ctx);

    aws_tls_ctx_destroy(tls_ctx);
}

napi_value io_client_tls_ctx_new(napi_env env, napi_callback_info info) {

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
    aws_tls_ctx_options_init_default_client(&ctx_options, alloc);

    if (!aws_napi_is_null_or_undefined(env, node_args[0])) {
        napi_value node_tls_ver;
        if (napi_ok != napi_coerce_to_number(env, node_args[0], &node_tls_ver)) {
            napi_throw_type_error(
                env, NULL, "First argument (num_threads) must be a Number (or convertable to a Number)");
            return result;
        }
        status = napi_get_value_uint32(env, node_tls_ver, &ctx_options.minimum_tls_version);
        assert(status == napi_ok); /* We coerced the value to a number, so this must return ok */
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[1])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&ctx_options.ca_file, env, node_args[1])) {
            napi_throw_type_error(env, NULL, "Second argument (ca_file) must be a String (or convertable to a String)");
            goto cleanup;
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[2])) {
        ctx_options.ca_path = aws_string_new_from_napi(env, node_args[2]);
        if (!ctx_options.ca_path) {
            napi_throw_type_error(env, NULL, "Third argument (ca_path) must be a String (or convertable to a String)");
            goto cleanup;
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[3])) {
        ctx_options.alpn_list = aws_string_new_from_napi(env, node_args[3]);
        if (!ctx_options.alpn_list) {
            napi_throw_type_error(
                env, NULL, "Fourth argument (alpn_list) must be a String (or convertable to a String)");
            goto cleanup;
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[4])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&ctx_options.certificate, env, node_args[4])) {
            napi_throw_type_error(
                env, NULL, "Fifth argument (cert_path) must be a String (or convertable to a String)");
            goto cleanup;
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_args[5])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&ctx_options.private_key, env, node_args[5])) {
            napi_throw_type_error(
                env, NULL, "Sixth argument (private_key_path) must be a String (or convertable to a String)");
            goto cleanup;
        }
    }

#ifdef __APPLE__
    if (!aws_napi_is_null_or_undefined(env, node_args[6])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&ctx_options.pkcs12, env, node_args[6])) {
, s_new_uv_event_loop, env
, s_new_uv_event_loop, envring (or convertable to a String)");
, s_new_uv_event_loop, env
, s_new_uv_event_loop, env
, s_new_uv_event_loop, env
, s_new_uv_event_loop, env
    if (!aws_napi_is_null_or_undefined(env, node_args[7])) {
        if (napi_ok != aws_byte_buf_init_from_napi(&ctx_options.pkcs12_password, env, node_args[7])) {
            napi_throw_type_error(
                env, NULL, "Eighth argument (pcks12_password) must be a String (or convertable to a String)");
            goto cleanup;
        }
    }
#endif /* __APPLE __ */

    if (!aws_napi_is_null_or_undefined(env, node_args[8])) {
        napi_value node_verify_peer;
        if (napi_ok != napi_coerce_to_bool(env, node_args[8], &node_verify_peer)) {
            napi_throw_type_error(env, NULL, "Ninth argument (verify_peer) must be a Bool (or convertable to a Bool)");
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
    if (!result) {
        aws_tls_ctx_options_clean_up(&ctx_options);
    }

    return result;
}
