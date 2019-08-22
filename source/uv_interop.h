#ifndef AWS_CRT_NODEJS_UV_INTEROP_H
#define AWS_CRT_NODEJS_UV_INTEROP_H

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

struct aws_uv_context;
typedef void (*aws_uv_callback_fn)(void *user_data);

/* Gets the default global libuv command buffer, in most cases there is only 1 per application */
struct aws_uv_context *aws_uv_context_get_default();

/* Initializes the libuv command buffer, and attaches our message pump to libuv's event loop */
int aws_uv_context_init(struct aws_uv_context *ctx, napi_env env);

/* Removes our message pump from libuv and cleans up the libuv command buffer */
int aws_uv_context_cleanup(struct aws_uv_context *ctx);

/* queues a functions to be called by libuv in the node event loop */
void aws_uv_queue_dispatch(struct aws_uv_context *ctx, aws_uv_callback_fn callback, void *user_data);

#endif /* AWS_CRT_NODEJS_UV_INTEROP_H */
