#ifndef AWS_CRT_NODEJS_MODULE_H
#define AWS_CRT_NODEJS_MODULE_H
/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#include <aws/common/byte_buf.h>
#include <aws/common/logging.h>
#include <aws/common/string.h>

#define WIN32_LEAN_AND_MEAN
#define NAPI_VERSION 4
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

/**
 * Gets the allocator used to allocate native resources in the node environment, should be used
 * by all binding code in this extension
 */
struct aws_allocator *aws_napi_get_allocator(void);

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
 * Wrapper around napi_create_threadsafe_function,
 * aws_napi_release_threadsafe_function needed to clean up the threadsafe function
 */
napi_status aws_napi_create_threadsafe_function(
    napi_env env,
    napi_value function,
    const char *name,
    napi_threadsafe_function_call_js call_js,
    void *context,
    napi_threadsafe_function *result);

/**
 * Wrapper around napi_release_threadsafe_function,
 * check the function before releasing it.
 */
napi_status aws_napi_release_threadsafe_function(
    napi_threadsafe_function function,
    napi_threadsafe_function_release_mode mode);

/**
 * Wrapper around napi_unref_threadsafe_function,
 * Incase release the threadsafe function from that function is needed, unref will let env go
 * and the function will be cleaned up as env clean itself up
 */
napi_status aws_napi_unref_threadsafe_function(napi_env env, napi_threadsafe_function function);

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

#define _AWS_NAPI_ERROR_MSG(call, source) "N-API call failed: " call "\n    @ " source
#define _AWS_NAPI_PASTE(x) x
#define _AWS_NAPI_TOSTR(x) #x
#define _AWS_NAPI_TOSTRING(x) _AWS_NAPI_TOSTR(x)
#define _AWS_NAPI_SOURCE __FILE__ ":" _AWS_NAPI_TOSTRING(__LINE__)

#define AWS_NAPI_LOGF_ERROR(...)                                                                                       \
    do {                                                                                                               \
        fprintf(stderr, __VA_ARGS__);                                                                                  \
        fprintf(stderr, "\n");                                                                                         \
    } while (0)

#define AWS_NAPI_LOGF_FATAL(...)                                                                                       \
    do {                                                                                                               \
        fprintf(stderr, __VA_ARGS__);                                                                                  \
        fprintf(stderr, "\n");                                                                                         \
    } while (0)

/*
 * AWS_NAPI_CALL(env, napi_xxx(args...), { return NULL; }) will ensure that a failed result is logged as an error
 * immediately
 */
#define AWS_NAPI_CALL(env, call, on_fail)                                                                              \
    do {                                                                                                               \
        napi_status status = (call);                                                                                   \
        if (status != napi_ok) {                                                                                       \
            AWS_NAPI_LOGF_ERROR(                                                                                       \
                _AWS_NAPI_PASTE(_AWS_NAPI_ERROR_MSG(#call, _AWS_NAPI_SOURCE)) _AWS_NAPI_PASTE(": %s"),                 \
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
        (void)env;                                                                                                     \
        napi_status status = (call);                                                                                   \
        if (status != napi_ok) {                                                                                       \
            AWS_NAPI_LOGF_FATAL(                                                                                       \
                _AWS_NAPI_PASTE(_AWS_NAPI_ERROR_MSG(#call, _AWS_NAPI_SOURCE)) _AWS_NAPI_PASTE(": %s"),                 \
                aws_napi_status_to_str(status));                                                                       \
            aws_fatal_assert(#call, __FILE__, __LINE__);                                                               \
        }                                                                                                              \
    } while (0)

#endif /* AWS_CRT_NODEJS_MODULE_H */
