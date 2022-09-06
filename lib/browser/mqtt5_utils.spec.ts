/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt from "mqtt";
import * as mqtt5_packet from "../common/mqtt5_packet";
import {PayloadFormatIndicator} from "../common/mqtt5_packet";
import * as mqtt_utils from "./mqtt5_utils";
import * as mqtt_shared from "../common/mqtt_shared";
import {Mqtt5ClientConfig} from "./mqtt5";
import {ClientSessionBehavior, RetryJitterType} from "../common/mqtt5";
import {compute_mqtt_js_reconnect_delay_from_crt_max_delay} from "./mqtt5_utils";


test('MQTT.JS User Properties to CRT User Properties undefined', async () => {
    let crtUserProperties : mqtt5_packet.UserProperty[] | undefined = mqtt_utils.transform_mqtt_js_user_properties_to_crt_user_properties(undefined);

    expect(crtUserProperties).toBeUndefined();
});

test('MQTT.JS User Properties to CRT User Properties single', async () => {
    let mqttJsUserProperties : mqtt.UserProperties = {
        prop1 : "value1",
        prop2 : "value2"
    }

    let crtUserProperties : mqtt5_packet.UserProperty[] | undefined = mqtt_utils.transform_mqtt_js_user_properties_to_crt_user_properties(mqttJsUserProperties);

    expect(crtUserProperties).toBeDefined();
    expect(crtUserProperties?.length).toEqual(2);
    expect(crtUserProperties).toEqual( expect.arrayContaining([
            {
                name: "prop1",
                value: "value1",
            },
            {
                name: "prop2",
                value: "value2",
            }
        ]
    ));
});

test('MQTT.JS User Properties to CRT User Properties multi', async () => {
    let mqttJsUserProperties : mqtt.UserProperties = {
        prop1 : "value1",
        prop2 : ["value2_1", "value2_2", "value2_3"]
    }

    let crtUserProperties : mqtt5_packet.UserProperty[] | undefined = mqtt_utils.transform_mqtt_js_user_properties_to_crt_user_properties(mqttJsUserProperties);

    expect(crtUserProperties).toBeDefined();
    expect(crtUserProperties?.length).toEqual(4);
    expect(crtUserProperties).toEqual( expect.arrayContaining([
            {
                name: "prop1",
                value: "value1",
            },
            {
                name: "prop2",
                value: "value2_1",
            },
            {
                name: "prop2",
                value: "value2_2",
            },
            {
                name: "prop2",
                value: "value2_3",
            }
        ]
    ));
});

test('CRT User Properties to MQTT.js User Properties undefined', async () => {
    let mqttJsUserProperties : mqtt.UserProperties | undefined = mqtt_utils.transform_crt_user_properties_to_mqtt_js_user_properties(undefined);

    expect(mqttJsUserProperties).toBeUndefined();
});

test('CRT User Properties to MQTT.js User Properties single', async () => {
    let crtUserProperties : mqtt5_packet.UserProperty[] = [
        { name : "prop1", value: "value1"},
        { name : "prop2", value: "value2"}
    ]

    let mqttJsUserProperties : mqtt.UserProperties | undefined = mqtt_utils.transform_crt_user_properties_to_mqtt_js_user_properties(crtUserProperties);

    expect(mqttJsUserProperties).toEqual(
        {
            prop1: ["value1"],
            prop2: ["value2"]
        } );
});

test('CRT User Properties to MQTT.js User Properties single', async () => {
    let crtUserProperties : mqtt5_packet.UserProperty[] = [
        { name : "prop1", value: "value1"},
        { name : "prop2", value: "value2_1"},
        { name : "prop2", value: "value2_2"},
        { name : "prop2", value: "value2_3"}
    ]

    let mqttJsUserProperties : mqtt.UserProperties | undefined = mqtt_utils.transform_crt_user_properties_to_mqtt_js_user_properties(crtUserProperties);
    expect(mqttJsUserProperties).toBeDefined();
    let definedProperties : mqtt.UserProperties = mqttJsUserProperties ?? {};

    const {prop1 : propOne, prop2: propTwo, ...rest} = definedProperties;

    expect(rest).toEqual({});
    expect(propOne).toEqual(["value1"]);
    expect(propTwo.length).toEqual(3);
    expect(propTwo).toEqual(expect.arrayContaining(["value2_1", "value2_2", "value2_3"]));
});

test('transform_mqtt_js_connack_to_crt_connack minimal', async() => {
    let mqttJsConnack : mqtt.IConnackPacket = {
        cmd: 'connack',
        sessionPresent: true
    }

    let crtConnack : mqtt5_packet.ConnackPacket = mqtt_utils.transform_mqtt_js_connack_to_crt_connack(mqttJsConnack);

    expect(crtConnack).toEqual({
        type: mqtt5_packet.PacketType.Connack,
        sessionPresent : true,
        reasonCode : mqtt5_packet.ConnectReasonCode.Success
    });
});

test('transform_mqtt_js_connack_to_crt_connack maximal', async() => {
    let mqttJsConnack : mqtt.IConnackPacket = {
        cmd: 'connack',
        sessionPresent: false,
        reasonCode : mqtt5_packet.ConnectReasonCode.UnspecifiedError,
        properties: {
            sessionExpiryInterval: 3600,
            receiveMaximum: 10,
            maximumQoS: 1,
            retainAvailable: false,
            maximumPacketSize: 128 * 1024,
            assignedClientIdentifier: "your-new-client-id-01",
            topicAliasMaximum: 5,
            reasonString: "Not sure really",
            userProperties: {
                prop1: "Value1",
                prop2: "Value2"
            },
            wildcardSubscriptionAvailable: true,
            subscriptionIdentifiersAvailable: true,
            sharedSubscriptionAvailable: true,
            serverKeepAlive: 1800,
            responseInformation: "some/topic/prefix",
            serverReference: "somewhere-else.com",
            authenticationMethod: "don't support this atm"
        }
    }

    let crtConnack : mqtt5_packet.ConnackPacket = mqtt_utils.transform_mqtt_js_connack_to_crt_connack(mqttJsConnack);

    expect(crtConnack).toEqual({
        type: mqtt5_packet.PacketType.Connack,
        sessionPresent : false,
        reasonCode : mqtt5_packet.ConnectReasonCode.UnspecifiedError,
        sessionExpiryInterval: 3600,
        receiveMaximum: 10,
        maximumQos: mqtt5_packet.QoS.AtLeastOnce,
        retainAvailable: false,
        maximumPacketSize: 128 * 1024,
        assignedClientIdentifier: "your-new-client-id-01",
        topicAliasMaximum: 5,
        reasonString: "Not sure really",
        wildcardSubscriptionsAvailable: true,
        subscriptionIdentifiersAvailable: true,
        sharedSubscriptionsAvailable: true,
        serverKeepAlive: 1800,
        responseInformation: "some/topic/prefix",
        serverReference: "somewhere-else.com",
        userProperties: [
            { name: "prop1", value: "Value1" },
            { name: "prop2", value: "Value2" },
        ]
    });
});

test('create_negotiated_settings empty connack, empty connect', async() => {
    let clientConfig : Mqtt5ClientConfig = {
        hostName: "derp.com",
        port: 8883
    };

    let connack : mqtt5_packet.ConnackPacket = {
        sessionPresent: true,
        reasonCode: mqtt5_packet.ConnectReasonCode.Success,
        assignedClientIdentifier: "assignedId"
    }

    let settings = mqtt_utils.create_negotiated_settings(clientConfig, connack);

    expect(settings).toEqual({
        maximumQos: mqtt5_packet.QoS.AtLeastOnce,
        sessionExpiryInterval: 0,
        receiveMaximumFromServer: 65535,
        maximumPacketSizeToServer: mqtt_utils.MAXIMUM_PACKET_SIZE,
        serverKeepAlive: 1200,
        retainAvailable: true,
        wildcardSubscriptionsAvailable: true,
        subscriptionIdentifiersAvailable: true,
        sharedSubscriptionsAvailable: true,
        rejoinedSession: true,
        clientId: "assignedId"
    });
});

test('create_negotiated_settings empty connack, full connect', async() => {
    let clientConfig : Mqtt5ClientConfig = {
        hostName: "derp.com",
        port: 8883,
        connectProperties: {
            clientId: "myClientId",
            keepAliveIntervalSeconds: 1800,
            sessionExpiryIntervalSeconds: 3600
        }
    };

    let connack : mqtt5_packet.ConnackPacket = {
        sessionPresent: true,
        reasonCode: mqtt5_packet.ConnectReasonCode.Success
    }

    let settings = mqtt_utils.create_negotiated_settings(clientConfig, connack);

    expect(settings).toEqual({
        maximumQos: mqtt5_packet.QoS.AtLeastOnce,
        sessionExpiryInterval: 3600,
        receiveMaximumFromServer: 65535,
        maximumPacketSizeToServer: mqtt_utils.MAXIMUM_PACKET_SIZE,
        serverKeepAlive: 1800,
        retainAvailable: true,
        wildcardSubscriptionsAvailable: true,
        subscriptionIdentifiersAvailable: true,
        sharedSubscriptionsAvailable: true,
        rejoinedSession: true,
        clientId: "myClientId"
    });
});

test('create_negotiated_settings full connack, empty connect', async() => {
    let clientConfig : Mqtt5ClientConfig = {
        hostName: "derp.com",
        port: 8883
    };

    let connack : mqtt5_packet.ConnackPacket = {
        sessionPresent: false,
        reasonCode: mqtt5_packet.ConnectReasonCode.Success,
        assignedClientIdentifier: "autoAssignedId",
        maximumQos : mqtt5_packet.QoS.AtLeastOnce,
        sessionExpiryInterval : 120,
        receiveMaximum : 100,
        maximumPacketSize : 128 * 1024,
        serverKeepAlive : 600,
        retainAvailable : false,
        wildcardSubscriptionsAvailable : false,
        subscriptionIdentifiersAvailable : false,
        sharedSubscriptionsAvailable : false
    }

    let settings = mqtt_utils.create_negotiated_settings(clientConfig, connack);

    expect(settings).toEqual({
        maximumQos: mqtt5_packet.QoS.AtLeastOnce,
        sessionExpiryInterval: 120,
        receiveMaximumFromServer: 100,
        maximumPacketSizeToServer: 128 * 1024,
        serverKeepAlive: 600,
        retainAvailable: false,
        wildcardSubscriptionsAvailable: false,
        subscriptionIdentifiersAvailable: false,
        sharedSubscriptionsAvailable: false,
        rejoinedSession: false,
        clientId: "autoAssignedId"
    });
});

test('create_negotiated_settings full connack, full connect', async() => {
    let clientConfig : Mqtt5ClientConfig = {
        hostName: "derp.com",
        port: 8883,
        connectProperties: {
            clientId: "myClientId",
            keepAliveIntervalSeconds: 1800,
            sessionExpiryIntervalSeconds: 3600
        }
    };

    let connack : mqtt5_packet.ConnackPacket = {
        sessionPresent: false,
        reasonCode: mqtt5_packet.ConnectReasonCode.Success,
        maximumQos : mqtt5_packet.QoS.AtLeastOnce,
        sessionExpiryInterval : 1200,
        receiveMaximum : 100,
        maximumPacketSize : 128 * 1024,
        serverKeepAlive : 600,
        retainAvailable : false,
        wildcardSubscriptionsAvailable : false,
        subscriptionIdentifiersAvailable : false,
        sharedSubscriptionsAvailable : false
    }

    let settings = mqtt_utils.create_negotiated_settings(clientConfig, connack);

    expect(settings).toEqual({
        maximumQos: mqtt5_packet.QoS.AtLeastOnce,
        sessionExpiryInterval: 1200,
        receiveMaximumFromServer: 100,
        maximumPacketSizeToServer: 128 * 1024,
        serverKeepAlive: 600,
        retainAvailable: false,
        wildcardSubscriptionsAvailable: false,
        subscriptionIdentifiersAvailable: false,
        sharedSubscriptionsAvailable: false,
        rejoinedSession: false,
        clientId: "myClientId"
    });
});

function create_base_expected_mqtt_js_config() : mqtt.IClientOptions {
    return {
        keepalive: mqtt_shared.DEFAULT_KEEP_ALIVE,
        connectTimeout: mqtt_utils.DEFAULT_CONNECT_TIMEOUT_MS,
        clean: true,
        protocolVersion : 5,
        reconnectPeriod: compute_mqtt_js_reconnect_delay_from_crt_max_delay(mqtt_utils.DEFAULT_MAX_RECONNECT_DELAY_MS),
        queueQoSZero : false,
        // @ts-ignore
        autoUseTopicAlias : false,
        // @ts-ignore
        autoAssignTopicAlias : false,
        transformWsUrl: undefined, /* TOFIX */
        resubscribe : false,
        clientId : ""
    };
}

test('create_mqtt_js_client_config_from_crt_client_config minimal', async() => {
    let crtClientConfig : Mqtt5ClientConfig = {
        hostName: "derp.com",
        port: 8883
    };

    let mqttJsClientOptions : mqtt.IClientOptions = mqtt_utils.create_mqtt_js_client_config_from_crt_client_config(crtClientConfig);

    let expectedOptions : mqtt.IClientOptions = create_base_expected_mqtt_js_config();

    expect(mqttJsClientOptions).toEqual(expectedOptions);
});

test('create_mqtt_js_client_config_from_crt_client_config maximal, minimal will', async() => {
    let myPassword: Buffer = Buffer.from("SekritPassword", "utf-8");

    let crtClientConfig : Mqtt5ClientConfig = {
        hostName: "derp.com",
        port: 8883,
        sessionBehavior: ClientSessionBehavior.RejoinPostSuccess,
        retryJitterMode: RetryJitterType.Decorrelated,
        minReconnectDelayMs : 1000,
        maxReconnectDelayMs : 60000,
        minConnectedTimeToResetReconnectDelayMs : 30000,
        connectTimeoutMs : 10000,
        connectProperties: {
            keepAliveIntervalSeconds : 120,
            clientId : "MyClientId",
            username : "Larry",
            password : myPassword,
            sessionExpiryIntervalSeconds : 3600,
            requestResponseInformation : true,
            requestProblemInformation : true,
            receiveMaximum : 20,
            maximumPacketSizeBytes : 65536,
            userProperties : [
                { name: "prop1", value: "value1"}
            ],
            will: {
                topicName : "Ohno",
                qos : mqtt5_packet.QoS.AtLeastOnce
            }
        }
    };

    let mqttJsClientOptions : mqtt.IClientOptions = mqtt_utils.create_mqtt_js_client_config_from_crt_client_config(crtClientConfig);

    let expectedOptions : mqtt.IClientOptions = create_base_expected_mqtt_js_config();
    expectedOptions["clean"] = false;
    expectedOptions["keepalive"] = 120;
    expectedOptions["clientId"] = "MyClientId";
    expectedOptions["connectTimeout"] = 10000;
    expectedOptions["reconnectPeriod"] = compute_mqtt_js_reconnect_delay_from_crt_max_delay(60000);
    expectedOptions["username"] = "Larry";
    // @ts-ignore
    expectedOptions["password"] = myPassword;
    expectedOptions["will"] = {
        topic : "Ohno",
        payload : "",
        qos : mqtt5_packet.QoS.AtLeastOnce,
        retain : false
    }
    expectedOptions["properties"] = {
        sessionExpiryInterval: 3600,
        receiveMaximum: 20,
        maximumPacketSize: 65536,
        requestResponseInformation: true,
        requestProblemInformation: true,
        userProperties : {
            prop1: [ "value1" ]
        }
    };

    expect(mqttJsClientOptions).toEqual(expectedOptions);
});

test('create_mqtt_js_client_config_from_crt_client_config maximal, maximal will', async() => {
    let myPassword: Buffer = Buffer.from("SekritPassword", "utf-8");
    let willPayload: Buffer = Buffer.from("ImportantData", "utf-8");
    let correlationData: Buffer = Buffer.from("UniqueId", "utf-8");

    let crtClientConfig : Mqtt5ClientConfig = {
        hostName: "derp.com",
        port: 8883,
        sessionBehavior: ClientSessionBehavior.RejoinPostSuccess,
        retryJitterMode: RetryJitterType.Decorrelated,
        minReconnectDelayMs : 1000,
        maxReconnectDelayMs : 60000,
        minConnectedTimeToResetReconnectDelayMs : 30000,
        connectTimeoutMs : 10000,
        connectProperties: {
            keepAliveIntervalSeconds : 120,
            clientId : "MyClientId",
            username : "Larry",
            password : myPassword,
            sessionExpiryIntervalSeconds : 3600,
            requestResponseInformation : true,
            requestProblemInformation : true,
            receiveMaximum : 20,
            maximumPacketSizeBytes : 65536,
            userProperties : [
                { name: "prop1", value: "value1"}
            ],
            willDelayIntervalSeconds : 60,
            will: {
                topicName : "Ohno",
                qos : mqtt5_packet.QoS.AtMostOnce,
                payload: willPayload,
                retain: true,
                payloadFormat: mqtt5_packet.PayloadFormatIndicator.Bytes,
                messageExpiryIntervalSeconds: 300,
                contentType: "not-json",
                responseTopic: "hello/world",
                correlationData: correlationData,
                userProperties: [
                    {name: "prop1", value: "value1" }
                ]
            }
        }
    };

    let mqttJsClientOptions : mqtt.IClientOptions = mqtt_utils.create_mqtt_js_client_config_from_crt_client_config(crtClientConfig);

    let expectedOptions : mqtt.IClientOptions = create_base_expected_mqtt_js_config();
    expectedOptions["clean"] = false;
    expectedOptions["keepalive"] = 120;
    expectedOptions["clientId"] = "MyClientId";
    expectedOptions["connectTimeout"] = 10000;
    expectedOptions["reconnectPeriod"] = compute_mqtt_js_reconnect_delay_from_crt_max_delay(60000);
    expectedOptions["username"] = "Larry";
    // @ts-ignore
    expectedOptions["password"] = myPassword;
    expectedOptions["will"] = {
        topic : "Ohno",
        payload : willPayload,
        qos : mqtt5_packet.QoS.AtMostOnce,
        retain : true,
        properties : {
            willDelayInterval: 60,
            payloadFormatIndicator: false,
            messageExpiryInterval: 300,
            contentType: "not-json",
            responseTopic: "hello/world",
            correlationData: correlationData,
            userProperties: {
                prop1: [ "value1" ]
            }
        }
    }
    expectedOptions["properties"] = {
        sessionExpiryInterval: 3600,
        receiveMaximum: 20,
        maximumPacketSize: 65536,
        requestResponseInformation: true,
        requestProblemInformation: true,
        userProperties : {
            prop1: [ "value1" ]
        }
    };

    expect(mqttJsClientOptions).toEqual(expectedOptions);
});

test('transform_mqtt_js_disconnect_to_crt_disconnect minimal', async() => {
    let mqttJsDisconnect : mqtt.IDisconnectPacket = {
        cmd: "disconnect"
    }

    let crtDisconnect : mqtt5_packet.DisconnectPacket = mqtt_utils.transform_mqtt_js_disconnect_to_crt_disconnect(mqttJsDisconnect);

    expect(crtDisconnect).toEqual( {
            type: mqtt5_packet.PacketType.Disconnect,
            reasonCode: mqtt5_packet.DisconnectReasonCode.NormalDisconnection
        }
    )
});

test('transform_mqtt_js_disconnect_to_crt_disconnect maximal', async() => {
    let mqttJsDisconnect : mqtt.IDisconnectPacket = {
        cmd: "disconnect",
        reasonCode : mqtt5_packet.DisconnectReasonCode.AdministrativeAction,
        properties : {
            sessionExpiryInterval: 120,
            reasonString: "Misbehavior",
            serverReference: "somewhere-else.com",
            userProperties: {
                prop1: ["value1"]
            }
        }
    }

    let crtDisconnect : mqtt5_packet.DisconnectPacket = mqtt_utils.transform_mqtt_js_disconnect_to_crt_disconnect(mqttJsDisconnect);

    expect(crtDisconnect).toEqual({
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode : mqtt5_packet.DisconnectReasonCode.AdministrativeAction,
        sessionExpiryIntervalSeconds : 120,
        reasonString : "Misbehavior",
        serverReference : "somewhere-else.com",
        userProperties : [
            { name: "prop1", value: "value1" }
        ]
    })
});

test('transform_crt_disconnect_to_mqtt_js_disconnect minimal', async() => {
    let crtDisconnect : mqtt5_packet.DisconnectPacket = {
        reasonCode : mqtt5_packet.DisconnectReasonCode.NormalDisconnection
    }

    let mqttJsDisconnect : mqtt.IDisconnectPacket = mqtt_utils.transform_crt_disconnect_to_mqtt_js_disconnect(crtDisconnect);

    expect(mqttJsDisconnect).toEqual( {
            cmd: "disconnect",
            reasonCode : 0
        }
    )
});

test('transform_crt_disconnect_to_mqtt_js_disconnect maximal', async() => {
    let crtDisconnect : mqtt5_packet.DisconnectPacket = {
        reasonCode : mqtt5_packet.DisconnectReasonCode.AdministrativeAction,
        sessionExpiryIntervalSeconds : 120,
        reasonString : "Misbehavior",
        serverReference : "somewhere-else.com",
        userProperties : [
            { name: "prop1", value: "value1" }
        ]
    }

    let mqttJsDisconnect : mqtt.IDisconnectPacket = mqtt_utils.transform_crt_disconnect_to_mqtt_js_disconnect(crtDisconnect);

    expect(mqttJsDisconnect).toEqual({
        cmd: "disconnect",
        reasonCode : mqtt5_packet.DisconnectReasonCode.AdministrativeAction,
        properties : {
            sessionExpiryInterval: 120,
            reasonString: "Misbehavior",
            serverReference: "somewhere-else.com",
            userProperties: {
                prop1: ["value1"]
            }
        }
    })
});

test('transform_crt_subscribe_to_mqtt_js_subscription_map', async() => {
    let subscribe : mqtt5_packet.SubscribePacket = {
        subscriptions: [
            {
                qos: mqtt5_packet.QoS.AtLeastOnce,
                topicFilter: "hello/world",
                noLocal: true,
                retainAsPublished: true,
                retainHandlingType: mqtt5_packet.RetainHandlingType.SendOnSubscribeIfNew
            },
            {
                qos: mqtt5_packet.QoS.ExactlyOnce,
                topicFilter: "hello/world2"
            }
        ]
    }

    let mqttJsSubscriptionMap : mqtt.ISubscriptionMap = mqtt_utils.transform_crt_subscribe_to_mqtt_js_subscription_map(subscribe);

    expect(mqttJsSubscriptionMap).toEqual({
        "hello/world": {
            qos: mqtt5_packet.QoS.AtLeastOnce,
            nl: true,
            rap: true,
            rh: mqtt5_packet.RetainHandlingType.SendOnSubscribeIfNew
        },
        "hello/world2": {
            qos: mqtt5_packet.QoS.ExactlyOnce,
            nl: false,
            rap: false,
            rh: mqtt5_packet.RetainHandlingType.SendOnSubscribe
        }
    });
});

//function transform_crt_subscribe_to_mqtt_js_subscribe_options(subscribe: mqtt5_packet.SubscribePacket) : mqtt.IClientSubscribeOptions

test('transform_crt_subscribe_to_mqtt_js_subscribe_options minimal', async() => {
    let subscribe : mqtt5_packet.SubscribePacket = {
        subscriptions: [
            {
                qos: mqtt5_packet.QoS.ExactlyOnce,
                topicFilter: "hello/world2"
            }
        ]
    };

    let mqttJsSubscribeOptions : mqtt.IClientSubscribeOptions = mqtt_utils.transform_crt_subscribe_to_mqtt_js_subscribe_options(subscribe);

    expect(mqttJsSubscribeOptions).toEqual({
        qos: 0 // unfortunately, the typescript definition requires this parameter despite it not being used by us
    });
});

test('transform_crt_subscribe_to_mqtt_js_subscribe_options maximal', async() => {
    let subscribe : mqtt5_packet.SubscribePacket = {
        subscriptions: [
            {
                qos: mqtt5_packet.QoS.ExactlyOnce,
                topicFilter: "hello/world2"
            }
        ],
        subscriptionIdentifier: 5,
        userProperties: [
            { name: "prop1", value: "value1" }
        ]
    };

    let mqttJsSubscribeOptions : mqtt.IClientSubscribeOptions = mqtt_utils.transform_crt_subscribe_to_mqtt_js_subscribe_options(subscribe);

    expect(mqttJsSubscribeOptions).toEqual({
        qos: 0, // unfortunately, the typescript definition requires this parameter despite it not being used by us
        properties: {
            subscriptionIdentifier: 5,
            userProperties: {
                prop1: [ "value1" ]
            }
        }
    });
});

test('transform_mqtt_js_subscription_grants_to_crt_suback', async() => {
    let subscriptionsGranted : mqtt.ISubscriptionGrant[] = [
        {
            topic: "my/topic",
            qos: 2
        },
        {
            topic: "a/different/topic",
            qos: mqtt5_packet.SubackReasonCode.NotAuthorized,
            nl: true,
            rap: true,
            rh: 2
        }
    ];

    let suback : mqtt5_packet.SubackPacket = mqtt_utils.transform_mqtt_js_subscription_grants_to_crt_suback(subscriptionsGranted);

    expect(suback).toEqual({
        type: mqtt5_packet.PacketType.Suback,
        reasonCodes: [2, mqtt5_packet.SubackReasonCode.NotAuthorized]
    });
});

test('transform_crt_publish_to_mqtt_js_publish_options minimal', async() => {
    let publish : mqtt5_packet.PublishPacket = {
        topicName: "hello/there",
        qos: mqtt5_packet.QoS.AtMostOnce
    };

    let publishOptions: mqtt.IClientPublishOptions = mqtt_utils.transform_crt_publish_to_mqtt_js_publish_options(publish);

    expect(publishOptions).toEqual({
        qos: mqtt5_packet.QoS.AtMostOnce,
        retain: false
    });
});

test('transform_crt_publish_to_mqtt_js_publish_options maximal', async() => {
    let payload: Buffer = Buffer.from("warglgarbl", "utf-8");
    let correlationData: Buffer = Buffer.from("VeryUnique", "utf-8");

    let publish : mqtt5_packet.PublishPacket = {
        topicName: "hello/there",
        qos: mqtt5_packet.QoS.ExactlyOnce,
        retain: true,
        payload: payload,
        payloadFormat: PayloadFormatIndicator.Bytes,
        messageExpiryIntervalSeconds: 60,
        responseTopic: "the/answer",
        correlationData: correlationData,
        userProperties: [
            { name: "prop1", value: "value1" }
        ],
        contentType: "not-xml"
    };

    let publishOptions: mqtt.IClientPublishOptions = mqtt_utils.transform_crt_publish_to_mqtt_js_publish_options(publish);

    expect(publishOptions).toEqual({
        qos: mqtt5_packet.QoS.ExactlyOnce,
        retain: true,
        properties: {
            payloadFormatIndicator: false,
            messageExpiryInterval: 60,
            responseTopic: "the/answer",
            correlationData: correlationData,
            userProperties: {
                prop1: ["value1"]
            },
            contentType: "not-xml"
        }
    });
});

test('transform_mqtt_js_publish_to_crt_publish minimal', async() => {
    let payload : Buffer = Buffer.from("", "utf-8");

    let mqttJsPublish : mqtt.IPublishPacket = {
        cmd: 'publish',
        qos: mqtt5_packet.QoS.AtMostOnce,
        dup: false,
        retain: false,
        topic: 'hello/there',
        payload: payload
    };

    let crtPublish : mqtt5_packet.PublishPacket = mqtt_utils.transform_mqtt_js_publish_to_crt_publish(mqttJsPublish);

    expect(crtPublish).toEqual({
        type: mqtt5_packet.PacketType.Publish,
        topicName: "hello/there",
        qos: mqtt5_packet.QoS.AtMostOnce,
        payload: payload,
        retain: false
    });
});

test('transform_mqtt_js_publish_to_crt_publish maximal', async() => {
    let payload : Buffer = Buffer.from("Actual data", "utf-8");
    let correlationData : Buffer = Buffer.from("some-id", "utf-8");

    let mqttJsPublish : mqtt.IPublishPacket = {
        cmd: 'publish',
        qos: mqtt5_packet.QoS.AtMostOnce,
        dup: false,
        retain: true,
        topic: 'hello/there',
        payload: payload,
        properties: {
            payloadFormatIndicator: false,
            messageExpiryInterval: 30,
            topicAlias: 1,
            responseTopic: "response/goes/here",
            correlationData: correlationData,
            userProperties: {
                prop1: "value1"
            },
            subscriptionIdentifier: 5,
            contentType: "cbor"
        }
    };

    let crtPublish : mqtt5_packet.PublishPacket = mqtt_utils.transform_mqtt_js_publish_to_crt_publish(mqttJsPublish);

    expect(crtPublish).toEqual({
        type: mqtt5_packet.PacketType.Publish,
        topicName: "hello/there",
        qos: mqtt5_packet.QoS.AtMostOnce,
        payload: payload,
        retain: true,
        payloadFormat: mqtt5_packet.PayloadFormatIndicator.Bytes,
        messageExpiryIntervalSeconds: 30,
        responseTopic: "response/goes/here",
        correlationData: correlationData,
        userProperties: [
            { name: "prop1", value: "value1" }
        ],
        subscriptionIdentifiers: [ 5 ],
        contentType: "cbor"
    });
});

test('transform_mqtt_js_puback_to_crt_puback minimal', async() => {
    let mqttJsPuback : mqtt.IPubackPacket = {
        cmd: 'puback'
    };

    let crtPuback : mqtt5_packet.PubackPacket = mqtt_utils.transform_mqtt_js_puback_to_crt_puback(mqttJsPuback);

    expect(crtPuback).toEqual({
        type: mqtt5_packet.PacketType.Puback,
        reasonCode: mqtt5_packet.PubackReasonCode.Success
    });
});

test('transform_mqtt_js_puback_to_crt_puback maximal', async() => {
    let mqttJsPuback : mqtt.IPubackPacket = {
        cmd: 'puback',
        reasonCode: mqtt5_packet.PubackReasonCode.NotAuthorized,
        properties: {
            reasonString: "Insufficient privilege",
            userProperties: {
                prop1: "value1"
            }
        }
    };

    let crtPuback : mqtt5_packet.PubackPacket = mqtt_utils.transform_mqtt_js_puback_to_crt_puback(mqttJsPuback);

    expect(crtPuback).toEqual({
        type: mqtt5_packet.PacketType.Puback,
        reasonCode: mqtt5_packet.PubackReasonCode.NotAuthorized,
        reasonString: "Insufficient privilege",
        userProperties: [
            { name: "prop1", value: "value1" }
        ]
    });
});

test('transform_crt_unsubscribe_to_mqtt_js_unsubscribe_options minimal', async() => {
    let crtUnsubscribe : mqtt5_packet.UnsubscribePacket = {
        topicFilters: [ "hello/there" ]
    };

    let mqttJsUnsubscribeOptions : Object = mqtt_utils.transform_crt_unsubscribe_to_mqtt_js_unsubscribe_options(crtUnsubscribe);

    expect(mqttJsUnsubscribeOptions).toEqual({});
});

test('transform_crt_unsubscribe_to_mqtt_js_unsubscribe_options maximal', async() => {
    let crtUnsubscribe : mqtt5_packet.UnsubscribePacket = {
        topicFilters: [ "hello/there" ],
        userProperties: [
            { name: "prop1", value: "value1" }
        ]
    };

    let mqttJsUnsubscribeOptions : Object = mqtt_utils.transform_crt_unsubscribe_to_mqtt_js_unsubscribe_options(crtUnsubscribe);

    expect(mqttJsUnsubscribeOptions).toEqual({
        properties: {
            userProperties: {
                prop1: [ "value1" ]
            }
        }
    });
});

test('transform_mqtt_js_unsuback_to_crt_unsuback minimal', async() => {
    let mqttJsUnsuback : mqtt.IUnsubackPacket = {
        cmd: 'unsuback',
        reasonCode: mqtt5_packet.UnsubackReasonCode.NoSubscriptionExisted
    };

    let crtUnsuback : mqtt5_packet.UnsubackPacket = mqtt_utils.transform_mqtt_js_unsuback_to_crt_unsuback(mqttJsUnsuback);

    expect(crtUnsuback).toEqual({
        type: mqtt5_packet.PacketType.Unsuback,
        reasonCodes: [ mqtt5_packet.UnsubackReasonCode.NoSubscriptionExisted ]
    });
});

test('transform_mqtt_js_unsuback_to_crt_unsuback maximal', async() => {
    let mqttJsUnsuback : mqtt.IUnsubackPacket = {
        cmd: 'unsuback',
        // @ts-ignore
        reasonCode: [mqtt5_packet.UnsubackReasonCode.NoSubscriptionExisted, mqtt5_packet.UnsubackReasonCode.ImplementationSpecificError],
        properties: {
            reasonString: "Dunno",
            userProperties: {
                prop1: "value1"
            }
        }
    };

    let crtUnsuback : mqtt5_packet.UnsubackPacket = mqtt_utils.transform_mqtt_js_unsuback_to_crt_unsuback(mqttJsUnsuback);

    expect(crtUnsuback).toEqual({
        type: mqtt5_packet.PacketType.Unsuback,
        reasonCodes: [ mqtt5_packet.UnsubackReasonCode.NoSubscriptionExisted, mqtt5_packet.UnsubackReasonCode.ImplementationSpecificError ],
        reasonString: "Dunno",
        userProperties: [
            { name: "prop1", value: "value1" }
        ]
    });
});
