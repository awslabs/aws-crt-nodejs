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

#include "auth.h"

#include "class_binder.h"
#include "module.h"

#include <aws/auth/credentials.h>
#include <aws/auth/signing_config.h>

static struct aws_napi_class_info s_creds_provider_clazz;
static aws_napi_method_fn s_creds_provider_constructor;
static aws_napi_method_fn s_creds_provider_new_static;

static struct aws_napi_class_info s_signing_config_clazz;
static aws_napi_method_fn s_signing_config_constructor;

static aws_napi_property_get_fn s_algorithm_get;
static aws_napi_property_set_fn s_algorithm_set;
static aws_napi_property_get_fn s_provider_get;
static aws_napi_property_set_fn s_provider_set;
static aws_napi_property_get_fn s_region_get;
static aws_napi_property_set_fn s_region_set;
static aws_napi_property_get_fn s_service_get;
static aws_napi_property_set_fn s_service_set;
static aws_napi_property_get_fn s_date_get;
static aws_napi_property_set_fn s_date_set;

static aws_napi_property_get_fn s_use_double_uri_encode_get;
static aws_napi_property_set_fn s_use_double_uri_encode_set;
static aws_napi_property_get_fn s_should_normalize_uri_path_get;
static aws_napi_property_set_fn s_should_normalize_uri_path_set;
static aws_napi_property_get_fn s_sign_body_get;
static aws_napi_property_set_fn s_sign_body_set;

napi_status aws_napi_auth_bind(napi_env env, napi_value exports) {
    static const struct aws_napi_method_info s_creds_provider_constructor_info = {
        .name = "AwsCredentialsProvider",
        .method = s_creds_provider_constructor,
        .num_arguments = 1,
        .arg_types = {napi_external},
    };

    static const struct aws_napi_method_info s_creds_provider_methods[] = {
        {
            .name = "newDefault",
            .method = s_creds_provider_constructor,
            .num_arguments = 1,
            .arg_types = {napi_external},
            .attributes = napi_static,
        },
        {
            .name = "newStatic",
            .method = s_creds_provider_new_static,
            .num_arguments = 2,
            .arg_types = {napi_string, napi_string, napi_string},
            .attributes = napi_static,
        },
    };

    AWS_NAPI_CALL(
        env,
        aws_napi_define_class(
            env,
            exports,
            &s_creds_provider_constructor_info,
            NULL,
            0,
            s_creds_provider_methods,
            AWS_ARRAY_SIZE(s_creds_provider_methods),
            &s_creds_provider_clazz),
        { return status; });

    static const struct aws_napi_method_info s_signing_config_constructor_info = {
        .name = "AwsSigningConfig",
        .method = s_signing_config_constructor,
        .arg_types =
            {
                napi_number,
                napi_object,
                napi_string,
                napi_string,
                napi_undefined,
                napi_undefined,
                napi_boolean,
                napi_boolean,
                napi_boolean,
            },
    };

    static const struct aws_napi_property_info s_signing_config_properties[] = {
        {
            .name = "algorithm",
            .type = napi_number,
            .getter = s_algorithm_get,
            .setter = s_algorithm_set,
            .attributes = napi_enumerable | napi_writable,
        },
        {
            .name = "provider",
            .type = napi_object,
            .getter = s_provider_get,
            .setter = s_provider_set,
            .attributes = napi_enumerable | napi_writable,
        },
        {
            .name = "region",
            .type = napi_string,
            .getter = s_region_get,
            .setter = s_region_set,
            .attributes = napi_enumerable | napi_writable,
        },
        {
            .name = "service",
            .type = napi_string,
            .getter = s_service_get,
            .setter = s_service_set,
            .attributes = napi_enumerable | napi_writable,
        },
        {
            .name = "date",
            .type = napi_object, /* #TODO make napi_date */
            .getter = s_date_get,
            .setter = s_date_set,
            .attributes = napi_enumerable | napi_writable,
        },

        /* #TODO implement should_sign_param */

        {
            .name = "use_double_uri_encode",
            .type = napi_boolean,
            .getter = s_use_double_uri_encode_get,
            .setter = s_use_double_uri_encode_set,
            .attributes = napi_enumerable | napi_writable,
        },
        {
            .name = "should_normalize_uri_path",
            .type = napi_boolean,
            .getter = s_should_normalize_uri_path_get,
            .setter = s_should_normalize_uri_path_set,
            .attributes = napi_enumerable | napi_writable,
        },
        {
            .name = "sign_body",
            .type = napi_boolean,
            .getter = s_sign_body_get,
            .setter = s_sign_body_set,
            .attributes = napi_enumerable | napi_writable,
        },
    };

    AWS_NAPI_CALL(
        env,
        aws_napi_define_class(
            env,
            exports,
            &s_signing_config_constructor_info,
            s_signing_config_properties,
            AWS_ARRAY_SIZE(s_signing_config_properties),
            NULL,
            0,
            &s_signing_config_clazz),
        { return status; });

    return napi_ok;
}

/***********************************************************************************************************************
 * Credentials Provider
 **********************************************************************************************************************/

static void s_napi_creds_provider_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;

    aws_credentials_provider_release(finalize_data);
}

napi_status aws_napi_credentials_provider_wrap(
    napi_env env,
    struct aws_credentials_provider *creds_provider,
    napi_value *result) {

    aws_credentials_provider_acquire(creds_provider);

    return aws_napi_wrap(env, &s_creds_provider_clazz, creds_provider, s_napi_creds_provider_finalize, result);
}

struct aws_credentials_provider *aws_napi_credentials_provider_unwrap(napi_env env, napi_value js_object) {
    struct aws_credentials_provider *creds_provider = NULL;
    AWS_NAPI_CALL(env, napi_unwrap(env, js_object, (void **)&creds_provider), { return NULL; });

    aws_credentials_provider_acquire(creds_provider);

    return creds_provider;
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
        napi_throw_error(env, NULL, "Failed to wrap CredentialsProvider");
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

    struct aws_credentials_provider *provider =
        aws_credentials_provider_new_static(allocator, access_key, secret_key, session_token);

    AWS_NAPI_CALL(env, napi_wrap(env, self, provider, s_napi_creds_provider_finalize, NULL, NULL), {
        napi_throw_error(env, NULL, "Failed to wrap CredentialsProvider");
        return NULL;
    });

    return NULL;
}

/***********************************************************************************************************************
 * Signing Config
 **********************************************************************************************************************/

/* #TODO #TBT to that time in the future when we deleted this because we had napi_get_date_value */
static napi_status s_napi_get_date_value(napi_env env, napi_value value, struct aws_date_time *result) {

    napi_value prototype = NULL;
    AWS_NAPI_CALL(env, napi_get_prototype(env, value, &prototype), {
        return status;
    });

    napi_value valueOfFn = NULL;
    AWS_NAPI_CALL(env, napi_get_named_property(env, prototype, "getTime", &valueOfFn), {
        return status;
    });

    napi_value node_result = NULL;
    AWS_NAPI_CALL(env, napi_call_function(env, value, valueOfFn, 0, NULL, &node_result), {
        return status;
    });

    int64_t ms_since_epoch = 0;
    AWS_NAPI_CALL(env, napi_get_value_int64(env, node_result, &ms_since_epoch), {
        return status;
    });

    aws_date_time_init_epoch_millis(result, (uint64_t)ms_since_epoch);

    return napi_ok;
}

struct signing_config_binding {
    struct aws_signing_config_aws base;

    struct aws_byte_buf region;
    struct aws_byte_buf service;

    napi_ref date;
};

static void s_signing_config_finalize(napi_env env, void *finalize_data, void *finalize_hint) {
    (void)env;
    (void)finalize_hint;

    struct signing_config_binding *binding = finalize_data;
    struct aws_allocator *allocator = finalize_hint;

    aws_byte_buf_clean_up(&binding->region);
    aws_byte_buf_clean_up(&binding->service);

    if (binding->date) {
        napi_delete_reference(env, binding->date);
    }

    aws_mem_release(allocator, binding);
}

static napi_value s_signing_config_constructor(
    napi_env env,
    void *self,
    const struct aws_napi_argument args[static AWS_NAPI_METHOD_MAX_ARGS],
    size_t num_args) {

    struct aws_allocator *allocator = aws_default_allocator();

    struct signing_config_binding *binding = aws_mem_calloc(allocator, 1, sizeof(struct signing_config_binding));
    binding->base.config_type = AWS_SIGNING_CONFIG_AWS;

    if (num_args >= 1 && args[0].type == napi_number) {
        const int64_t algorithm_int = args[0].native.number;
        if (algorithm_int < 0 || algorithm_int >= AWS_SIGNING_ALGORITHM_COUNT) {
            napi_throw_error(env, NULL, "Signing algorithm value out of acceptable range");
            goto cleanup;
        }

        binding->base.algorithm = (enum aws_signing_algorithm)algorithm_int;
    }

    if (num_args >= 2 && args[1].type == napi_object) {
        binding->base.credentials_provider = args[0].native.external;
    }

    if (num_args >= 3 && args[2].type == napi_string) {
        binding->region = args[2].native.string;
        binding->base.region = aws_byte_cursor_from_buf(&binding->region);
        /* Make sure the buffer doesn't get cleaned up automatically */
        *(struct aws_allocator **)&args[2].native.string.allocator = NULL;
    }

    if (num_args >= 4 && args[3].type == napi_string) {
        binding->service = args[3].native.string;
        binding->base.service = aws_byte_cursor_from_buf(&binding->service);
        /* Make sure the buffer doesn't get cleaned up automatically */
        *(struct aws_allocator **)&args[3].native.string.allocator = NULL;
    }

    /* #TODO eventually check for napi_date type (node v11) */
    if (num_args >= 5 && args[4].type != napi_undefined) {
        /* Create the reference so that the getter may return the exact date the user gave us */
        AWS_NAPI_CALL(env, napi_create_reference(env, args[4].node, 1, &binding->date), {
            napi_throw_error(env, NULL, "Failed to create reference to date object");
            goto cleanup;
        });

        AWS_NAPI_CALL(env, s_napi_get_date_value(env, args[4].node, &binding->base.date), {
            napi_throw_error(env, NULL, "Failed to extract date value");
            goto cleanup;
        });
    }

    /* TODO: parse arguments 5 */

    if (num_args >= 7 && args[6].type == napi_boolean) {
        binding->base.use_double_uri_encode = args[6].native.boolean;
    }

    if (num_args >= 8 && args[7].type == napi_boolean) {
        binding->base.should_normalize_uri_path = args[7].native.boolean;
    }

    if (num_args >= 9 && args[8].type == napi_boolean) {
        binding->base.sign_body = args[8].native.boolean;
    }

    AWS_NAPI_CALL(env, napi_wrap(env, self, binding, s_signing_config_finalize, allocator, NULL), {
        napi_throw_error(env, NULL, "Failed to wrap HttpRequest");
        goto cleanup;
    });

    return self;

cleanup:
    s_signing_config_finalize(env, binding, allocator);
    return NULL;
}

napi_value s_algorithm_get(napi_env env, void *self) {

    struct signing_config_binding *binding = self;

    napi_value result = NULL;
    napi_create_uint32(env, binding->base.algorithm, &result);
    return result;
}
void s_algorithm_set(napi_env env, void *self, const struct aws_napi_argument *value) {
    (void)env;

    const int64_t algorithm_int = value->native.number;
    if (algorithm_int < 0 || algorithm_int >= AWS_SIGNING_ALGORITHM_COUNT) {
        napi_throw_error(env, NULL, "Signing algorithm value out of acceptable range");
        return;
    }

    struct signing_config_binding *binding = self;
    binding->base.algorithm = (enum aws_signing_algorithm)algorithm_int;
}

napi_value s_provider_get(napi_env env, void *self) {

    struct signing_config_binding *binding = self;

    napi_value result = NULL;
    AWS_NAPI_CALL(env, aws_napi_credentials_provider_wrap(env, binding->base.credentials_provider, &result), {});
    return result;
}
void s_provider_set(napi_env env, void *self, const struct aws_napi_argument *value) {
    (void)env;

    struct signing_config_binding *binding = self;
    binding->base.credentials_provider = value->native.external;
}

napi_value s_region_get(napi_env env, void *self) {
    (void)env;

    struct signing_config_binding *binding = self;

    napi_value result = NULL;
    AWS_NAPI_CALL(env, napi_create_string_utf8(env, (const char *)binding->region.buffer, binding->region.len, &result), {});
    return result;
}
void s_region_set(napi_env env, void *self, const struct aws_napi_argument *value) {
    (void)env;

    struct signing_config_binding *binding = self;

    /* Clean up whatever string was there */
    aws_byte_buf_clean_up(&binding->region);

    binding->region = value->native.string;
    binding->base.region = aws_byte_cursor_from_buf(&binding->region);
    /* Make sure the buffer doesn't get cleaned up automatically */
    *(struct aws_allocator **)&value->native.string.allocator = NULL;
}

napi_value s_service_get(napi_env env, void *self) {

    struct signing_config_binding *binding = self;

    napi_value result = NULL;
    AWS_NAPI_CALL(env, napi_create_string_utf8(env, (const char *)binding->service.buffer, binding->service.len, &result), {});
    return result;
}
void s_service_set(napi_env env, void *self, const struct aws_napi_argument *value) {
    (void)env;

    struct signing_config_binding *binding = self;

    /* Clean up whatever string was there */
    aws_byte_buf_clean_up(&binding->service);

    binding->service = value->native.string;
    binding->base.service = aws_byte_cursor_from_buf(&binding->service);
    /* Make sure the buffer doesn't get cleaned up automatically */
    *(struct aws_allocator **)&value->native.string.allocator = NULL;
}

napi_value s_date_get(napi_env env, void *self) {

    struct signing_config_binding *binding = self;

    napi_value result = NULL;

    if (binding->date) {
        AWS_NAPI_CALL(env, napi_get_reference_value(env, binding->date, &result), {
            napi_throw_error(env, NULL, "Failed to retrieve cached date object");
            return NULL;
        });

    } else {
        /* Clear previous reference */
        if (binding->date) {
            napi_delete_reference(env, binding->date);
        }

        /* Get and call the Date constructor */
        napi_value global = NULL;
        AWS_NAPI_ENSURE(env, napi_get_global(env, &global));

        napi_value Date = NULL;
        AWS_NAPI_CALL(env, napi_get_named_property(env, global, "Date", &Date), {
            napi_throw_error(env, NULL, "Global object doesn't have Date property");
            return NULL;
        });

        const uint64_t ms_since_epoch = aws_date_time_as_millis(&binding->base.date);

        napi_value time_value = 0;
        AWS_NAPI_CALL(env, napi_create_int64(env, (int64_t)ms_since_epoch, &time_value), {
            napi_throw_error(env, NULL, "Failed to create napi double from time value");
            return NULL;
        });

        AWS_NAPI_CALL(env, napi_new_instance(env, Date, 1, &time_value, &result), {
            napi_throw_error(env, NULL, "Failed to create Date object");
            return NULL;
        });

        /* Create the reference so that the getter may return the exact date the user gave us */
        AWS_NAPI_CALL(env, napi_create_reference(env, result, 1, &binding->date), {
            /* Don't actually throw, since we can just recreate it next time */
        });
    }

    return result;
}
void s_date_set(napi_env env, void *self, const struct aws_napi_argument *value) {

    struct signing_config_binding *binding = self;

    /* Create the reference so that the getter may return the exact date the user gave us */
    AWS_NAPI_CALL(env, napi_create_reference(env, value->node, 1, &binding->date), {
        /* Don't actually throw, since we can just recreate it next time */
    });

    AWS_NAPI_CALL(env, s_napi_get_date_value(env, value->node, &binding->base.date), {
        napi_throw_error(env, NULL, "Failed to extract date value");
        return;
    });
}

/* #TODO implement should_sign_param */

napi_value s_use_double_uri_encode_get(napi_env env, void *self) {

    struct signing_config_binding *binding = self;

    napi_value result = NULL;
    AWS_NAPI_CALL(env, napi_get_boolean(env, binding->base.use_double_uri_encode, &result), {});
    return result;
}
void s_use_double_uri_encode_set(napi_env env, void *self, const struct aws_napi_argument *value) {
    (void)env;

    struct signing_config_binding *binding = self;
    binding->base.use_double_uri_encode = value->native.boolean;
}

napi_value s_should_normalize_uri_path_get(napi_env env, void *self) {

    struct signing_config_binding *binding = self;

    napi_value result = NULL;
    AWS_NAPI_CALL(env, napi_get_boolean(env, binding->base.should_normalize_uri_path, &result), {});
    return result;
}
void s_should_normalize_uri_path_set(napi_env env, void *self, const struct aws_napi_argument *value) {
    (void)env;

    struct signing_config_binding *binding = self;
    binding->base.should_normalize_uri_path = value->native.boolean;
}

napi_value s_sign_body_get(napi_env env, void *self) {

    struct signing_config_binding *binding = self;

    napi_value result = NULL;
    AWS_NAPI_CALL(env, napi_get_boolean(env, binding->base.sign_body, &result), {});
    return result;
}
void s_sign_body_set(napi_env env, void *self, const struct aws_napi_argument *value) {
    (void)env;

    struct signing_config_binding *binding = self;
    binding->base.sign_body = value->native.boolean;
}
