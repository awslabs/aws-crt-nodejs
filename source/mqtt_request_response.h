/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

#ifndef AWS_CRT_NODEJS_MQTT_REQUEST_RESPONSE_H
#define AWS_CRT_NODEJS_MQTT_REQUEST_RESPONSE_H

#include "module.h"

napi_value aws_napi_mqtt_request_response_client_new_from_5(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt_request_response_client_new_from_311(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt_request_response_client_close(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt_streaming_operation_new(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt_streaming_operation_open(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt_streaming_operation_close(napi_env env, napi_callback_info info);

napi_value aws_napi_mqtt_request_response_client_submit_request(napi_env env, napi_callback_info info);

#endif /* AWS_CRT_NODEJS_MQTT_REQUEST_RESPONSE_H */
