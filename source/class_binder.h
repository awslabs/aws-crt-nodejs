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
#define AWS_NAPI_METHOD_MAX_ARGS 2

struct aws_napi_argument {
    napi_value node;
    napi_valuetype type;
    union {
        struct aws_byte_buf string;
        int64_t number;
        void *external;
    } native;
};

/***********************************************************************************************************************
 * Properties
 **********************************************************************************************************************/
typedef napi_value(aws_napi_property_get_fn)(napi_env env, void *self, void *userdata);
typedef void(aws_napi_property_set_fn)(napi_env env, void *self, const struct aws_napi_argument *value, void *userdata);

struct aws_napi_property_info {
    const char *name;
    napi_valuetype type;

    aws_napi_property_get_fn *getter;
    aws_napi_property_set_fn *setter;

    void *userdata;
};

/***********************************************************************************************************************
 * Methods
 **********************************************************************************************************************/
typedef napi_value(aws_napi_method_fn)(
    napi_env env,
    void *self,
    const struct aws_napi_argument args[static AWS_NAPI_METHOD_MAX_ARGS],
    size_t num_args,
    void *userdata);

struct aws_napi_method_info {
    const char *name;
    aws_napi_method_fn *method;

    size_t num_arguments; /* 0 -> AWS_NAPI_METHOD_MAX_ARGS */
    napi_valuetype arg_types[AWS_NAPI_METHOD_MAX_ARGS];

    void *userdata;
};

/***********************************************************************************************************************
 * API
 **********************************************************************************************************************/
napi_status aws_napi_define_class(
    napi_env env,
    napi_value exports,
    const char *name,
    napi_callback ctor,
    const struct aws_napi_property_info *properties,
    size_t num_properties,
    const struct aws_napi_method_info *methods,
    size_t num_methods,
    napi_value *constructor);

#endif /* AWS_CRT_NODEJS_CLASS_BINDER_H */
