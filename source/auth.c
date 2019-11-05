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

#include "auth.h"

#include <aws/auth/credentials.h>

static struct aws_napi_class_info s_creds_provider_clazz;

static aws_napi_method_fn s_creds_provider_constructor;

static aws_napi_method_fn s_creds_provider_new_static;

    napi_status
    aws_napi_credentials_provider_bind(napi_env env, napi_value exports) {
    static const struct aws_napi_method_info s_creds_provider_constructor_info = {
        .name = "credentials_provider",
        .method = s_creds_provider_constructor,
        .num_arguments = 1,
        .arg_types = {napi_external},
    };

    static const struct aws_napi_method_info s_creds_provider_methods[] = {
        {
            .name = "new_default",
            .method = s_creds_provider_constructor,
            .num_arguments = 1,
            .arg_types = {napi_external},
            .attributes = napi_static,
        },
        {
            .name = "new_static",
            .method = s_creds_provider_new_static,
            .num_arguments = 2,
            .arg_types = {napi_string, napi_string, napi_string},
            .attributes = napi_static,
        },
    };

    return aws_napi_define_class(
        env,
        exports,
        &s_creds_provider_constructor_info,
        NULL,
        0,
        s_creds_provider_methods,
        AWS_ARRAY_SIZE(s_creds_provider_methods),
        &s_creds_provider_clazz);
}

/***********************************************************************************************************************
 * Constructor
 **********************************************************************************************************************/

static void s_napi_creds_provider_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;

    aws_credentials_provider_release(finalize_data);
}

static napi_value s_creds_provider_constructor(
    napi_env env,
    void *self,
    const struct aws_napi_argument args[static AWS_NAPI_METHOD_MAX_ARGS],
    size_t num_args) {

    AWS_FATAL_ASSERT(num_args == 1);

    struct aws_allocator *allocator = aws_default_allocator();

    struct aws_credentials_provider_chain_default_options options;
    options.bootstrap = args[0].native.external;
    struct aws_credentials_provider *provider = aws_credentials_provider_new_chain_default(allocator, &options);

    AWS_NAPI_CALL(env, napi_wrap(env, self, provider, s_napi_creds_provider_finalize, NULL, NULL), {
        napi_throw_error(env, NULL, "Failed to wrap credentials_provider");
        return NULL;
    });

    return self;
}

static napi_value s_creds_provider_new_static(
    napi_env env,
    void *self,
    const struct aws_napi_argument args[static AWS_NAPI_METHOD_MAX_ARGS],
    size_t num_args) {

    AWS_FATAL_ASSERT(num_args >= 2);

    struct aws_allocator *allocator = aws_default_allocator();

    struct aws_byte_cursor access_key = aws_byte_cursor_from_buf(&args[0].native.string);
    struct aws_byte_cursor secret_key = aws_byte_cursor_from_buf(&args[1].native.string);

    struct aws_byte_cursor session_token;
    AWS_ZERO_STRUCT(session_token);
    if (num_args >= 3 && args[2].type == napi_string) {
        session_token = aws_byte_cursor_from_buf(&args[2].native.string);
    }

    struct aws_credentials_provider *provider = aws_credentials_provider_new_static(allocator, access_key, secret_key, session_token);

    AWS_NAPI_CALL(env, napi_wrap(env, self, provider, s_napi_creds_provider_finalize, NULL, NULL), {
        napi_throw_error(env, NULL, "Failed to wrap credentials_provider");
        return NULL;
    });

    return NULL;
}
