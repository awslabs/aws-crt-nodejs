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

#include "uv_interop.h"
#include <aws/common/common.h>
#include <aws/common/linked_list.h>
#include <aws/common/mutex.h>
#include <uv.h>

struct aws_uv_context {
    uv_loop_t *uv_loop;
    uint32_t ref_count;
    napi_env env;
    uv_async_t async_handle;
    struct {
        struct aws_mutex mutex;
        struct aws_linked_list free_list;
    } command_pool;

    struct {
        struct aws_mutex mutex;
        struct aws_linked_list queue;
    } command_queue;
};

struct aws_uv_callback {
    struct aws_linked_list_node list_node;
    aws_uv_callback_fn callback;
    void *user_data;
};

/* Default libuv context. Most applications will only need one, but multiple can be used
   to establish domains for profiling/categorization.
   Init/shutdown does not need atomic protection, as it can only be invoked from the uv thread */
static struct aws_uv_context s_default_context_storage;
static struct aws_uv_context *s_default_context = &s_default_context_storage;

struct aws_uv_context *aws_uv_context_get_default() {
    AWS_FATAL_ASSERT(s_default_context);
    return s_default_context;
}

/* pool allocator that works off a simple free FIFO */
static struct aws_uv_callback *s_uv_command_alloc(struct aws_uv_context *ctx) {
    aws_mutex_lock(&ctx->command_pool.mutex);
    if (aws_linked_list_empty(&ctx->command_pool.free_list)) {
        aws_mutex_unlock(&ctx->command_pool.mutex);
        struct aws_allocator *allocator = aws_default_allocator();
        return aws_mem_calloc(allocator, 1, sizeof(struct aws_uv_callback));
    }

    struct aws_linked_list_node *list_node = aws_linked_list_pop_front(&ctx->command_pool.free_list);
    aws_mutex_unlock(&ctx->command_pool.mutex);

    struct aws_uv_callback *callback = AWS_CONTAINER_OF(list_node, struct aws_uv_callback, list_node);
    AWS_ZERO_STRUCT(*callback);
    return callback;
}

static void s_uv_command_free(struct aws_uv_context *ctx, struct aws_uv_callback *callback) {
    aws_mutex_lock(&ctx->command_pool.mutex);
    aws_linked_list_push_front(&ctx->command_pool.free_list, &callback->list_node);
    aws_mutex_unlock(&ctx->command_pool.mutex);
}

/* gets called inside the libuv event loop when we notify the async handle */
static void s_uv_dispatch_pump(uv_async_t *handle) {
    struct aws_uv_context *ctx = handle->data;
    struct aws_linked_list commands;
    aws_linked_list_init(&commands);

    aws_mutex_lock(&ctx->command_queue.mutex);
    aws_linked_list_swap_contents(&commands, &ctx->command_queue.queue);
    aws_mutex_unlock(&ctx->command_queue.mutex);

    while (!aws_linked_list_empty(&commands)) {
        struct aws_linked_list_node *list_node = aws_linked_list_pop_front(&commands);
        struct aws_uv_callback *callback = AWS_CONTAINER_OF(list_node, struct aws_uv_callback, list_node);
        callback->callback(callback->user_data);
        s_uv_command_free(ctx, callback);
    }
}

int aws_uv_context_init(struct aws_uv_context *ctx, napi_env env) {
    /* init is idempotent */
    if (ctx->uv_loop) {
        ctx->ref_count++;
        return AWS_OP_SUCCESS;
    }

    AWS_ZERO_STRUCT(*ctx);
    aws_mutex_init(&ctx->command_queue.mutex);
    aws_linked_list_init(&ctx->command_queue.queue);
    aws_mutex_init(&ctx->command_pool.mutex);
    aws_linked_list_init(&ctx->command_pool.free_list);

    napi_get_uv_event_loop(env, &ctx->uv_loop);
    AWS_FATAL_ASSERT(ctx->uv_loop);

    uv_async_init(ctx->uv_loop, &ctx->async_handle, s_uv_dispatch_pump);
    ctx->env = env;
    ctx->async_handle.data = ctx;

    ctx->ref_count = 1;

    return AWS_OP_SUCCESS;
}

int aws_uv_context_cleanup(struct aws_uv_context *ctx) {
    /* cleanup is idempotent */
    if (!ctx || !ctx->uv_loop) {
        return AWS_OP_SUCCESS;
    }

    if (--ctx->ref_count == 0) {
        /* we can't do anything with leftover commands, there shouldn't be any, shutting this down with
           callbacks pending is DEFINITELY going to cause bugs for users somewhere */
        AWS_ASSERT(aws_linked_list_empty(ctx->command_queue.queue));

        /* clean up uv handle */
        uv_unref((uv_handle_t *)&ctx->async_handle);

        struct aws_allocator *allocator = aws_default_allocator();
        /* clean up free list for callbacks*/
        while (!aws_linked_list_empty(&ctx->command_pool.free_list)) {
            struct aws_linked_list_node *list_node = aws_linked_list_pop_front(&ctx->command_pool.free_list);
            struct aws_uv_callback *callback = AWS_CONTAINER_OF(list_node, struct aws_uv_callback, list_node);
            aws_mem_release(allocator, callback);
        }

        aws_mutex_clean_up(&ctx->command_queue.mutex);
        aws_mutex_clean_up(&ctx->command_pool.mutex);
    }

    return AWS_OP_SUCCESS;
}

void aws_uv_queue_dispatch(struct aws_uv_context *ctx, aws_uv_callback_fn callback, void *user_data) {
    AWS_FATAL_ASSERT(ctx && ctx->uv_loop);

    struct aws_uv_callback *cb = s_uv_command_alloc(ctx);
    cb->callback = callback;
    cb->user_data = user_data;
    aws_mutex_lock(&ctx->command_queue.mutex);
    aws_linked_list_push_back(&ctx->command_queue.queue, &cb->list_node);
    aws_mutex_unlock(&ctx->command_queue.mutex);

    /* notify uv that there's work to do */
    uv_async_send(&ctx->async_handle);
}
