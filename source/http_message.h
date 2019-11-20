#ifndef AWS_CRT_NODEJS_HTTP_MESSAGE_H
#define AWS_CRT_NODEJS_HTTP_MESSAGE_H
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

napi_status aws_napi_http_message_bind(napi_env env, napi_value exports);

struct aws_http_message;
napi_status aws_napi_http_message_wrap(napi_env env, struct aws_http_message *message, napi_value *result);
struct aws_http_message *aws_napi_http_message_unwrap(napi_env env, napi_value js_object);

#endif /* AWS_CRT_NODEJS_HTTP_MESSAGE_H */
