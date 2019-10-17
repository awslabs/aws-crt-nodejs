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
#include <aws/common/logging.h>
#include <aws/common/string.h>

#include <node_api.h>

enum aws_napi_log_subject { AWS_LS_NODE = 0x900 };

napi_status aws_byte_buf_init_from_napi(struct aws_byte_buf *buf, napi_env env, napi_value node_str);
struct aws_string *aws_string_new_from_napi(napi_env env, napi_value node_str);
/** Copies data from cur into a new ArrayBuffer, then returns a DataView to the buffer. */
napi_status aws_napi_create_dataview_from_byte_cursor(
    napi_env env,
    const struct aws_byte_cursor *cur,
    napi_value *result);

bool aws_napi_is_null_or_undefined(napi_env env, napi_value value);

void aws_napi_throw_last_error(napi_env env);

struct uv_loop_s *aws_napi_get_node_uv_loop(void);
struct aws_event_loop *aws_napi_get_node_event_loop(void);
struct aws_event_loop_group *aws_napi_get_node_elg(void);

const char *aws_napi_status_to_str(napi_status status);

struct aws_napi_callback;
typedef int(aws_napi_callback_params_builder)(napi_env env, napi_value *params, size_t *num_params, void *user_data);

struct aws_napi_callback {
    napi_env env;
    napi_async_context async_context;
    napi_ref callback;
    aws_napi_callback_params_builder *build_params;
};

int aws_napi_callback_init(
    struct aws_napi_callback *cb,
    napi_env env,
    napi_value callback,
    const char *name,
    aws_napi_callback_params_builder *build_params);
int aws_napi_callback_clean_up(struct aws_napi_callback *cb);
int aws_napi_callback_dispatch(struct aws_napi_callback *cb, void *user_data);

/**
 * Wrapper around napi_call_function that automatically substitutes undefined for a null this_ptr
 * and un-pins the function reference when the call completes. Also handles known recoverable
 * call failure cases before returning. Does not care about return value, since this is a non-blocking
 * call into node.
 * 
 * @return napi_ok - call was successful
 *         napi_closing - function has been released, and is shutting down, execution is ok to continue though
 *         other napi_status values - unhandled, up to caller
 */
napi_status aws_napi_dispatch_threadsafe_function(
    napi_env env,
    napi_threadsafe_function tsfn,
    napi_value this_ptr,
    napi_value function,
    size_t argc,
    napi_value *argv);

/**
 * Wrapper around napi_create_threadsafe_function that ensures it is a weak reference and cleans
 * up when the last node reference is cleared.
 */
napi_status aws_napi_create_threadsafe_function(
    napi_env env,
    napi_value function,
    const char *name,
    napi_threadsafe_function_call_js call_js,
    void *context,
    napi_threadsafe_function *result);

/**
 * Wrapper around napi_call_threadsafe_function that always queues (napi_tsfn_nonblocking)
 * and pins the function reference until the call completes
 */
napi_status aws_napi_queue_threadsafe_function(napi_threadsafe_function function, void *user_data);

/*
 * One of these will be allocated each time the module init function is called
 * Any global state that isn't thread safe or requires clean up should be stored
 * on this so that it can be tracked and cleaned up
 */
struct aws_napi_context {
    napi_env env;
    struct aws_allocator *allocator;
    struct aws_napi_logger_ctx *logger;
};

#define _AWS_NAPI_ERROR_MSG(call, file, line) "N-API call failed: " #call " @ " file "(" #line ")"
#define _AWS_NAPI_PASTE(x) x

/*
 * AWS_NAPI_CALL(env, napi_xxx(args...), { return NULL; }) will ensure that a failed result is logged as an error
 */
#define AWS_NAPI_CALL(env, call, on_fail)                                                                              \
    do {                                                                                                               \
        napi_status status = (call);                                                                                   \
        if (status != napi_ok) {                                                                                       \
            AWS_LOGF_ERROR(                                                                                            \
                AWS_LS_NODE,                                                                                           \
                _AWS_NAPI_PASTE(_AWS_NAPI_ERROR_MSG((call), __FILE__, __LINE__)) _AWS_NAPI_PASTE(": %s"),              \
                aws_napi_status_to_str(status));                                                                       \
            on_fail;                                                                                                   \
        }                                                                                                              \
    } while (0)

/*
 * AWS_NAPI_ENSURE(env, napi_xxx(args...)) is for when logging is not available, or a failure should immediately
 * end the process. The file and line of the call will be reported.
 */
#define AWS_NAPI_ENSURE(env, call)                                                                                     \
    do {                                                                                                               \
        napi_status status = (call);                                                                                   \
        if (status != napi_ok) {                                                                                       \
            aws_fatal_assert(#call, __FILE__, __LINE__);                                                               \
        }                                                                                                              \
    } while (0)

#endif /* AWS_CRT_NODEJS_MODULE_H */
