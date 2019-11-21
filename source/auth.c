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

static aws_napi_method_fn s_aws_sign_request;

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

    static struct aws_napi_method_info s_signer_request_method = {
        .name = "aws_sign_request",
        .method = s_aws_sign_request,
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
 * Signing
 **********************************************************************************************************************/

struct signer_sign_request_state {
    napi_ref node_request;
    struct aws_http_message *request;
    struct aws_signable *signable;

    /**
     * aws_string *
     * this exists so that when should_sign_param is called from off thread, we don't have to hit Node every single time
     */
    struct aws_array_list param_blacklist;

    napi_threadsafe_function on_complete;

    int error_code;
};

static bool s_should_sign_param(const struct aws_byte_cursor *name, void *userdata) {
    struct signer_sign_request_state *state = userdata;

    /* If there are params in the black_list, check them all */
    if (state->param_blacklist.length) {
        const size_t num_blacklisted = aws_array_list_length(&state->param_blacklist);
        for (size_t i = 0; i < num_blacklisted; ++i) {
            struct aws_string *blacklisted = NULL;
            aws_array_list_get_at(&state->param_blacklist, &blacklisted, i);
            AWS_ASSUME(blacklisted);

            if (aws_string_eq_byte_cursor_ignore_case(blacklisted, name)) {
                return false;
            }
        }
    }

    return true;
}

static void s_aws_sign_request_complete_call(napi_env env, napi_value on_complete, void *context, void *user_data) {

    struct signer_sign_request_state *state = context;
    struct aws_allocator *allocator = user_data;

    napi_value args[1];
    napi_create_int32(env, state->error_code, &args[0]);

    AWS_NAPI_ENSURE(
        env,
        aws_napi_dispatch_threadsafe_function(env, state->on_complete, NULL, on_complete, AWS_ARRAY_SIZE(args), args));

    /* Release references */
    napi_delete_reference(env, state->node_request);

    const size_t num_blacklisted = state->param_blacklist.length;
    for (size_t i = 0; i < num_blacklisted; ++i) {
        struct aws_string *blacklisted = NULL;
        aws_array_list_get_at(&state->param_blacklist, &blacklisted, i);
        aws_string_destroy(blacklisted);
    }
    aws_array_list_clean_up(&state->param_blacklist);

    aws_mem_release(allocator, state);
}

static void s_aws_sign_request_complete(struct aws_signing_result *result, int error_code, void *userdata) {

    struct signer_sign_request_state *state = userdata;
    struct aws_allocator *allocator = aws_napi_get_allocator();

    aws_signable_destroy(state->signable);

    state->error_code = error_code;
    if (error_code == AWS_ERROR_SUCCESS) {
        aws_apply_signing_result_to_http_request(state->request, allocator, result);
    }

    AWS_NAPI_ENSURE(NULL, aws_napi_queue_threadsafe_function(state->on_complete, allocator));
}

static bool s_get_named_property(
    napi_env env,
    napi_value object,
    const char *name,
    napi_valuetype type,
    napi_value *result) {
    bool has_property = false;
    if (napi_has_named_property(env, object, name, &has_property) || !has_property) {
        return false;
    }

    napi_value property = NULL;
    if (napi_get_named_property(env, object, name, &property)) {
        return false;
    }

    napi_valuetype property_type = napi_undefined;
    if (napi_typeof(env, property, &property_type)) {
        return false;
    }

    if (property_type != type) {
        return false;
    }

    *result = property;
    return true;
}

static napi_value s_aws_sign_request(napi_env env, const struct aws_napi_callback_info *cb_info) {

    AWS_FATAL_ASSERT(cb_info->num_args == 3);

    struct aws_allocator *allocator = aws_napi_get_allocator();
    const struct aws_napi_argument *arg = NULL;

    struct signer_sign_request_state *state = aws_mem_calloc(allocator, 1, sizeof(struct signer_sign_request_state));
    if (!state) {
        return NULL;
    }

    /* Temp buffers */
    struct aws_byte_buf region_buf;
    AWS_ZERO_STRUCT(region_buf);
    struct aws_byte_buf service_buf;
    AWS_ZERO_STRUCT(service_buf);

    /* Get request */
    aws_napi_method_next_argument(napi_object, cb_info, &arg);
    napi_create_reference(env, arg->node, 1, &state->node_request);
    state->request = aws_napi_http_message_unwrap(env, arg->node);
    state->signable = aws_signable_new_http_request(allocator, state->request);

    /* Populate config */
    struct aws_signing_config_aws config;
    {
        AWS_ZERO_STRUCT(config);
        config.config_type = AWS_SIGNING_CONFIG_AWS;

        aws_napi_method_next_argument(napi_object, cb_info, &arg);
        napi_value js_config = arg->node;
        napi_value current_value = NULL;

        /* Get algorithm */
        if (s_get_named_property(env, js_config, "algorithm", napi_number, &current_value)) {
            int32_t algorithm_int = 0;
            napi_get_value_int32(env, current_value, &algorithm_int);
            if (algorithm_int < 0 || algorithm_int >= AWS_SIGNING_ALGORITHM_COUNT) {
                napi_throw_error(env, NULL, "Signing algorithm value out of acceptable range");
                goto error;
            }

            config.algorithm = (enum aws_signing_algorithm)algorithm_int;
        }

        /* Get provider */
        if (!s_get_named_property(env, js_config, "provider", napi_object, &current_value) ||
            NULL == (config.credentials_provider = aws_napi_credentials_provider_unwrap(env, current_value))) {

            napi_throw_type_error(env, NULL, "Credentials Provider is required");
            goto error;
        }

        /* Get region */
        if (!s_get_named_property(env, js_config, "region", napi_string, &current_value)) {

            napi_throw_type_error(env, NULL, "Region string is required");
            goto error;
        }
        if (aws_byte_buf_init_from_napi(&region_buf, env, current_value)) {

            napi_throw_error(env, NULL, "Failed to build region buffer");
            goto error;
        }
        config.region = aws_byte_cursor_from_buf(&region_buf);

        /* Get service */
        if (s_get_named_property(env, js_config, "service", napi_string, &current_value)) {

            if (aws_byte_buf_init_from_napi(&service_buf, env, current_value)) {

                napi_throw_error(env, NULL, "Failed to build service buffer");
                goto error;
            }

            config.service = aws_byte_cursor_from_buf(&service_buf);
        }

        /* Get date */
        /* #TODO eventually check for napi_date type (node v11) */
        if (s_get_named_property(env, js_config, "date", napi_object, &current_value)) {

            napi_value prototype = NULL;
            AWS_NAPI_CALL(env, napi_get_prototype(env, current_value, &prototype), {
                napi_throw_type_error(env, NULL, "Date param must be a Date object");
                goto error;
            });

            napi_value valueOfFn = NULL;
            AWS_NAPI_CALL(env, napi_get_named_property(env, prototype, "getTime", &valueOfFn), {
                napi_throw_type_error(env, NULL, "Date param must be a Date object");
                goto error;
            });

            napi_value node_result = NULL;
            AWS_NAPI_CALL(env, napi_call_function(env, current_value, valueOfFn, 0, NULL, &node_result), {
                napi_throw_type_error(env, NULL, "Date param must be a Date object");
                goto error;
            });

            int64_t ms_since_epoch = 0;
            AWS_NAPI_CALL(env, napi_get_value_int64(env, node_result, &ms_since_epoch), {
                napi_throw_type_error(env, NULL, "Date param must be a Date object");
                goto error;
            });

            aws_date_time_init_epoch_millis(&config.date, (uint64_t)ms_since_epoch);
        } else {

            aws_date_time_init_now(&config.date);
        }

        /* Get param blacklist */
        if (s_get_named_property(env, js_config, "param_blacklist", napi_object, &current_value)) {
            bool is_array = false;
            AWS_NAPI_CALL(env, napi_is_array(env, current_value, &is_array), {
                napi_throw_error(env, NULL, "Failed to check if parameter blacklist is an array");
                goto error;
            });

            if (!is_array) {
                napi_throw_type_error(env, NULL, "parameter blacklist must be an array of strings");
                goto error;
            }

            uint32_t blacklist_length = 0;
            AWS_NAPI_CALL(env, napi_get_array_length(env, current_value, &blacklist_length), {
                napi_throw_error(env, NULL, "Failed to get the length of node_param_blacklist");
                goto error;
            });

            /* Initialize the string array */
            int err = aws_array_list_init_dynamic(
                &state->param_blacklist, allocator, blacklist_length, sizeof(struct aws_string *));
            if (err == AWS_OP_ERR) {
                aws_napi_throw_last_error(env);
                goto error;
            }

            /* Start copying the strings */
            for (uint32_t i = 0; i < blacklist_length; ++i) {
                napi_value param = NULL;
                AWS_NAPI_CALL(env, napi_get_element(env, current_value, i, &param), {
                    napi_throw_error(env, NULL, "Failed to get element from param blacklist");
                    goto error;
                });

                struct aws_string *param_name = aws_string_new_from_napi(env, param);
                if (!param_name) {
                    napi_throw_error(env, NULL, "param blacklist must be array of strings");
                    goto error;
                }

                if (aws_array_list_push_back(&state->param_blacklist, &param_name)) {
                    aws_string_destroy(param_name);
                    aws_napi_throw_last_error(env);
                    goto error;
                }
            }

            config.should_sign_param = s_should_sign_param;
            config.should_sign_param_ud = state;
        }

        /* Get bools */
        if (s_get_named_property(env, js_config, "use_double_uri_encode", napi_boolean, &current_value)) {
            napi_get_value_bool(env, current_value, &config.use_double_uri_encode);
        } else {
            config.use_double_uri_encode = true;
        }

        if (s_get_named_property(env, js_config, "should_normalize_uri_path", napi_boolean, &current_value)) {
            napi_get_value_bool(env, current_value, &config.should_normalize_uri_path);
        } else {
            config.should_normalize_uri_path = true;
        }

        if (s_get_named_property(env, js_config, "sign_body", napi_boolean, &current_value)) {
            napi_get_value_bool(env, current_value, &config.sign_body);
        } else {
            config.sign_body = false;
        }
    }

    aws_napi_method_next_argument(napi_function, cb_info, &arg);
    AWS_NAPI_CALL(
        env,
        aws_napi_create_threadsafe_function(
            env,
            arg->node,
            "aws_signer_on_signing_complete",
            s_aws_sign_request_complete_call,
            state,
            &state->on_complete),
        {
            napi_throw_type_error(env, NULL, "on_shutdown must be a valid callback or undefined");
            goto error;
        });

    if (aws_sign_request_aws(
            allocator,
            state->signable,
            (struct aws_signing_config_base *)&config,
            s_aws_sign_request_complete,
            state)) {

        aws_napi_throw_last_error(env);
        goto error;
    }

error:
    aws_credentials_provider_release(config.credentials_provider);
    aws_byte_buf_clean_up(&region_buf);
    aws_byte_buf_clean_up(&service_buf);

    return NULL;
}
