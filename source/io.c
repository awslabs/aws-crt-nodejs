/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
#include "io.h"
#include "logger.h"

#include <aws/common/logging.h>
#include <aws/common/mutex.h>
#include <aws/io/channel_bootstrap.h>
#include <aws/io/event_loop.h>
#include <aws/io/socket.h>
#include <aws/io/stream.h>
#include <aws/io/tls_channel_handler.h>

#ifdef _MSC_VER
#    pragma warning(disable : 4456) /* When nesting AWS_NAPI_CALL and AWS_NAPI_ENSURE, status's shadow eachother */
#endif

napi_value aws_napi_error_code_to_string(napi_env env, napi_callback_info info) {

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
        AWS_ASSERT(false); /* Coerce should make this impossible */
    }

    const char *error_string = aws_error_debug_str((int)error_code);

    napi_value error_string_val = NULL;
    if (napi_create_string_utf8(env, error_string, NAPI_AUTO_LENGTH, &error_string_val)) {
        napi_throw_error(env, NULL, "error_code_to_string failed to create return value");
    }

    return error_string_val;
}

napi_value aws_napi_error_code_to_name(napi_env env, napi_callback_info info) {

    size_t num_args = 1;
    napi_value node_args[1];
    if (napi_ok != napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    }
    if (num_args != 1) {
        napi_throw_error(env, NULL, "error_code_to_name needs exactly 1 argument");
        return NULL;
    }

    napi_value error_number_val = NULL;
    if (napi_coerce_to_number(env, node_args[0], &error_number_val)) {
        return NULL;
    }

    int64_t error_code = 0;
    if (napi_get_value_int64(env, error_number_val, &error_code)) {
        AWS_ASSERT(false); /* Coerce should make this impossible */
    }

    const char *error_string = aws_error_name((int)error_code);

    napi_value error_string_val = NULL;
    if (napi_create_string_utf8(env, error_string, NAPI_AUTO_LENGTH, &error_string_val)) {
        napi_throw_error(env, NULL, "error_code_to_name failed to create return value");
    }

    return error_string_val;
}

napi_value aws_napi_io_logging_enable(napi_env env, napi_callback_info info) {
    napi_value node_args[2];
    size_t num_args = AWS_ARRAY_SIZE(node_args);

    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retrieve callback information");
        return NULL;
    }

    enum aws_log_level log_level;
    if (napi_get_value_int32(env, node_args[0], (int32_t *)&log_level)) {
        napi_throw_error(env, NULL, "log_level must be an integer");
        return NULL;
    }

    aws_napi_logger_set_level(log_level);

    return NULL;
}

napi_value aws_napi_is_alpn_available(napi_env env, napi_callback_info info) {
    (void)info;

    const bool is_alpn_available = aws_tls_is_alpn_available();

    napi_value node_bool = NULL;
    if (napi_ok != napi_get_boolean(env, is_alpn_available, &node_bool)) {

        napi_throw_error(env, NULL, "Failed to get boolean value");
        return NULL;
    }

    return node_bool;
}

struct client_bootstrap_binding {
    struct aws_client_bootstrap *bootstrap;
    struct aws_host_resolver resolver;
};

struct aws_client_bootstrap *aws_napi_get_client_bootstrap(struct client_bootstrap_binding *binding) {
    return binding->bootstrap;
}

/** Finalizer for an client_bootstrap external */
static void s_client_bootstrap_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct client_bootstrap_binding *binding = finalize_data;
    AWS_ASSERT(binding);

    struct aws_allocator *allocator = binding->bootstrap->allocator;

    aws_host_resolver_clean_up(&binding->resolver);
    aws_client_bootstrap_release(binding->bootstrap);

    aws_mem_release(allocator, binding);
}

#ifdef _MSC_VER
#    pragma warning(push)
#    pragma warning(disable : 4204 4221) /* non-standard aggregate initializer warnings */
#endif

napi_value aws_napi_io_client_bootstrap_new(napi_env env, napi_callback_info info) {
    (void)info;

    struct aws_allocator *allocator = aws_napi_get_allocator();

    struct client_bootstrap_binding *binding = aws_mem_acquire(allocator, sizeof(struct client_bootstrap_binding));
    AWS_ZERO_STRUCT(*binding);

    if (aws_host_resolver_init_default(&binding->resolver, allocator, 64, aws_napi_get_node_elg())) {
        goto clean_up;
    }

    struct aws_client_bootstrap_options options = {
        .event_loop_group = aws_napi_get_node_elg(),
        .host_resolver = &binding->resolver,
    };

    binding->bootstrap = aws_client_bootstrap_new(allocator, &options);
    if (!binding->bootstrap) {
        napi_throw_error(env, NULL, "Failed init client_bootstrap");
        goto clean_up;
    }

    napi_value node_external = NULL;
    if (napi_ok != napi_create_external(env, binding, s_client_bootstrap_finalize, NULL, &node_external)) {
        napi_throw_error(env, NULL, "Failed create n-api external");
        goto clean_up;
    }

    return node_external;

clean_up:
    if (binding->bootstrap) {
        aws_client_bootstrap_release(binding->bootstrap);
    }
    if (binding->resolver.vtable) {
        aws_host_resolver_clean_up(&binding->resolver);
    }
    if (binding) {
        aws_mem_release(allocator, binding);
    }

    return NULL;
}

#ifdef _MSC_VER
#    pragma warning(pop)
#endif

/** Finalizer for a tls_ctx external */
static void s_tls_ctx_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct aws_tls_ctx *tls_ctx = finalize_data;
    AWS_ASSERT(tls_ctx);

    aws_tls_ctx_destroy(tls_ctx);
}

napi_value aws_napi_io_tls_ctx_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *alloc = aws_napi_get_allocator();
    napi_status status = napi_ok;
    (void)status;

    napi_value node_args[12];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    if (napi_ok != napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "aws_nodejs_io_client_tls_ctx_new needs exactly 12 arguments");
        return NULL;
    }

    napi_value result = NULL;

#ifdef __APPLE__
    struct aws_byte_buf pkcs12_path;
    AWS_ZERO_STRUCT(pkcs12_path);
    struct aws_byte_buf pkcs12_pwd;
    AWS_ZERO_STRUCT(pkcs12_pwd);
#endif

    struct aws_tls_ctx_options ctx_options;
    AWS_ZERO_STRUCT(ctx_options);

    struct aws_string *ca_path = NULL;
    struct aws_string *ca_file = NULL;

    struct aws_byte_buf certificate;
    AWS_ZERO_STRUCT(certificate);
    struct aws_byte_buf private_key;
    AWS_ZERO_STRUCT(private_key);
    struct aws_byte_buf ca_buf;
    AWS_ZERO_STRUCT(ca_buf);

    struct aws_string *cert_path = NULL;
    struct aws_string *pkey_path = NULL;
    struct aws_string *alpn_list = NULL;

    uint32_t min_tls_version = AWS_IO_TLS_VER_SYS_DEFAULTS;
    napi_value node_tls_version = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_tls_version)) {
        napi_value node_number;
        if (napi_ok != napi_coerce_to_number(env, node_tls_version, &node_number)) {
            napi_throw_type_error(env, NULL, "min_tls_version must be an enum/Number (or convertible to a Number)");
            return result;
        }
        status = napi_get_value_uint32(env, node_number, &min_tls_version);
        AWS_FATAL_ASSERT(status == napi_ok); /* We coerced the value to a number, so this must return ok */
    }

    napi_value node_ca_file = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_ca_file)) {
        ca_file = aws_string_new_from_napi(env, node_ca_file);
        if (!ca_file) {
            napi_throw_type_error(env, NULL, "ca_filepath must be a String (or convertible to a String)");
            goto cleanup;
        }
    }

    napi_value node_ca_path = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_ca_path)) {
        ca_path = aws_string_new_from_napi(env, node_ca_path);
        if (!ca_path) {
            napi_throw_type_error(env, NULL, "ca_dirpath must be a String (or convertible to a String)");
            goto cleanup;
        }
    }

    napi_value node_ca_buf = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_ca_buf)) {
        if (aws_byte_buf_init_from_napi(&ca_buf, env, node_ca_buf)) {
            napi_throw_type_error(env, NULL, "certificate_authority must be a String (or convertible to a String)");
            goto cleanup;
        }
    }

    napi_value node_alpn = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_alpn)) {
        alpn_list = aws_string_new_from_napi(env, node_alpn);
        if (!alpn_list) {
            napi_throw_type_error(env, NULL, "alpn_list must be a String (or convertible to a String)");
            goto cleanup;
        }
    }

    napi_value node_cert_path = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_cert_path)) {
        cert_path = aws_string_new_from_napi(env, node_cert_path);
        if (!cert_path) {
            napi_throw_type_error(env, NULL, "cert_path must be a String (or convertible to a String)");
            goto cleanup;
        }
    }

    napi_value node_cert_buf = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_cert_buf)) {
        if (aws_byte_buf_init_from_napi(&certificate, env, node_cert_buf)) {
            napi_throw_type_error(env, NULL, "certificate must be a String (or convertible to a String)");
            goto cleanup;
        }
    }

    napi_value node_key_path = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_key_path)) {
        pkey_path = aws_string_new_from_napi(env, node_key_path);
        if (!pkey_path) {
            napi_throw_type_error(env, NULL, "private_key_path must be a String (or convertible to a String)");
            goto cleanup;
        }
    }

    napi_value node_key_buf = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_key_buf)) {
        if (aws_byte_buf_init_from_napi(&private_key, env, node_key_buf)) {
            napi_throw_type_error(env, NULL, "private_key must be a String (or convertible to a String)");
            goto cleanup;
        }
    }

    napi_value node_pkcs12_path = *arg++;
    napi_value node_pkcs12_password = *arg++;
    (void)node_pkcs12_path;
    (void)node_pkcs12_password;
#ifdef __APPLE__
    if (!aws_napi_is_null_or_undefined(env, node_pkcs12_path)) {
        if (napi_ok != aws_byte_buf_init_from_napi(&pkcs12_path, env, node_pkcs12_path)) {
            napi_throw_type_error(env, NULL, "pkcs12_path must be a String (or convertible to a String)");
            goto cleanup;
        }
    }

    if (!aws_napi_is_null_or_undefined(env, node_pkcs12_password)) {
        if (napi_ok != aws_byte_buf_init_from_napi(&pkcs12_pwd, env, node_pkcs12_password)) {
            napi_throw_type_error(env, NULL, "pkcs12_password must be a String (or convertible to a String)");
            goto cleanup;
        }
    }
#endif /* __APPLE__ */

    bool verify_peer = true;
    napi_value node_verify_peer = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_verify_peer)) {
        napi_value node_bool;
        if (napi_ok != napi_coerce_to_bool(env, node_verify_peer, &node_bool)) {
            napi_throw_type_error(env, NULL, "verify_peer must be a boolean (or convertible to a boolean)");
            goto cleanup;
        }

        status = napi_get_value_bool(env, node_bool, &verify_peer);
        AWS_FATAL_ASSERT(status == napi_ok);
    }

    if (certificate.buffer && private_key.buffer) {
        struct aws_byte_cursor cert_cursor = aws_byte_cursor_from_buf(&certificate);
        struct aws_byte_cursor pkey_cursor = aws_byte_cursor_from_buf(&private_key);
        if (aws_tls_ctx_options_init_client_mtls(&ctx_options, alloc, &cert_cursor, &pkey_cursor)) {
            aws_napi_throw_last_error(env);
            goto cleanup;
        }
    } else if (cert_path && pkey_path) {
        if (aws_tls_ctx_options_init_client_mtls_from_path(
                &ctx_options, alloc, aws_string_c_str(cert_path), aws_string_c_str(pkey_path))) {
            aws_napi_throw_last_error(env);
            goto cleanup;
        }
    } else {
        aws_tls_ctx_options_init_default_client(&ctx_options, alloc);
    }

    if (ca_buf.buffer) {
        struct aws_byte_cursor ca_cursor = aws_byte_cursor_from_buf(&ca_buf);
        if (aws_tls_ctx_options_override_default_trust_store(&ctx_options, &ca_cursor)) {
            aws_napi_throw_last_error(env);
            goto cleanup;
        }
    } else if (ca_path || ca_file) {
        if (aws_tls_ctx_options_override_default_trust_store_from_path(
                &ctx_options, ca_path ? aws_string_c_str(ca_path) : NULL, ca_file ? aws_string_c_str(ca_file) : NULL)) {
            aws_napi_throw_last_error(env);
            goto cleanup;
        }
    }

    if (alpn_list) {
        aws_tls_ctx_options_set_alpn_list(&ctx_options, aws_string_c_str(alpn_list));
    }

    aws_tls_ctx_options_set_verify_peer(&ctx_options, verify_peer);

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
#ifdef __APPLE__
    aws_byte_buf_clean_up_secure(&pkcs12_path);
    aws_byte_buf_clean_up_secure(&pkcs12_pwd);
#endif
    aws_string_destroy_secure(cert_path);
    aws_byte_buf_clean_up_secure(&certificate);
    aws_string_destroy_secure(pkey_path);
    aws_byte_buf_clean_up_secure(&private_key);
    aws_byte_buf_clean_up_secure(&ca_buf);
    aws_string_destroy(alpn_list);
    if (!result) {
        aws_tls_ctx_options_clean_up(&ctx_options);
    }

    return result;
}

void s_tls_connection_options_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;
    struct aws_tls_connection_options *tls_opts = finalize_data;
    aws_tls_connection_options_clean_up(tls_opts);
    aws_mem_release(aws_napi_get_allocator(), tls_opts);
}

napi_value aws_napi_io_tls_connection_options_new(napi_env env, napi_callback_info info) {
    napi_value node_args[3];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    napi_value *arg = &node_args[0];
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retrieve callback information");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "io_tls_connection_options_new requires exactly 3 arguments");
        return NULL;
    }

    napi_value node_external = NULL; /* return value, external that wraps the aws_tls_connection_options */
    struct aws_string *server_name = NULL;
    struct aws_string *alpn_list = NULL;

    napi_value node_tls_ctx = *arg++;
    struct aws_tls_ctx *tls_ctx = NULL;
    AWS_NAPI_CALL(env, napi_get_value_external(env, node_tls_ctx, (void **)&tls_ctx), {
        AWS_NAPI_ENSURE(env, napi_throw_type_error(env, NULL, "Unable to extract aws_tls_ctx from tls_ctx external"));
        return NULL;
    });

    napi_value node_server_name = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_server_name)) {
        server_name = aws_string_new_from_napi(env, node_server_name);
        if (!server_name) {
            AWS_NAPI_ENSURE(env, napi_throw_type_error(env, NULL, "Unable to convert server_name to string"));
            goto cleanup;
        }
    }

    napi_value node_alpn_list = *arg++;
    if (!aws_napi_is_null_or_undefined(env, node_alpn_list)) {
        alpn_list = aws_string_new_from_napi(env, node_alpn_list);
        if (!alpn_list) {
            AWS_NAPI_ENSURE(env, napi_throw_type_error(env, NULL, "Unable to convert alpn_list to string"));
            goto cleanup;
        }
    }

    struct aws_allocator *allocator = aws_napi_get_allocator();
    struct aws_tls_connection_options *tls_opts =
        aws_mem_calloc(allocator, 1, sizeof(struct aws_tls_connection_options));
    AWS_FATAL_ASSERT(tls_opts && "Failed to allocate new aws_tls_connection_options");

    aws_tls_connection_options_init_from_ctx(tls_opts, tls_ctx);

    if (server_name) {
        struct aws_byte_cursor server_name_cursor = aws_byte_cursor_from_string(server_name);
        aws_tls_connection_options_set_server_name(tls_opts, allocator, &server_name_cursor);
    }

    if (alpn_list) {
        aws_tls_connection_options_set_alpn_list(tls_opts, allocator, aws_string_c_str(alpn_list));
    }

    AWS_NAPI_CALL(env, napi_create_external(env, tls_opts, s_tls_connection_options_finalize, NULL, &node_external), {
        goto cleanup;
    });

cleanup:
    aws_string_destroy(server_name);
    aws_string_destroy(alpn_list);
    return node_external;
}

void s_socket_options_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;

    struct aws_socket_options *socket_options = finalize_data;
    aws_mem_release(aws_napi_get_allocator(), socket_options);
}

napi_value aws_napi_io_socket_options_new(napi_env env, napi_callback_info info) {
    napi_value node_args[7];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retrieve callback information");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "io_socket_options_new requires exactly 7 arguments");
        return NULL;
    }

    struct aws_socket_options options;

    uint32_t enum_value = 0;
    if (napi_get_value_uint32(env, node_args[0], &enum_value) || enum_value > AWS_SOCKET_DGRAM) {
        napi_throw_type_error(env, NULL, "First argument (type) must be a Number between 0 and 1");
        return NULL;
    }
    options.type = (enum aws_socket_type)enum_value;

    if (napi_get_value_uint32(env, node_args[1], &enum_value) || enum_value > AWS_SOCKET_LOCAL) {
        napi_throw_type_error(env, NULL, "Second argument (domain) must be a Number between 0 and 2");
        return NULL;
    }
    options.domain = (enum aws_socket_domain)enum_value;

    if (napi_get_value_uint32(env, node_args[2], &enum_value) || enum_value > UINT16_MAX) {
        napi_throw_type_error(env, NULL, "Third argument (connect_timeout_ms) must be a Number");
        return NULL;
    }
    options.connect_timeout_ms = (uint16_t)enum_value;

    uint32_t keep_alive_interval_sec;
    if (napi_get_value_uint32(env, node_args[3], &keep_alive_interval_sec)) {
        napi_throw_type_error(
            env, NULL, "Fourth argument (keep_alive_interval_sec) must be a Number between 0 and 32767");
        return NULL;
    }
    options.keep_alive_interval_sec = (keep_alive_interval_sec > 0x7fff) ? 0x7fff : (uint16_t)keep_alive_interval_sec;

    uint32_t keep_alive_timeout_sec;
    if (napi_get_value_uint32(env, node_args[4], &keep_alive_timeout_sec)) {
        napi_throw_type_error(
            env, NULL, "Fifth argument (keep_alive_timeout_sec) must be a Number between 0 and 32767");
        return NULL;
    }
    options.keep_alive_timeout_sec = (keep_alive_timeout_sec > 0x7fff) ? 0x7fff : (uint16_t)keep_alive_timeout_sec;

    uint32_t keep_alive_max_failed_probes;
    if (napi_get_value_uint32(env, node_args[5], &keep_alive_max_failed_probes)) {
        napi_throw_type_error(
            env, NULL, "Sixth argument (keep_alive_max_failed_probes) must be a Number between 0 and 32767");
        return NULL;
    }
    options.keep_alive_max_failed_probes =
        (keep_alive_max_failed_probes > 0x7fff) ? 0x7fff : (uint16_t)keep_alive_max_failed_probes;

    if (napi_get_value_bool(env, node_args[6], &options.keepalive)) {
        napi_throw_type_error(env, NULL, "Seventh argument (keepalive) must be a Boolean value");
        return NULL;
    }

    struct aws_allocator *allocator = aws_napi_get_allocator();
    struct aws_socket_options *socket_options = aws_mem_acquire(allocator, sizeof(struct aws_socket_options));
    if (!socket_options) {
        aws_napi_throw_last_error(env);
        return NULL;
    }

    *socket_options = options;

    napi_value node_external;
    if (napi_create_external(env, socket_options, s_socket_options_finalize, NULL, &node_external)) {
        aws_mem_release(allocator, socket_options);
        aws_napi_throw_last_error(env);
        return NULL;
    }

    return node_external;
}

struct aws_napi_input_stream_impl {
    /* this MUST be the first member, allows polymorphism with aws_input_stream* */
    struct aws_input_stream base;
    struct aws_byte_buf buffer;
    struct aws_byte_cursor cursor;
    struct aws_mutex mutex;
    size_t bytes_read; /* bytes already consumed by the reader, flushed from the buffer */
    bool eos;          /* end of stream */
};

static int s_input_stream_seek(struct aws_input_stream *stream, aws_off_t offset, enum aws_stream_seek_basis basis) {
    struct aws_napi_input_stream_impl *impl = stream->impl;

    int result = AWS_OP_SUCCESS;
    uint64_t final_offset = 0;
    int64_t checked_offset = offset;

    aws_mutex_lock(&impl->mutex);
    uint64_t total_bytes = impl->bytes_read + impl->buffer.len;

    switch (basis) {
        case AWS_SSB_BEGIN:
            /* Offset must be positive, must be greater than the bytes already read (because those
             * bytes are gone from the buffer), and must not be greater than the sum of the bytes
             * read so far and the size of the buffer
             */
            if (checked_offset < 0 || (uint64_t)checked_offset > total_bytes ||
                (uint64_t)checked_offset < impl->bytes_read) {
                result = AWS_IO_STREAM_INVALID_SEEK_POSITION;
                goto failed;
            }
            final_offset = (uint64_t)checked_offset - impl->bytes_read;
            break;
        case AWS_SSB_END:
            /* Offset must be negative, and must not be trying to go further back than the
             * current length of the buffer, because those bytes have been purged
             */
            if (checked_offset > 0 || checked_offset == INT64_MIN || (uint64_t)(-checked_offset) > impl->buffer.len) {
                result = AWS_IO_STREAM_INVALID_SEEK_POSITION;
                goto failed;
            }
            final_offset = (uint64_t)impl->buffer.len - (uint64_t)(-checked_offset);
            break;
    }

    AWS_ASSERT(final_offset <= SIZE_MAX);
    size_t buf_offset = (size_t)final_offset;
    AWS_ASSERT(buf_offset <= impl->buffer.len);

    if (buf_offset == impl->buffer.len) {
        impl->bytes_read += impl->buffer.len;
        impl->buffer.len = 0;
    } else if (buf_offset > 0) {
        size_t new_len = impl->buffer.len - buf_offset;
        memmove(impl->buffer.buffer, impl->buffer.buffer + buf_offset, new_len);
        impl->buffer.len = new_len;
    }

failed:
    aws_mutex_unlock(&impl->mutex);
    return result;
}

static int s_input_stream_read(struct aws_input_stream *stream, struct aws_byte_buf *dest) {
    struct aws_napi_input_stream_impl *impl = stream->impl;

    size_t bytes_to_read = dest->capacity - dest->len;
    if (bytes_to_read > impl->buffer.len) {
        bytes_to_read = impl->buffer.len;
    }

    if (!aws_byte_buf_write(dest, impl->buffer.buffer, bytes_to_read)) {
        return AWS_OP_ERR;
    }

    /* seek the stream past what's been read to advance the buffer/bytes_read */
    aws_input_stream_seek(&impl->base, impl->bytes_read + bytes_to_read, AWS_SSB_BEGIN);
    return AWS_OP_SUCCESS;
}

static int s_input_stream_get_status(struct aws_input_stream *stream, struct aws_stream_status *status) {
    struct aws_napi_input_stream_impl *impl = stream->impl;
    aws_mutex_lock(&impl->mutex);
    status->is_end_of_stream = impl->eos;
    aws_mutex_unlock(&impl->mutex);
    status->is_valid = true;
    return AWS_OP_SUCCESS;
}

static int s_input_stream_get_length(struct aws_input_stream *stream, int64_t *out_length) {
    (void)stream;
    (void)out_length;
    return aws_raise_error(AWS_ERROR_UNIMPLEMENTED);
}

static void s_input_stream_destroy(struct aws_input_stream *stream) {
    struct aws_napi_input_stream_impl *impl = stream->impl;
    struct aws_allocator *allocator = impl->buffer.allocator;
    aws_mutex_clean_up(&impl->mutex);
    aws_byte_buf_clean_up(&impl->buffer);
    aws_mem_release(allocator, impl);
}

static struct aws_input_stream_vtable s_input_stream_vtable = {
    .seek = s_input_stream_seek,
    .read = s_input_stream_read,
    .get_status = s_input_stream_get_status,
    .get_length = s_input_stream_get_length,
    .destroy = s_input_stream_destroy,
};

napi_value aws_napi_io_input_stream_new(napi_env env, napi_callback_info info) {
    napi_value node_args[1];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retrieve callback information");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "io_input_stream_new requires exactly 1 arguments");
        return NULL;
    }

    int64_t capacity = 0;
    if (napi_get_value_int64(env, node_args[0], &capacity)) {
        napi_throw_error(env, NULL, "capacity must be a number");
        return NULL;
    }

    struct aws_allocator *allocator = aws_napi_get_allocator();
    struct aws_napi_input_stream_impl *impl = aws_mem_calloc(allocator, 1, sizeof(struct aws_napi_input_stream_impl));
    if (!impl) {
        napi_throw_error(env, NULL, "Unable to allocate native aws_input_stream");
        return NULL;
    }

    impl->base.allocator = allocator;
    impl->base.impl = impl;
    impl->base.vtable = &s_input_stream_vtable;
    if (aws_mutex_init(&impl->mutex)) {
        aws_napi_throw_last_error(env);
        goto failed;
    }

    if (aws_byte_buf_init(&impl->buffer, allocator, 16 * 1024)) {
        napi_throw_error(env, NULL, "Unable to allocate stream buffer");
        goto failed;
    }

    napi_value node_external = NULL;
    if (napi_create_external(env, impl, NULL, NULL, &node_external)) {
        napi_throw_error(env, NULL, "Unable to create external for native aws_input_stream");
        goto failed;
    }

    return node_external;

failed:
    if (impl) {
        s_input_stream_destroy(&impl->base);
    }

    return NULL;
}

napi_value aws_napi_io_input_stream_append(napi_env env, napi_callback_info info) {
    napi_value node_args[2];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    if (napi_get_cb_info(env, info, &num_args, node_args, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retrieve callback information");
        return NULL;
    }
    if (num_args != AWS_ARRAY_SIZE(node_args)) {
        napi_throw_error(env, NULL, "io_input_stream_append requires exactly 2 arguments");
        return NULL;
    }

    struct aws_napi_input_stream_impl *impl = NULL;
    if (napi_get_value_external(env, node_args[0], (void **)&impl)) {
        napi_throw_error(env, NULL, "stream must be a node external");
        return NULL;
    }

    /* null means end of stream */
    if (aws_napi_is_null_or_undefined(env, node_args[1])) {
        aws_mutex_lock(&impl->mutex);
        impl->eos = true;
        aws_mutex_unlock(&impl->mutex);
        return NULL;
    }

    /* not null or undefined, so it should be a buffer */
    bool is_buffer = false;
    if (napi_is_buffer(env, node_args[1], &is_buffer) || !is_buffer) {
        napi_throw_error(env, NULL, "buffer must be a valid Buffer object or undefined/null");
        return NULL;
    }

    struct aws_byte_cursor data;
    if (napi_get_buffer_info(env, node_args[1], (void **)&data.ptr, &data.len)) {
        napi_throw_error(env, NULL, "Unable to extract data from buffer");
        return NULL;
    }

    aws_mutex_lock(&impl->mutex);
    aws_byte_buf_append(&impl->buffer, &data);
    aws_mutex_unlock(&impl->mutex);

    return NULL;
}
