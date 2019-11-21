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
#include "http_message.h"
#include "io.h"
#include "module.h"

#include <aws/auth/credentials.h>
#include <aws/auth/signable.h>
#include <aws/auth/signing.h>
#include <aws/auth/signing_config.h>

static struct aws_napi_class_info s_creds_provider_class_info;
static aws_napi_method_fn s_creds_provider_constructor;
static aws_napi_method_fn s_creds_provider_new_default;
static aws_napi_method_fn s_creds_provider_new_static;

static struct aws_napi_class_info s_signing_config_class_info;
static aws_napi_method_fn s_signing_config_constructor;

static aws_napi_property_get_fn s_algorithm_get;
static aws_napi_property_get_fn s_provider_get;
static aws_napi_property_get_fn s_region_get;
static aws_napi_property_get_fn s_service_get;
static aws_napi_property_get_fn s_date_get;
static aws_napi_property_get_fn s_param_blacklist_get;
static aws_napi_property_get_fn s_use_double_uri_encode_get;
static aws_napi_property_get_fn s_should_normalize_uri_path_get;
static aws_napi_property_get_fn s_sign_body_get;

static aws_napi_method_fn s_sign_request_aws;

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
            .method = s_creds_provider_new_default,
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
            &s_creds_provider_class_info),
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
                napi_object,
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
            .attributes = napi_enumerable,
        },
        {
            .name = "provider",
            .type = napi_object,
            .getter = s_provider_get,
            .attributes = napi_enumerable,
        },
        {
            .name = "region",
            .type = napi_string,
            .getter = s_region_get,
            .attributes = napi_enumerable,
        },
        {
            .name = "service",
            .type = napi_string,
            .getter = s_service_get,
            .attributes = napi_enumerable,
        },
        {
            .name = "date",
            .type = napi_object, /* #TODO make napi_date */
            .getter = s_date_get,
            .attributes = napi_enumerable,
        },
        {
            .name = "param_blacklist",
            .type = napi_undefined,
            .getter = s_param_blacklist_get,
            .attributes = napi_enumerable,
        },
        {
            .name = "use_double_uri_encode",
            .type = napi_boolean,
            .getter = s_use_double_uri_encode_get,
            .attributes = napi_enumerable,
        },
        {
            .name = "should_normalize_uri_path",
            .type = napi_boolean,
            .getter = s_should_normalize_uri_path_get,
            .attributes = napi_enumerable,
        },
        {
            .name = "sign_body",
            .type = napi_boolean,
            .getter = s_sign_body_get,
            .attributes = napi_enumerable,
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
            &s_signing_config_class_info),
        { return status; });

    static struct aws_napi_method_info s_signer_request_method = {
        .name = "sign_request_aws",
        .method = s_sign_request_aws,
        .num_arguments = 3,
        .arg_types = {napi_object, napi_object, napi_function},
    };

    AWS_NAPI_CALL(env, aws_napi_define_function(env, exports, &s_signer_request_method), { return status; });

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

    return aws_napi_wrap(env, &s_creds_provider_class_info, creds_provider, s_napi_creds_provider_finalize, result);
}

struct aws_credentials_provider *aws_napi_credentials_provider_unwrap(napi_env env, napi_value js_object) {
    struct aws_credentials_provider *creds_provider = NULL;
    AWS_NAPI_CALL(env, napi_unwrap(env, js_object, (void **)&creds_provider), { return NULL; });

    aws_credentials_provider_acquire(creds_provider);

    return creds_provider;
}

static napi_value s_creds_provider_constructor(napi_env env, const struct aws_napi_callback_info *cb_info) {

    (void)env;

    /* Don't do any construction, object should be empty except prototype and wrapped value */
    return cb_info->native_this;
}

static napi_value s_creds_provider_new_default(napi_env env, const struct aws_napi_callback_info *cb_info) {

    AWS_FATAL_ASSERT(cb_info->num_args == 1);

    struct aws_allocator *allocator = aws_napi_get_allocator();
    const struct aws_napi_argument *arg = NULL;

    aws_napi_method_next_argument(napi_external, cb_info, &arg);
    struct aws_credentials_provider_chain_default_options options;
    options.bootstrap = aws_napi_get_client_bootstrap(arg->native.external);
    struct aws_credentials_provider *provider = aws_credentials_provider_new_chain_default(allocator, &options);

    napi_value node_this = NULL;
    AWS_NAPI_CALL(env, aws_napi_credentials_provider_wrap(env, provider, &node_this), {
        napi_throw_error(env, NULL, "Failed to wrap CredentialsProvider");
        return NULL;
    });

    /* Reference is now held by the node object */
    aws_credentials_provider_release(provider);

    return node_this;
}

static napi_value s_creds_provider_new_static(napi_env env, const struct aws_napi_callback_info *cb_info) {

    AWS_FATAL_ASSERT(cb_info->num_args >= 2);

    struct aws_allocator *allocator = aws_napi_get_allocator();
    const struct aws_napi_argument *arg = NULL;

    struct aws_credentials_provider_static_options options;
    AWS_ZERO_STRUCT(options);

    aws_napi_method_next_argument(napi_string, cb_info, &arg);
    options.access_key_id = aws_byte_cursor_from_buf(&arg->native.string);

    aws_napi_method_next_argument(napi_string, cb_info, &arg);
    options.secret_access_key = aws_byte_cursor_from_buf(&arg->native.string);

    if (aws_napi_method_next_argument(napi_string, cb_info, &arg)) {
        options.session_token = aws_byte_cursor_from_buf(&arg->native.string);
    }

    struct aws_credentials_provider *provider = aws_credentials_provider_new_static(allocator, &options);

    napi_value node_this = NULL;
    AWS_NAPI_CALL(env, aws_napi_credentials_provider_wrap(env, provider, &node_this), {
        napi_throw_error(env, NULL, "Failed to wrap CredentialsProvider");
        return NULL;
    });

    /* Reference is now held by the node object */
    aws_credentials_provider_release(provider);

    return node_this;
}

/***********************************************************************************************************************
 * Signing Config
 **********************************************************************************************************************/

/* #TODO #TBT to that time in the future when we deleted this because we had napi_get_date_value */
static napi_status s_napi_get_date_value(napi_env env, napi_value value, struct aws_date_time *result) {

    napi_valuetype t = napi_undefined;

    napi_value prototype = NULL;
    AWS_NAPI_CALL(env, napi_get_prototype(env, value, &prototype), { return status; });
    napi_typeof(env, prototype, &t);

    napi_value valueOfFn = NULL;
    AWS_NAPI_CALL(env, napi_get_named_property(env, prototype, "getTime", &valueOfFn), { return status; });
    napi_typeof(env, valueOfFn, &t);

    napi_value node_result = NULL;
    AWS_NAPI_CALL(env, napi_call_function(env, value, valueOfFn, 0, NULL, &node_result), { return status; });

    int64_t ms_since_epoch = 0;
    AWS_NAPI_CALL(env, napi_get_value_int64(env, node_result, &ms_since_epoch), { return status; });

    aws_date_time_init_epoch_millis(result, (uint64_t)ms_since_epoch);

    return napi_ok;
}

struct signing_config_binding {
    struct aws_signing_config_aws base;

    struct aws_byte_buf region;
    struct aws_byte_buf service;

    napi_ref date;
    napi_ref node_param_blacklist;

    /**
     * aws_string *
     * this exists so that when should_sign_param is called from off thread, we don't have to hit Node every single time
     */
    struct aws_array_list param_blacklist;
};

struct aws_signing_config_aws *aws_signing_config_aws_prepare_and_unwrap(napi_env env, napi_value js_object) {

    struct signing_config_binding *binding = NULL;
    struct aws_allocator *allocator = aws_napi_get_allocator();

    AWS_NAPI_CALL(env, napi_unwrap(env, js_object, (void **)&binding), {
        napi_throw_error(env, NULL, "Failed to unwrap aws_signing_config_aws");
        return NULL;
    });

    /* Copy the node_param_blacklist into native memory */
    if (binding->node_param_blacklist) {
        napi_value node_param_blacklist = NULL;
        AWS_NAPI_CALL(env, napi_get_reference_value(env, binding->node_param_blacklist, &node_param_blacklist), {
            napi_throw_error(env, NULL, "Failed to unreference node_param_blacklist");
            return NULL;
        });

        uint32_t blacklist_length = 0;
        AWS_NAPI_CALL(env, napi_get_array_length(env, node_param_blacklist, &blacklist_length), {
            napi_throw_error(env, NULL, "Failed to get the length of node_param_blacklist");
            return NULL;
        });

        /* Initialize the string array */
        int err = aws_array_list_init_dynamic(
            &binding->param_blacklist, allocator, blacklist_length, sizeof(struct aws_string *));
        if (err == AWS_OP_ERR) {
            aws_napi_throw_last_error(env);
            return NULL;
        }

        /* Start copying the strings */
        for (uint32_t i = 0; i < blacklist_length; ++i) {
            napi_value param = NULL;
            AWS_NAPI_CALL(env, napi_get_element(env, node_param_blacklist, i, &param), {
                napi_throw_error(env, NULL, "Failed to get element from param blacklist");
                return NULL;
            });

            struct aws_string *param_name = aws_string_new_from_napi(env, param);
            if (!param_name) {
                napi_throw_error(env, NULL, "param blacklist must be array of strings");
                return NULL;
            }

            if (aws_array_list_push_back(&binding->param_blacklist, &param_name)) {
                aws_string_destroy(param_name);
                aws_napi_throw_last_error(env);
                return NULL;
            }
        }
    }

    return &binding->base;
}

static bool s_should_sign_param(const struct aws_byte_cursor *name, void *userdata) {
    struct signing_config_binding *binding = userdata;

    /* If there are params in the black_list, check them all */
    if (binding->param_blacklist.length) {
        const size_t num_blacklisted = aws_array_list_length(&binding->param_blacklist);
        for (size_t i = 0; i < num_blacklisted; ++i) {
            struct aws_string *blacklisted = NULL;
            aws_array_list_get_at(&binding->param_blacklist, &blacklisted, i);
            AWS_ASSUME(blacklisted);

            if (aws_string_eq_byte_cursor_ignore_case(blacklisted, name)) {
                return false;
            }
        }
    }

    return true;
}

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

    const size_t num_blacklisted = binding->param_blacklist.length;
    for (size_t i = 0; i < num_blacklisted; ++i) {
        struct aws_string *blacklisted = NULL;
        aws_array_list_get_at(&binding->param_blacklist, &blacklisted, i);
        aws_string_destroy(blacklisted);
    }

    aws_array_list_clean_up(&binding->param_blacklist);

    if (binding->base.credentials_provider) {
        aws_credentials_provider_release(binding->base.credentials_provider);
    }

    aws_mem_release(allocator, binding);
}

static napi_value s_signing_config_constructor(napi_env env, const struct aws_napi_callback_info *cb_info) {

    struct aws_allocator *allocator = aws_napi_get_allocator();

    struct signing_config_binding *binding = aws_mem_calloc(allocator, 1, sizeof(struct signing_config_binding));
    binding->base.config_type = AWS_SIGNING_CONFIG_AWS;
    binding->base.should_sign_param = s_should_sign_param;
    binding->base.should_sign_param_ud = binding;

    const struct aws_napi_argument *arg = NULL;

    if (aws_napi_method_next_argument(napi_number, cb_info, &arg)) {
        AWS_FATAL_ASSERT(arg == &cb_info->arguments[0]);

        const int64_t algorithm_int = arg->native.number;
        if (algorithm_int < 0 || algorithm_int >= AWS_SIGNING_ALGORITHM_COUNT) {
            napi_throw_error(env, NULL, "Signing algorithm value out of acceptable range");
            goto cleanup;
        }

        binding->base.algorithm = (enum aws_signing_algorithm)algorithm_int;
    }

    if (aws_napi_method_next_argument(napi_object, cb_info, &arg)) {
        binding->base.credentials_provider = arg->native.external;
    }

    if (aws_napi_method_next_argument(napi_string, cb_info, &arg)) {
        binding->region = arg->native.string;
        binding->base.region = aws_byte_cursor_from_buf(&binding->region);
        /* Make sure the buffer doesn't get cleaned up automatically */
        *(struct aws_allocator **)&arg->native.string.allocator = NULL;
    }

    if (aws_napi_method_next_argument(napi_string, cb_info, &arg)) {
        binding->service = arg->native.string;
        binding->base.service = aws_byte_cursor_from_buf(&binding->service);
        /* Make sure the buffer doesn't get cleaned up automatically */
        *(struct aws_allocator **)&arg->native.string.allocator = NULL;
    }

    /* #TODO eventually check for napi_date type (node v11) */
    if (aws_napi_method_next_argument(napi_object, cb_info, &arg)) {
        /* Create the reference so that the getter may return the exact date the user gave us */
        AWS_NAPI_CALL(env, napi_create_reference(env, arg->node, 1, &binding->date), {
            napi_throw_error(env, NULL, "Failed to create reference to date object");
            goto cleanup;
        });

        AWS_NAPI_CALL(env, s_napi_get_date_value(env, arg->node, &binding->base.date), {
            napi_throw_error(env, NULL, "Failed to extract date value");
            goto cleanup;
        });
    }

    if (aws_napi_method_next_argument(napi_object, cb_info, &arg)) {
        bool is_array = false;
        AWS_NAPI_CALL(env, napi_is_array(env, arg->node, &is_array), {
            napi_throw_error(env, NULL, "Failed to check if parameter blacklist is an array");
            goto cleanup;
        });

        if (!is_array) {
            napi_throw_type_error(env, NULL, "parameter blacklist must be an array of strings");
            goto cleanup;
        }

        AWS_NAPI_CALL(env, napi_create_reference(env, arg->node, 1, &binding->node_param_blacklist), {
            napi_throw_error(env, NULL, "Failed to create napi_reference for parameter blacklist");
            goto cleanup;
        });
    }

    if (aws_napi_method_next_argument(napi_boolean, cb_info, &arg)) {
        binding->base.use_double_uri_encode = arg->native.boolean;
    }

    if (aws_napi_method_next_argument(napi_boolean, cb_info, &arg)) {
        binding->base.should_normalize_uri_path = arg->native.boolean;
    }

    if (aws_napi_method_next_argument(napi_boolean, cb_info, &arg)) {
        binding->base.sign_body = arg->native.boolean;
    }

    AWS_NAPI_CALL(env, napi_wrap(env, cb_info->native_this, binding, s_signing_config_finalize, allocator, NULL), {
        napi_throw_error(env, NULL, "Failed to wrap HttpRequest");
        goto cleanup;
    });

    return cb_info->native_this;

cleanup:
    s_signing_config_finalize(env, binding, allocator);
    return NULL;
}

static napi_value s_algorithm_get(napi_env env, void *native_this) {

    struct signing_config_binding *binding = native_this;

    napi_value result = NULL;
    napi_create_uint32(env, binding->base.algorithm, &result);
    return result;
}

static napi_value s_provider_get(napi_env env, void *native_this) {

    struct signing_config_binding *binding = native_this;

    napi_value result = NULL;
    AWS_NAPI_CALL(env, aws_napi_credentials_provider_wrap(env, binding->base.credentials_provider, &result), {});
    return result;
}

static napi_value s_region_get(napi_env env, void *native_this) {
    (void)env;

    struct signing_config_binding *binding = native_this;

    napi_value result = NULL;
    AWS_NAPI_CALL(
        env, napi_create_string_utf8(env, (const char *)binding->region.buffer, binding->region.len, &result), {});
    return result;
}

static napi_value s_service_get(napi_env env, void *native_this) {

    struct signing_config_binding *binding = native_this;

    napi_value result = NULL;
    AWS_NAPI_CALL(
        env, napi_create_string_utf8(env, (const char *)binding->service.buffer, binding->service.len, &result), {});
    return result;
}

static napi_value s_date_get(napi_env env, void *native_this) {

    struct signing_config_binding *binding = native_this;

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
        AWS_NAPI_CALL(
            env,
            napi_create_reference(env, result, 1, &binding->date),
            {
                /* Don't actually throw, since we can just recreate it next time */
            });
    }

    return result;
}

static napi_value s_param_blacklist_get(napi_env env, void *native_this) {

    struct signing_config_binding *binding = native_this;

    napi_value result = NULL;
    if (binding->node_param_blacklist) {
        AWS_NAPI_CALL(env, napi_get_reference_value(env, binding->node_param_blacklist, &result), { return NULL; });
    }
    return result;
}

static napi_value s_use_double_uri_encode_get(napi_env env, void *native_this) {

    struct signing_config_binding *binding = native_this;

    napi_value result = NULL;
    AWS_NAPI_CALL(env, napi_get_boolean(env, binding->base.use_double_uri_encode, &result), {});
    return result;
}

static napi_value s_should_normalize_uri_path_get(napi_env env, void *native_this) {

    struct signing_config_binding *binding = native_this;

    napi_value result = NULL;
    AWS_NAPI_CALL(env, napi_get_boolean(env, binding->base.should_normalize_uri_path, &result), {});
    return result;
}

static napi_value s_sign_body_get(napi_env env, void *native_this) {

    struct signing_config_binding *binding = native_this;

    napi_value result = NULL;
    AWS_NAPI_CALL(env, napi_get_boolean(env, binding->base.sign_body, &result), {});
    return result;
}

/***********************************************************************************************************************
 * Signing
 **********************************************************************************************************************/

struct signer_sign_request_state {
    napi_ref node_config;
    struct aws_signing_config_aws *config;

    napi_ref node_request;
    struct aws_http_message *request;
    struct aws_signable *signable;

    napi_threadsafe_function on_complete;

    int error_code;
};

static void s_sign_request_aws_complete_call(napi_env env, napi_value on_complete, void *context, void *user_data) {

    struct signer_sign_request_state *state = context;
    struct aws_allocator *allocator = user_data;

    napi_value args[1];
    napi_create_int32(env, state->error_code, &args[0]);

    AWS_NAPI_ENSURE(
        env,
        aws_napi_dispatch_threadsafe_function(env, state->on_complete, NULL, on_complete, AWS_ARRAY_SIZE(args), args));

    /* Release references */
    napi_delete_reference(env, state->node_config);
    napi_delete_reference(env, state->node_request);

    aws_mem_release(allocator, state);
}

static void s_sign_request_aws_complete(struct aws_signing_result *result, int error_code, void *userdata) {

    struct signer_sign_request_state *state = userdata;
    struct aws_allocator *allocator = aws_napi_get_allocator();

    aws_signable_destroy(state->signable);

    state->error_code = error_code;
    if (error_code == AWS_ERROR_SUCCESS) {
        aws_apply_signing_result_to_http_request(state->request, allocator, result);
    }

    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(state->on_complete, allocator));
}

static napi_value s_sign_request_aws(napi_env env, const struct aws_napi_callback_info *cb_info) {

    AWS_FATAL_ASSERT(cb_info->num_args == 3);

    struct aws_allocator *allocator = aws_napi_get_allocator();
    const struct aws_napi_argument *arg = NULL;

    struct signer_sign_request_state *state = aws_mem_calloc(allocator, 1, sizeof(struct signer_sign_request_state));

    aws_napi_method_next_argument(napi_object, cb_info, &arg);
    napi_create_reference(env, arg->node, 1, &state->node_request);
    state->request = aws_napi_http_message_unwrap(env, arg->node);
    state->signable = aws_signable_new_http_request(allocator, state->request);

    aws_napi_method_next_argument(napi_object, cb_info, &arg);
    napi_create_reference(env, arg->node, 1, &state->node_config);
    state->config = aws_signing_config_aws_prepare_and_unwrap(env, arg->node);

    aws_napi_method_next_argument(napi_function, cb_info, &arg);
    AWS_NAPI_CALL(
        env,
        aws_napi_create_threadsafe_function(
            env, arg->node, "aws_signer_on_signing_complete", s_sign_request_aws_complete_call, state, &state->on_complete),
        {
            napi_throw_type_error(env, NULL, "on_shutdown must be a valid callback or undefined");
            return NULL;
        });

    if (aws_sign_request_aws(
            allocator,
            state->signable,
            (struct aws_signing_config_base *)state->config,
            s_sign_request_aws_complete,
            state)) {

        aws_napi_throw_last_error(env);
        return NULL;
    }

    return NULL;
}
