#ifndef AWS_CRT_NODEJS_CLASS_BINDER_H
#define AWS_CRT_NODEJS_CLASS_BINDER_H
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

/* Increment this as you find functions that require more arguments */
#define AWS_NAPI_METHOD_MAX_ARGS 9

/**
 * Expected to be stored statically, but is for internal usage only.
 */
struct aws_napi_class_info {
    uint8_t filler[24];
};

/**
 * Passed as a parameter to functions accepting arguments.
 */
struct aws_napi_argument {
    napi_value node;
    napi_valuetype type;
    union {
        bool boolean;
        int64_t number;
        struct aws_byte_buf string;
        void *external;
    } native;
};

/**
 * Passed to methods
 */
struct aws_napi_callback_info {
    void *native_this;
    const struct aws_napi_argument *arguments;
    size_t num_args;
};

/***********************************************************************************************************************
 * Properties
 **********************************************************************************************************************/
typedef napi_value(aws_napi_property_get_fn)(napi_env env, void *native_this);
typedef void(aws_napi_property_set_fn)(napi_env env, void *native_this, const struct aws_napi_argument *value);

struct aws_napi_property_info {
    const char *name;
    napi_valuetype type;

    aws_napi_property_get_fn *getter;
    aws_napi_property_set_fn *setter;

    napi_property_attributes attributes;
};

/***********************************************************************************************************************
 * Methods
 **********************************************************************************************************************/
typedef napi_value(aws_napi_method_fn)(napi_env env, const struct aws_napi_callback_info *cb_info);

struct aws_napi_method_info {
    const char *name;
    aws_napi_method_fn *method;

    size_t num_arguments; /* Number of *REQUIRED* arguments. 0 -> AWS_NAPI_METHOD_MAX_ARGS */
    napi_valuetype arg_types[AWS_NAPI_METHOD_MAX_ARGS];

    napi_property_attributes attributes;
};

/***********************************************************************************************************************
 * API
 **********************************************************************************************************************/

bool aws_napi_method_next_argument(
    napi_valuetype expected_type,
    const struct aws_napi_callback_info *cb_info,
    const struct aws_napi_argument **next_arg);

napi_status aws_napi_define_class(
    napi_env env,
    napi_value exports,
    const struct aws_napi_method_info *constructor,
    const struct aws_napi_property_info *properties,
    size_t num_properties,
    const struct aws_napi_method_info *methods,
    size_t num_methods,
    struct aws_napi_class_info *class_info);

napi_status aws_napi_wrap(
    napi_env env,
    struct aws_napi_class_info *class_info,
    void *native,
    napi_finalize finalizer,
    napi_value *result);

#endif /* AWS_CRT_NODEJS_CLASS_BINDER_H */
