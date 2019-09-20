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

/*
    This acts as a command queue between the aws-c-io event loop and the libuv event loop. JS callbacks can only
    be invoked within the libuv event loop, so we queue them up, and tell the uv loop to call our message pump.

    Each object that needs async dispatch will need an aws_uv_context, which represents a handle in the uv
    event loop. Note that the context does not die synchronously (during close()), it has to be closed and 
    cleaned up in the uv loop after all events are handled for the tick where uv_close() is called.

    Typical flow will look like:
    ctx = aws_uv_context_new(env, allocator)
    ...
    aws_uv_context_enqueue(ctx, function, user_data)
    ...
    aws_uv_context_release(ctx)
 */

struct aws_uv_context;
struct aws_allocator;
typedef void(aws_uv_callback_fn)(void *user_data);

/* Create a new context, must be done from the uv thread */
struct aws_uv_context *aws_uv_context_new(napi_env env, struct aws_allocator *allocator);

/* Release a context. Cleanup will happen in the UV thread once the handle is closed */
void aws_uv_context_release(struct aws_uv_context *ctx);

/* queues a functions to be called by libuv in the node event loop, can be done from any thread */
void aws_uv_context_enqueue(struct aws_uv_context *ctx, aws_uv_callback_fn *callback, void *user_data);

#endif /* AWS_CRT_NODEJS_UV_INTEROP_H */
