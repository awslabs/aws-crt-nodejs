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

struct aws_napi_class_info_impl {
    const struct aws_napi_method_info *ctor_method;

    napi_ref constructor;
    bool is_wrapping;
};

/* Make sure our static storage is big enough */
AWS_STATIC_ASSERT(sizeof(struct aws_napi_class_info) >= sizeof(struct aws_napi_class_info_impl));

/**
 * Populates an aws_napi_argument object from a napi value.
 *
 * \param env               The node environment.
 * \param value             The value to pull the value from.
 * \param expected_type     The type you expect the value to be. Pass napi_undefined to accept anything.
 * \param accept_undefined  Whether or not to accept expected_type OR undefined
 * \param out_value         The argument object to populate.
 */
static napi_status s_argument_parse(
    napi_env env,
    napi_value value,
    napi_valuetype expected_type,
    bool accept_undefined,
    struct aws_napi_argument *out_value) {

    out_value->node = value;
    AWS_NAPI_CALL(env, napi_typeof(env, value, &out_value->type), { return status; });

    if (expected_type != napi_undefined && out_value->type != expected_type &&
        !(accept_undefined && out_value->type == napi_undefined)) {
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

    switch (out_value->type) {
        case napi_boolean: {
            AWS_NAPI_CALL(env, napi_get_value_bool(env, value, &out_value->native.boolean), { return status; });

            break;
        }

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

        case napi_object: {
            /* Attempt to unwrap the object, just in case */
            napi_status result = napi_unwrap(env, value, &out_value->native.external);
            if (result != napi_ok) {
                out_value->native.external = NULL;
            }

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
 * Used as the class's constructor
 */
static napi_value s_constructor(napi_env env, napi_callback_info info) {

    napi_value node_args[AWS_NAPI_METHOD_MAX_ARGS];
    napi_value node_this = NULL;
    size_t num_args = AWS_ARRAY_SIZE(node_args);
    struct aws_napi_class_info_impl *clazz = NULL;
    AWS_NAPI_CALL(env, napi_get_cb_info(env, info, &num_args, node_args, &node_this, (void **)&clazz), {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    });
    if (num_args > AWS_NAPI_METHOD_MAX_ARGS) {
        num_args = AWS_NAPI_METHOD_MAX_ARGS;
    }

    napi_value result = NULL;

    /* Check if we're wrapping an existing object or creating a new one */
    if (clazz->is_wrapping) {
        AWS_FATAL_ASSERT(num_args == 1);

        void *native = NULL;

        /* Arg 1 should be an external */
        AWS_NAPI_ENSURE(env, napi_get_value_external(env, node_args[0], &native));

        /* Wrap shouldn't take a finalizer, because it's very likely that this object isn't owned by JS */
        AWS_NAPI_CALL(env, napi_wrap(env, node_this, native, NULL, NULL, NULL), {
            napi_throw_error(env, NULL, "Failed to wrap http_request");
            return NULL;
        });

    } else {
        const struct aws_napi_method_info *method = clazz->ctor_method;

        /* If there is no ctor method, don't both doing anything more, just return the empty object */
        if (method->method) {
            struct aws_napi_argument args[AWS_NAPI_METHOD_MAX_ARGS];
            AWS_ZERO_ARRAY(args);

            if (num_args < method->num_arguments) {
                napi_throw_error(env, NULL, "Class binder constructor given incorrect number of arguments");
                return NULL;
            }

            for (size_t i = 0; i < num_args; ++i) {
                if (s_argument_parse(env, node_args[i], method->arg_types[i], i >= method->num_arguments, &args[i])) {
                    goto cleanup_arguments;
                }
            }

            method->method(env, node_this, args, num_args);

        cleanup_arguments:
            for (size_t i = 0; i < method->num_arguments; ++i) {
                s_argument_cleanup(env, &args[i]);
            }
        }
    }

    return result;
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

    napi_value result = property->getter(env, self);

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
    if (s_argument_parse(env, node_value, property->type, false, &new_value)) {
        return NULL;
    }

    property->setter(env, self, &new_value);

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
    if (num_args > AWS_NAPI_METHOD_MAX_ARGS) {
        num_args = AWS_NAPI_METHOD_MAX_ARGS;
    }

    struct aws_napi_method_info *method = data;
    if (num_args < method->num_arguments) {
        napi_throw_error(env, NULL, "Bound class's method requires more arguments");
        return NULL;
    }

    if ((method->attributes & napi_static) == 0) {
        AWS_NAPI_CALL(env, napi_unwrap(env, node_this, &self), {
            napi_throw_error(env, NULL, "Bound class's method must be called on instance of the class");
            return NULL;
        });
    }

    napi_value result = NULL;

    for (size_t i = 0; i < num_args; ++i) {
        if (s_argument_parse(env, node_args[i], method->arg_types[i], i >= method->num_arguments, &args[i])) {
            goto cleanup_arguments;
        }
    }

    result = method->method(env, self, args, num_args);

cleanup_arguments:
    for (size_t i = 0; i < num_args; ++i) {
        s_argument_cleanup(env, &args[i]);
    }
    return result;
}

napi_status aws_napi_define_class(
    napi_env env,
    napi_value exports,
    const struct aws_napi_method_info *constructor,
    const struct aws_napi_property_info *properties,
    size_t num_properties,
    const struct aws_napi_method_info *methods,
    size_t num_methods,
    struct aws_napi_class_info *clazz) {

    AWS_FATAL_ASSERT(constructor->name);
    AWS_FATAL_ASSERT(constructor->attributes == napi_default);

    struct aws_napi_class_info_impl *impl = (struct aws_napi_class_info_impl *)clazz;
    impl->ctor_method = constructor;

    struct aws_allocator *allocator = aws_default_allocator();

    const size_t num_descriptors = num_properties + num_methods;
    napi_property_descriptor *descriptors =
        aws_mem_calloc(allocator, num_descriptors, sizeof(napi_property_descriptor));

    size_t desc_i = 0;

    for (size_t prop_i = 0; prop_i < num_properties; ++prop_i) {
        napi_property_descriptor *desc = &descriptors[desc_i++];
        const struct aws_napi_property_info *property = &properties[prop_i];

        AWS_FATAL_ASSERT(property->name);
        AWS_FATAL_ASSERT(property->getter || property->setter);

        desc->utf8name = property->name;
        desc->data = (void *)property;
        desc->getter = s_property_getter;
        desc->setter = s_property_setter;
        desc->attributes = property->attributes;
    }

    for (size_t method_i = 0; method_i < num_methods; ++method_i) {
        napi_property_descriptor *desc = &descriptors[desc_i++];
        const struct aws_napi_method_info *method = &methods[method_i];

        AWS_FATAL_ASSERT(method->name);
        AWS_FATAL_ASSERT(method->method);

        desc->utf8name = method->name;
        desc->data = (void *)method;
        desc->method = s_method_call;
        desc->attributes = method->attributes;
    }

    napi_value node_constructor = NULL;
    AWS_NAPI_CALL(
        env,
        napi_define_class(
            env,
            constructor->name,
            NAPI_AUTO_LENGTH,
            s_constructor,
            clazz,
            num_descriptors,
            descriptors,
            &node_constructor),
        { return status; });

    /* Don't need descriptors anymore */
    aws_mem_release(allocator, descriptors);

    /* Reference the constructor for later user */
    AWS_NAPI_CALL(env, napi_create_reference(env, node_constructor, 1, &impl->constructor), { return status; });

    AWS_NAPI_CALL(env, napi_set_named_property(env, exports, constructor->name, node_constructor), { return status; });

    return napi_ok;
}

napi_status aws_napi_wrap(
    napi_env env,
    struct aws_napi_class_info *clazz,
    void *native,
    napi_finalize finalizer,
    napi_value *result) {

    struct aws_napi_class_info_impl *impl = (struct aws_napi_class_info_impl *)clazz;

    /* Create the external object to pass to the constructor */
    napi_value to_wrap;
    AWS_NAPI_CALL(env, napi_create_external(env, native, finalizer, clazz, &to_wrap), {
        napi_throw_error(env, NULL, "Failed to construct external argument");
        return status;
    });

    napi_value constructor = NULL;
    AWS_NAPI_CALL(env, napi_get_reference_value(env, impl->constructor, &constructor), {
        napi_throw_error(env, NULL, "Failed to dereference constructor value");
        return status;
    });

    impl->is_wrapping = true;
    AWS_NAPI_CALL(env, napi_new_instance(env, constructor, 1, &to_wrap, result), {
        napi_throw_error(env, NULL, "Failed to construct class-bound object");
        return status;
    });
    impl->is_wrapping = false;

    return napi_ok;
}
