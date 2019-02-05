#ifndef AWS_CRT_NODEJS_MODULE_H
#define AWS_CRT_NODEJS_MODULE_H
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

#include <aws/common/byte_buf.h>

#include <node_api.h>

napi_status aws_byte_buf_init_from_napi(struct aws_byte_buf *buf, napi_env env, napi_value obj);

bool aws_napi_is_null_or_undefined(napi_env env, napi_value value);
bool aws_napi_is_external(napi_env env, napi_value value);

struct aws_event_loop_group *aws_napi_get_node_elg(void);

#endif /* AWS_CRT_NODEJS_MODULE_H */
