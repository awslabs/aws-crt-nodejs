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

#include "logger.h"
#include "module.h"
#include "uv_interop.h"

#include <aws/common/log_channel.h>
#include <aws/common/log_formatter.h>
#include <aws/common/log_writer.h>
#include <aws/common/ring_buffer.h>

/* one of these is allocated per napi_env/thread */
struct aws_napi_logger_ctx {
    napi_env env;
    struct aws_allocator *allocator;
    struct aws_uv_context *uv_context;
    struct aws_napi_callback console_log;
    struct aws_ring_buffer buffer;
    struct aws_allocator buffer_allocator;
};

static AWS_THREAD_LOCAL struct aws_napi_logger_ctx *tl_logger_ctx;

struct console_log_args {
    struct aws_napi_logger_ctx *ctx;
    struct aws_string *message;
};

static int s_console_log_params(napi_env env, napi_value *params, size_t *num_params, void *user_data) {
    struct console_log_args *args = user_data;

    if (napi_create_string_utf8(env, (const char*)aws_string_bytes(args->message), args->message->len, &params[0])) {
        return AWS_OP_ERR;
    }

    *num_params = 1;
    return AWS_OP_SUCCESS;
}

static void s_console_log(void *user_data) {
    struct console_log_args *args = user_data;
    aws_napi_callback_dispatch(&args->ctx->console_log, args);
    aws_mem_release(&args->ctx->buffer_allocator, args->message);
    aws_mem_release(&args->ctx->buffer_allocator, args);
}


/* aws_log_pipeline components */
struct {
    struct aws_logger logger;
    struct aws_log_formatter formatter;
    struct aws_log_writer writer;
    struct aws_log_channel channel;
    struct aws_napi_logger_ctx *default_ctx;
} s_napi_logger;

/* custom aws_log_writer that writes via console.log() within the node env */
static int s_napi_log_writer_write(struct aws_log_writer *writer, const struct aws_string *output) {
    (void)writer;
    struct aws_napi_logger_ctx *log_ctx = tl_logger_ctx ? tl_logger_ctx : s_napi_logger.default_ctx;
    /* this can only happen if someone tries to log after the main thread has cleaned up */
    AWS_FATAL_ASSERT(log_ctx && "No TLS log context, and no default fallback");
    struct aws_string *message = aws_string_new_from_string(&log_ctx->buffer_allocator, output);
    struct console_log_args *args = aws_mem_acquire(&log_ctx->buffer_allocator, sizeof(struct console_log_args));
    args->ctx = log_ctx;
    args->message = message;
    aws_uv_context_enqueue(log_ctx->uv_context, s_console_log, args);
    return AWS_OP_SUCCESS;
}

static void s_napi_log_writer_clean_up(struct aws_log_writer *writer) {
    (void)writer;
}

static struct aws_log_writer_vtable s_napi_log_writer_vtable = {
    .write = s_napi_log_writer_write,
    .clean_up = s_napi_log_writer_clean_up,
};

void aws_napi_logger_set_log_level(enum aws_log_level level) {
    AWS_FATAL_ASSERT(s_napi_logger.logger.p_impl);
    ((struct aws_logger_pipeline *)s_napi_logger.logger.p_impl)->level = level;
}

/* Allocator used to allocate buffered log messages from a ring buffer */
static void *s_ring_buffer_mem_acquire(struct aws_allocator *allocator, size_t size) {
    struct aws_ring_buffer *buffer = allocator->impl;
    struct aws_byte_buf buf;
    AWS_ZERO_STRUCT(buf);
    AWS_FATAL_ASSERT(AWS_OP_SUCCESS == aws_ring_buffer_acquire(buffer, size + sizeof(size_t), &buf));
    *((size_t *)buf.buffer) = buf.capacity;
    return buf.buffer + sizeof(size_t);
}

static void s_ring_buffer_mem_release(struct aws_allocator *allocator, void *ptr) {
    void *addr = ((uint8_t *)ptr - sizeof(size_t));
    size_t size = *((size_t *)addr);
    struct aws_byte_buf buf = {
        .allocator = allocator,
        .buffer = addr,
        .capacity = size,
        .len = 0,
    };
    struct aws_ring_buffer *buffer = allocator->impl;
    aws_ring_buffer_release(buffer, &buf);
}

static void *s_ring_buffer_mem_calloc(struct aws_allocator *allocator, size_t num, size_t size) {
    void *mem = s_ring_buffer_mem_acquire(allocator, num * size);
    memset(mem, 0, size);
    return mem;
}

struct aws_napi_logger_ctx *aws_napi_logger_new(struct aws_allocator *allocator, napi_env env) {
    struct aws_napi_logger_ctx *ctx = aws_mem_calloc(allocator, 1, sizeof(struct aws_napi_logger_ctx));
    AWS_FATAL_ASSERT(ctx && "Failed to allocate new logging context");
    AWS_FATAL_ASSERT(tl_logger_ctx == NULL && "Cannot initialize multiple logging contexts in a single thread");
    tl_logger_ctx = ctx;
    ctx->env = env;
    ctx->allocator = allocator;

    napi_status status = napi_ok;
    int op_status = AWS_OP_ERR;
    napi_value node_global = NULL;
    status = napi_get_global(env, &node_global);
    AWS_FATAL_ASSERT(status == napi_ok && "napi_get_global failed");

    napi_value node_console = NULL;
    status = napi_get_named_property(env, node_global, "console", &node_console);
    AWS_FATAL_ASSERT(status == napi_ok && "napi_get_property(global.console) failed");

    napi_value node_console_log = NULL;
    status = napi_get_named_property(env, node_console, "log", &node_console_log);
    AWS_FATAL_ASSERT(status == napi_ok && "napi_get_property(console.log) failed");

    op_status = aws_napi_callback_init(&ctx->console_log, env, node_console_log, "console.log", s_console_log_params);
    AWS_FATAL_ASSERT(op_status == AWS_OP_SUCCESS && "aws_napi_callback_init(console.log) failed");

    ctx->uv_context = aws_uv_context_new(env, allocator);
    AWS_FATAL_ASSERT(ctx->uv_context && "aws_uv_context_new() failed");

    AWS_FATAL_ASSERT(AWS_OP_SUCCESS == aws_ring_buffer_init(&ctx->buffer, ctx->allocator, 16 * 1024));
    ctx->buffer_allocator.mem_acquire = s_ring_buffer_mem_acquire;
    ctx->buffer_allocator.mem_release = s_ring_buffer_mem_release;
    ctx->buffer_allocator.mem_calloc = s_ring_buffer_mem_calloc;
    ctx->buffer_allocator.impl = &ctx->buffer;

    /* The first context created will be the main thread, so make it the default */
    if (s_napi_logger.default_ctx == NULL) {
        s_napi_logger.default_ctx = ctx;
    }

    return ctx;
}

void aws_napi_logger_destroy(struct aws_napi_logger_ctx *ctx) {
    AWS_ASSERT(tl_logger_ctx == ctx);
    tl_logger_ctx = NULL;
    aws_napi_callback_clean_up(&ctx->console_log);
    aws_uv_context_release(ctx->uv_context);

    if (s_napi_logger.default_ctx == ctx) {
        aws_logger_set(NULL);
        s_napi_logger.default_ctx = NULL;
    }
    aws_mem_release(ctx->allocator, ctx);
}

struct aws_logger *aws_napi_logger_get(void) {
    if (s_napi_logger.logger.allocator) {
        return &s_napi_logger.logger;
    }

    struct aws_allocator *allocator = aws_default_allocator();

    s_napi_logger.writer.allocator = allocator;
    s_napi_logger.writer.vtable = &s_napi_log_writer_vtable;
    s_napi_logger.writer.impl = NULL;

    struct aws_log_formatter_standard_options formatter_options = {.date_format = AWS_DATE_FORMAT_ISO_8601};
    int op_status = aws_log_formatter_init_default(&s_napi_logger.formatter, allocator, &formatter_options);
    AWS_FATAL_ASSERT(op_status == AWS_OP_SUCCESS && "Failed to initialize formatter");

    op_status = aws_log_channel_init_foreground(&s_napi_logger.channel, allocator, &s_napi_logger.writer);
    AWS_FATAL_ASSERT(op_status == AWS_OP_SUCCESS && "Failed to initialize log channel");

    op_status = aws_logger_init_from_external(
        &s_napi_logger.logger,
        aws_default_allocator(),
        &s_napi_logger.formatter,
        &s_napi_logger.channel,
        &s_napi_logger.writer,
        AWS_LL_WARN);
    AWS_FATAL_ASSERT(op_status == AWS_OP_SUCCESS && "Failed to initialize logger");
    return &s_napi_logger.logger;
}
