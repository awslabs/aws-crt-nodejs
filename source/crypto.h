#ifndef AWS_CRT_NODEJS_CRYTPO_H
#define AWS_CRT_NODEJS_CRYTPO_H
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

#include <aws/common/common.h>

AWS_EXTERN_C_BEGIN

napi_value aws_napi_hash_md5_new(napi_env env, napi_callback_info info);
napi_value aws_napi_hash_sha256_new(napi_env env, napi_callback_info info);
napi_value aws_napi_hash_update(napi_env env, napi_callback_info info);
napi_value aws_napi_hash_digest(napi_env env, napi_callback_info info);

napi_value aws_napi_hash_md5_compute(napi_env env, napi_callback_info info);
napi_value aws_napi_hash_sha256_compute(napi_env env, napi_callback_info info);

napi_value aws_napi_hmac_sha256_new(napi_env env, napi_callback_info info);
napi_value aws_napi_hmac_update(napi_env env, napi_callback_info info);
napi_value aws_napi_hmac_digest(napi_env env, napi_callback_info info);

napi_value aws_napi_hmac_sha256_compute(napi_env env, napi_callback_info info);

AWS_EXTERN_C_END

#endif /* AWS_CRT_NODEJS_CRYTPO_H */
