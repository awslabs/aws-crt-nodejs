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

#include "class_binder.h"

/**
 * Populates an aws_napi_argument object from a napi value.
 *
 * \param env           The node environment.
 * \param value         The value to pull the value from.
 * \param expected_type The type you expect the value to be. Pass napi_undefined to accept anything.
 * \param out_value     The argument object to populate.
 */
static napi_status s_argument_parse(
    napi_env env,
    napi_value value,
    napi_valuetype expected_type,
    struct aws_napi_argument *out_value) {

    out_value->node = value;
    AWS_NAPI_CALL(env, napi_typeof(env, value, &out_value->type), { return status; });

    if (expected_type != napi_undefined && out_value->type != expected_type) {
        switch (expected_type) {
            case napi_string:
                napi_throw_type_error(env, NULL, "Class binder argument expected a string");
                return napi_string_expected;

            case napi_number:
                napi_throw_type_error(env, NULL, "Class binder argument expected a number");
                return napi_number_expected;

            default:
                napi_throw_type_error(env, NULL, "Class binder argument wrong type");
                return napi_generic_failure;
        }
    }

    switch (expected_type) {
        case napi_string: {
            AWS_NAPI_CALL(env, aws_byte_buf_init_from_napi(&out_value->native.string, env, value), { return status; });

            break;
        }

        case napi_number: {
            AWS_NAPI_CALL(env, napi_get_value_int64(env, value, &out_value->native.number), {
                napi_throw_type_error(env, NULL, "Class binder argument expected a number");
                return status;
            });

            break;
        }

        case napi_external: {
            AWS_NAPI_CALL(env, napi_get_value_external(env, value, &out_value->native.external), {
                napi_throw_type_error(env, NULL, "Class binder argument expected an external");
                return status;
            });

            break;
        }

        default:
            /* Don't process, just leave as node value */
            break;
    }

    return napi_ok;
}

/**
 * Cleans up an aws_napi_argument object populated by s_argument_parse.
 *
 * \param env           The node environment.
 * \param value         The value to clean up.
 */
static void s_argument_cleanup(napi_env env, struct aws_napi_argument *value) {
    (void)env;

    switch (value->type) {
        case napi_string:
            aws_byte_buf_clean_up(&value->native.string);
            break;

        default:
            break;
    }
}

/**
 * Callback used to return the value of a property. Expects 0 arguments.
 */
static napi_value s_property_getter(napi_env env, napi_callback_info info) {

    void *self = NULL;

    napi_value node_this = NULL;
    size_t num_args = 0;
    void *data = NULL;
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, NULL, &node_this, &data), {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    });
    if (num_args != 0) {
        napi_throw_error(env, NULL, "Class binder getter needs exactly 0 arguments");
        return NULL;
    }

    AWS_NAPI_CALL(env, napi_unwrap(env, node_this, &self), {
        napi_throw_error(env, NULL, "Class binder property getter must be called on a wrapped object");
        return NULL;
    });

    const struct aws_napi_property_info *property = data;

    napi_value result = property->getter(env, self, property->userdata);

#if DEBUG_BUILD
    /* In debug builds, validate that getters are returning the correct type */
    napi_valuetype result_type = napi_undefined;
    AWS_NAPI_CALL(env, napi_typeof(env, result, &result_type), { return NULL; });
    AWS_FATAL_ASSERT(property->type == napi_undefined || property->type == result_type);
#endif

    return result;
}

/**
 * Callback used to set the value of a property. Expects 1 argument.
 */
static napi_value s_property_setter(napi_env env, napi_callback_info info) {

    void *self = NULL;

    napi_value node_this = NULL;
    napi_value node_value;
    size_t num_args = 1;
    void *data = NULL;
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, &node_value, &node_this, &data), {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    });
    if (num_args != 1) {
        napi_throw_error(env, NULL, "Class binder setter needs exactly 1 arguments");
        return NULL;
    }

    AWS_NAPI_CALL(env, napi_unwrap(env, node_this, &self), {
        napi_throw_error(env, NULL, "Class binder setter must be called on instance of a wrapped object");
        return NULL;
    });

    const struct aws_napi_property_info *property = data;

    struct aws_napi_argument new_value;
    if (s_argument_parse(env, node_value, property->type, &new_value)) {
        return NULL;
    }

    property->setter(env, self, &new_value, property->userdata);

    s_argument_cleanup(env, &new_value);

    return NULL;
}

/**
 * Callback used to call a method on a bound object.
 */
static napi_value s_method_call(napi_env env, napi_callback_info info) {

    void *self = NULL;
    struct aws_napi_argument args[AWS_NAPI_METHOD_MAX_ARGS];
    AWS_ZERO_ARRAY(args);

    napi_value node_this = NULL;
    napi_value node_args[AWS_NAPI_METHOD_MAX_ARGS];
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    void *data = NULL;
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, &node_this, &data), {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    });

    struct aws_napi_method_info *method = data;
    if (num_args != method->num_arguments) {
        napi_throw_error(env, NULL, "HttpRequest setter needs exactly 1 arguments");
        return NULL;
    }

    AWS_NAPI_CALL(env, napi_unwrap(env, node_this, &self), {
        napi_throw_error(env, NULL, "HttpRequest setter must be called on instance of HttpRequest");
        return NULL;
    });

    napi_value result = NULL;

    for (size_t i = 0; i < method->num_arguments; ++i) {
        if (s_argument_parse(env, node_args[i], method->arg_types[i], &args[i])) {
            goto cleanup_arguments;
        }
    }

    result = method->method(env, self, args, num_args, method->userdata);

cleanup_arguments:
    for (size_t i = 0; i < method->num_arguments; ++i) {
        s_argument_cleanup(env, &args[i]);
    }
    return result;
}

napi_status aws_napi_define_class(
    napi_env env,
    napi_value exports,
    const char *name,
    napi_callback ctor,
    const struct aws_napi_property_info *properties,
    size_t num_properties,
    const struct aws_napi_method_info *methods,
    size_t num_methods,
    napi_value *constructor) {

    struct aws_allocator *allocator = aws_default_allocator();

    const size_t num_descriptors = num_properties + num_methods;
    napi_property_descriptor *descriptors =
        aws_mem_calloc(allocator, num_descriptors, sizeof(napi_property_descriptor));

    size_t desc_i = 0;

    for (size_t prop_i = 0; prop_i < num_properties; ++prop_i) {
        napi_property_descriptor *desc = &descriptors[desc_i++];
        const struct aws_napi_property_info *property = &properties[prop_i];

        AWS_FATAL_ASSERT(property->name);

        desc->utf8name = property->name;
        desc->data = (void *)property;
        desc->getter = s_property_getter;
        desc->setter = s_property_setter;

        desc->attributes = napi_default | napi_enumerable;
        if (property->setter) {
            desc->attributes |= napi_writable;
        }
    }

    for (size_t method_i = 0; method_i < num_methods; ++method_i) {
        napi_property_descriptor *desc = &descriptors[desc_i++];
        const struct aws_napi_method_info *method = &methods[method_i];

        AWS_FATAL_ASSERT(method->name);

        desc->utf8name = method->name;
        desc->data = (void *)method;
        desc->method = s_method_call;
        desc->attributes = napi_default;
    }

    napi_value class_ctor = NULL;
    AWS_NAPI_CALL(
        env, napi_define_class(env, name, NAPI_AUTO_LENGTH, ctor, NULL, num_descriptors, descriptors, &class_ctor), {
            return status;
        });

    aws_mem_release(allocator, descriptors);

    AWS_NAPI_CALL(env, napi_set_named_property(env, exports, name, class_ctor), { return status; });

    if (constructor) {
        *constructor = class_ctor;
    }

    return napi_ok;
}
