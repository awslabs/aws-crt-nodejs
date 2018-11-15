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
#include "io.h"

#include <aws/io/event_loop.h>
#include <aws/io/tls_channel_handler.h>

#include <stdio.h>

napi_value io_is_alpn_available(napi_env env, napi_callback_info info) {

    (void)info;

    const bool is_alpn_available = aws_tls_is_alpn_available();

    napi_value node_bool;
    if (napi_ok!= napi_get_boolean(env, is_alpn_available, &node_bool)) {

        napi_throw_error(env, NULL, "Failed to get boolean value");
        return NULL;
    }

    return node_bool;
}

/** Finalizer for an ELG external */
static void s_elg_finalize(napi_env env, void *finalize_data, void *finalize_hint) {

    (void)env;
    (void)finalize_hint;

    struct aws_event_loop_group *elg = finalize_data;
    assert(elg);

    aws_event_loop_group_clean_up(elg);
    aws_mem_release(elg->allocator, elg);

    printf("Destroyed ELG\n");
}

napi_value io_event_loop_group_new(napi_env env, napi_callback_info info) {

    struct aws_allocator *allocator = aws_default_allocator();

    size_t num_args = 1;
    napi_value node_num_threads;
    if (napi_ok != napi_get_cb_info(env, info, &num_args, &node_num_threads, NULL, NULL)) {
        napi_throw_error(env, NULL, "Failed to retreive callback information");
        return NULL;
    }
    if (num_args < 1) {
        napi_throw_error(env, NULL, "io_event_loop_group_new needs at least 1 argument");
        return NULL;
    }

    uint32_t num_threads = 0;
    napi_status status = napi_get_value_uint32(env, node_num_threads, &num_threads);
    if (status == napi_invalid_arg) {
        napi_throw_type_error(env, NULL, "Expected number");
        return NULL;
    }
    assert(status == napi_ok); /* napi_ok and napi_invalid_arg are the only possible return values */

    struct aws_event_loop_group *elg = aws_mem_acquire(allocator, sizeof(struct aws_event_loop_group));
    if (!elg) {
        napi_throw_error(env, NULL, "Failed to allocate memory");
        return NULL;
    }
    AWS_ZERO_STRUCT(*elg);

    if (aws_event_loop_group_default_init(elg, allocator, num_threads)) {
        aws_mem_release(allocator, elg);
        napi_throw_error(env, NULL, "Failed init ELG");
        return NULL;
    }

    napi_value node_external;
    if (napi_ok != napi_create_external(env, elg, s_elg_finalize, NULL, &node_external)) {
        aws_event_loop_group_clean_up(elg);
        aws_mem_release(allocator, elg);
        napi_throw_error(env, NULL, "Failed create n-api external");
        return NULL;
    }

    printf("Created ELG\n");

    return node_external;
}
