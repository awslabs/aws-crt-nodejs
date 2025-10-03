/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */


import * as auth from "./auth";
import * as test_env from "@test/test_env"
import * as retry from "@test/retry"
import * as aws_iot_311 from "./aws_iot";
import * as aws_iot_5 from "./aws_iot_mqtt5";
import * as mqtt5 from "./mqtt5";
import * as mqtt_request_response from "./mqtt_request_response";
import {once} from "events";
import * as mrr_test from "@test/mqtt_request_response";
import {v4 as uuid} from "uuid";
import * as test_utils from "../../test/mqtt5";

jest.setTimeout(30000);

function getTestingCredentials() : auth.AWSCredentials {
    let credentials : auth.AWSCredentials = {
        aws_access_id: test_utils.ClientEnvironmentalConfig.AWS_IOT_ACCESS_KEY_ID,
        aws_secret_key: test_utils.ClientEnvironmentalConfig.AWS_IOT_SECRET_ACCESS_KEY,
        aws_region: test_env.AWS_IOT_ENV.MQTT5_REGION
    };

    if (test_utils.ClientEnvironmentalConfig.AWS_IOT_SESSION_TOKEN !== "") {
        credentials.aws_sts_token = test_utils.ClientEnvironmentalConfig.AWS_IOT_SESSION_TOKEN;
    }

    return credentials;
}

function createClientBuilder5() : aws_iot_5.AwsIotMqtt5ClientConfigBuilder {
    let credentials : auth.AWSCredentials = getTestingCredentials();
    let provider = new auth.StaticCredentialProvider(credentials);

    let builder = aws_iot_5.AwsIotMqtt5ClientConfigBuilder.newWebsocketMqttBuilderWithSigv4Auth(test_env.AWS_IOT_ENV.MQTT5_HOST, {
        credentialsProvider: provider,
        region: test_env.AWS_IOT_ENV.MQTT5_REGION
    });

    return builder;
}

function createClientBuilder311() : aws_iot_311.AwsIotMqttConnectionConfigBuilder {
    let credentials : auth.AWSCredentials = getTestingCredentials();
    let provider = new auth.StaticCredentialProvider(credentials);
    
    let builder = aws_iot_311.AwsIotMqttConnectionConfigBuilder.new_with_websockets();

    builder.with_endpoint(test_env.AWS_IOT_ENV.MQTT5_HOST);
    builder.with_client_id(`node-mqtt-unit-test-${uuid()}`)
    builder.with_credential_provider(provider);

    return builder;
}

function initClientBuilderFactories() {
    // @ts-ignore
    mrr_test.setClientBuilderFactories(createClientBuilder5, createClientBuilder311);
}

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Create Destroy Mqtt5', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        let context = new mrr_test.TestingContext({
            version: mrr_test.ProtocolVersion.Mqtt5
        });
        await context.open();

        await context.close();
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Create Destroy Mqtt311', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        let context = new mrr_test.TestingContext({
            version: mrr_test.ProtocolVersion.Mqtt311
        });
        await context.open();

        await context.close();
    })
});



test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Success Rejected Mqtt5', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_success_rejected_test(mrr_test.ProtocolVersion.Mqtt5, true);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Success Rejected Mqtt311', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_success_rejected_test(mrr_test.ProtocolVersion.Mqtt311, true);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Success Rejected No CorrelationToken Mqtt5', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_success_rejected_test(mrr_test.ProtocolVersion.Mqtt5, false);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Success Rejected No CorrelationToken Mqtt311', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_success_rejected_test(mrr_test.ProtocolVersion.Mqtt311, false);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('UpdateNamedShadow Success Accepted Mqtt5', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_update_named_shadow_success_accepted_test(mrr_test.ProtocolVersion.Mqtt5, true);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('UpdateNamedShadow Success Accepted Mqtt311', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_update_named_shadow_success_accepted_test(mrr_test.ProtocolVersion.Mqtt311, true);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('UpdateNamedShadow Success Accepted No CorrelationToken Mqtt5', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_update_named_shadow_success_accepted_test(mrr_test.ProtocolVersion.Mqtt5, false);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('UpdateNamedShadow Success Accepted No CorrelationToken Mqtt311', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_update_named_shadow_success_accepted_test(mrr_test.ProtocolVersion.Mqtt311, false);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Timeout Mqtt5', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_timeout_test(mrr_test.ProtocolVersion.Mqtt5, true);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Timeout Mqtt311', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_timeout_test(mrr_test.ProtocolVersion.Mqtt311, true);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Timeout No CorrelationToken Mqtt5', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_timeout_test(mrr_test.ProtocolVersion.Mqtt5, false);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Timeout No CorrelationToken Mqtt311', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_timeout_test(mrr_test.ProtocolVersion.Mqtt311, false);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure On Close Mqtt5', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_on_close_test(mrr_test.ProtocolVersion.Mqtt5, "closed");
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure On Close Mqtt311', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_on_close_test(mrr_test.ProtocolVersion.Mqtt311, "closed");
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure zero max request response subscriptions mqtt5', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt5, mrr_test.create_bad_config_no_max_request_response_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure zero max request response subscriptions mqtt311', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt311, mrr_test.create_bad_config_no_max_request_response_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure invalid max request response subscriptions mqtt5', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt5, mrr_test.create_bad_config_invalid_max_request_response_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure invalid max request response subscriptions mqtt311', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt311, mrr_test.create_bad_config_invalid_max_request_response_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure undefined config mqtt5', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt5, mrr_test.create_bad_config_undefined_config, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure undefined config mqtt311', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt311, mrr_test.create_bad_config_undefined_config, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure undefined max request response subscriptions mqtt5', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt5, mrr_test.create_bad_config_undefined_max_request_response_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure undefined max request response subscriptions mqtt311', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt311, mrr_test.create_bad_config_undefined_max_request_response_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure null max request response subscriptions mqtt5', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt5, mrr_test.create_bad_config_null_max_request_response_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure null max request response subscriptions mqtt311', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt311, mrr_test.create_bad_config_null_max_request_response_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure missing max request response subscriptions mqtt5', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt5, mrr_test.create_bad_config_missing_max_request_response_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure missing max request response subscriptions mqtt311', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt311, mrr_test.create_bad_config_missing_max_request_response_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure undefined max streaming subscriptions mqtt5', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt5, mrr_test.create_bad_config_undefined_max_streaming_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure undefined max streaming subscriptions mqtt311', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt311, mrr_test.create_bad_config_undefined_max_streaming_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure null max streaming subscriptions mqtt5', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt5, mrr_test.create_bad_config_null_max_streaming_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure null max streaming subscriptions mqtt311', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt311, mrr_test.create_bad_config_null_max_streaming_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure missing max streaming subscriptions mqtt5', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt5, mrr_test.create_bad_config_missing_max_streaming_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure missing max streaming subscriptions mqtt311', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt311, mrr_test.create_bad_config_missing_max_streaming_subscriptions, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure missing max streaming subscriptions mqtt5', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt5, mrr_test.create_bad_config_invalid_operation_timeout, "Invalid client options");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Client creation failure missing max streaming subscriptions mqtt311', async() => {
    initClientBuilderFactories();
    mrr_test.do_client_creation_failure_test(mrr_test.ProtocolVersion.Mqtt311, mrr_test.create_bad_config_invalid_operation_timeout, "Invalid client options");
});


test('Client creation failure null protocol client mqtt311', async() => {
    let config : mqtt_request_response.RequestResponseClientOptions = {
        maxRequestResponseSubscriptions: 2,
        maxStreamingSubscriptions : 2,
        operationTimeoutInSeconds : 5,
    };

    // @ts-ignore
    expect(() => {mqtt_request_response.RequestResponseClient.newFromMqtt311(null, config)}).toThrow("protocol client is null");
});

test('Client creation failure null protocol client mqtt5', async() => {
    let config : mqtt_request_response.RequestResponseClientOptions = {
        maxRequestResponseSubscriptions: 2,
        maxStreamingSubscriptions : 2,
        operationTimeoutInSeconds : 5,
    };

    // @ts-ignore
    expect(() => {mqtt_request_response.RequestResponseClient.newFromMqtt5(null, config)}).toThrow("protocol client is null");
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure No Subscription Topic Filters', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            delete new_options.subscriptionTopicFilters;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Null Subscription Topic Filters', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.subscriptionTopicFilters = null;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Subscription Topic Filters Not An Array', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.subscriptionTopicFilters = "null";

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Subscription Topic Filters Empty', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.subscriptionTopicFilters = [];

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure No Response Paths', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            delete new_options.responsePaths;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Null Response Paths', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.responsePaths = null;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Response Paths Not An Array', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.responsePaths = "null";

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Response Paths Empty', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.responsePaths = [];

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Response Path No Topic', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            delete new_options.responsePaths[0].topic;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Response Path Null Topic', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.responsePaths[0].topic = null;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Response Path Bad Topic Type', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.responsePaths[0].topic = 5;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Response Path Null Correlation Token Json Path', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.responsePaths[0].correlationTokenJsonPath = null;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Response Path Bad Correlation Token Json Path Type', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.responsePaths[0].correlationTokenJsonPath = {};

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure No Publish Topic', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            delete new_options.publishTopic;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Null Publish Topic', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.publishTopic = null;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Bad Publish Topic Type', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.publishTopic = {someValue: null};

            return new_options;
        });
    })
});


test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure No Payload', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            delete new_options.payload;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Null Payload', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.payload = null;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Null Correlation Token', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.correlationToken = null;

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Bad Correlation Token Type', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            // @ts-ignore
            new_options.correlationToken = ["something"];

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Protocol Invalid Topic', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options", (options: mqtt_request_response.RequestResponseOperationOptions) => {
            let new_options = options;
            new_options.publishTopic = "#/illegal/#/topic";

            return new_options;
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Null Options', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_get_named_shadow_failure_invalid_test(true, "Invalid request options",
            // @ts-ignore
            (options: mqtt_request_response.RequestResponseOperationOptions) => {
                return null;
            });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('GetNamedShadow Failure Submit After Close', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        let context = new mrr_test.TestingContext({
            version: mrr_test.ProtocolVersion.Mqtt5
        });

        await context.open();
        await context.close();

        let requestOptions = mrr_test.createRejectedGetNamedShadowRequest(true);
        try {
            await context.client.submitRequest(requestOptions);
            expect(false);
        } catch (err: any) {
            expect(err.message).toContain("already been closed");
        }
    })
});

//////////////////////////////////////////////
// Streaming Ops

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('ShadowUpdated Streaming Operation Success Open/Close MQTT5', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_streaming_operation_new_open_close_test(mrr_test.ProtocolVersion.Mqtt5);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('ShadowUpdated Streaming Operation Success Open/Close MQTT311', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_streaming_operation_new_open_close_test(mrr_test.ProtocolVersion.Mqtt311);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('ShadowUpdated Streaming Operation Success Incoming Publish MQTT5', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_streaming_operation_incoming_publish_test(mrr_test.ProtocolVersion.Mqtt5);
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('ShadowUpdated Streaming Operation Success Incoming Publish MQTT311', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        initClientBuilderFactories();
        await mrr_test.do_streaming_operation_incoming_publish_test(mrr_test.ProtocolVersion.Mqtt311);
    })
});

// We only have a 5-based test because there's no way to stop the 311 client without destroying it in the process.
test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('ShadowUpdated Streaming Operation Success Subscription Events MQTT5', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        await mrr_test.do_streaming_operation_subscription_events_test({
            version: mrr_test.ProtocolVersion.Mqtt5,
            builder_mutator5: (builder) => {
                builder.withSessionBehavior(mqtt5.ClientSessionBehavior.Clean);
                return builder;
            }
        });
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Streaming Operation Failure Reopen', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        let context = new mrr_test.TestingContext({
            version: mrr_test.ProtocolVersion.Mqtt5
        });

        await context.open();

        let topic_filter = `not/a/real/shadow/${uuid()}`;
        let streaming_options: mqtt_request_response.StreamingOperationOptions = {
            subscriptionTopicFilter: topic_filter,
        }

        let stream = context.client.createStream(streaming_options);

        let initialSubscriptionComplete = once(stream, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

        stream.open();

        await initialSubscriptionComplete;

        stream.open();

        stream.close();

        // multi-opening or multi-closing are fine, but opening after a close is not
        expect(() => {
            stream.open()
        }).toThrow();

        stream.close();

        await context.close();
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Streaming Operation Auto Close', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        let context = new mrr_test.TestingContext({
            version: mrr_test.ProtocolVersion.Mqtt5
        });

        await context.open();

        let topic_filter = `not/a/real/shadow/${uuid()}`;
        let streaming_options: mqtt_request_response.StreamingOperationOptions = {
            subscriptionTopicFilter: topic_filter,
        }

        let stream = context.client.createStream(streaming_options);

        let initialSubscriptionComplete = once(stream, mqtt_request_response.StreamingOperationBase.SUBSCRIPTION_STATUS);

        stream.open();

        await initialSubscriptionComplete;

        stream.open();

        await context.close();

        // Closing the client should close the operation automatically; verify that by verifying that open now generates
        // an exception
        expect(() => {
            stream.open()
        }).toThrow();
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Streaming Operation Creation Failure Null Options', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        // @ts-ignore
        await mrr_test.do_invalid_streaming_operation_config_test(null, "Invalid streaming options");
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Streaming Operation Creation Failure Undefined Options', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        // @ts-ignore
        await mrr_test.do_invalid_streaming_operation_config_test(undefined, "Invalid streaming options");
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Streaming Operation Creation Failure Null Filter', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        await mrr_test.do_invalid_streaming_operation_config_test({
            // @ts-ignore
            subscriptionTopicFilter: null,
        }, "Invalid streaming options");
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Streaming Operation Creation Failure Invalid Filter Type', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        await mrr_test.do_invalid_streaming_operation_config_test({
            // @ts-ignore
            subscriptionTopicFilter: 5,
        }, "Invalid streaming options");
    })
});

test_env.conditional_test(test_env.AWS_IOT_ENV.mqtt5_is_valid_cred())('Streaming Operation Creation Failure Invalid Filter Value', async () => {
    retry.networkTimeoutRetryWrapper( async () => {
        await mrr_test.do_invalid_streaming_operation_config_test({
            subscriptionTopicFilter: "#/hello/#",
        }, "Invalid streaming options");
    })
});
