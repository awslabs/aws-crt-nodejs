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
#include "mqtt_client.h"
#include "mqtt_client_connection.h"

/** Helper for creating and registering a function */
static bool s_create_and_register_function(napi_env env, napi_value exports, napi_callback fn, const char *fn_name, size_t fn_name_len) {
    napi_value napi_fn;
    napi_status status = napi_create_function(env, fn_name, fn_name_len, fn, NULL, &napi_fn);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap native function");
        return false;
    }

    status = napi_set_named_property(env, exports, fn_name, napi_fn);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to populate exports");
        return false;
    }

    return true;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_value null;
    napi_get_null(env, &null);

#define CREATE_AND_REGISTER_FN(fn) if (!s_create_and_register_function(env, exports, fn, #fn, sizeof(#fn))) { return null; }

    /* IO */
    CREATE_AND_REGISTER_FN(io_is_alpn_available)
    CREATE_AND_REGISTER_FN(io_event_loop_group_new)

    /* MQTT Client */
    CREATE_AND_REGISTER_FN(mqtt_client_new)

    /* MQTT Client Connection */
    // CREATE_AND_REGISTER_FN(mqtt_client_connection_new)
    // CREATE_AND_REGISTER_FN(mqtt_client_connection_set_will)
    // CREATE_AND_REGISTER_FN(mqtt_client_connection_set_login)
    // CREATE_AND_REGISTER_FN(mqtt_client_connection_publish)
    // CREATE_AND_REGISTER_FN(mqtt_client_connection_subscribe)
    // CREATE_AND_REGISTER_FN(mqtt_client_connection_unsubscribe)
    // CREATE_AND_REGISTER_FN(mqtt_client_connection_disconnect)

#undef CREATE_AND_REGISTER_FN

    return exports;
}

NAPI_MODULE(aws_crt_nodejs, Init)
