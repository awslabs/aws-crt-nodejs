#ifndef AWS_CRT_NODEJS_AUTH_H
#define AWS_CRT_NODEJS_AUTH_H
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

#include <node_api.h>

napi_status aws_napi_auth_bind(napi_env env, napi_value exports);

struct aws_credentials_provider;

napi_status aws_napi_credentials_provider_wrap(
    napi_env env,
    struct aws_credentials_provider *creds_provider,
    napi_value *result);
struct aws_credentials_provider *aws_napi_credentials_provider_unwrap(napi_env env, napi_value js_object);

struct aws_signing_config_aws;
struct aws_signing_config_aws *aws_signing_config_aws_prepare_and_unwrap(napi_env env, napi_value js_object);

#endif /* AWS_CRT_NODEJS_AUTH_H */
