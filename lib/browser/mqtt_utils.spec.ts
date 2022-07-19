/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt from "mqtt";
import * as mqtt5_packet from "../common/mqtt5_packet";
import * as mqtt_utils from "./mqtt_utils";
import {Mqtt5ClientConfig} from "./mqtt5";
import {ClientOperationQueueBehavior, ClientSessionBehavior, RetryJitterType} from "../common/mqtt5";


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
        maximumQos: mqtt5_packet.QoS.ExactlyOnce,
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
        maximumQos: mqtt5_packet.QoS.ExactlyOnce,
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
        keepalive: mqtt_utils.DEFAULT_KEEP_ALIVE,
        connectTimeout: mqtt_utils.DEFAULT_CONNACK_TIMEOUT_MS,
        clean: true,
        reconnectPeriod: mqtt_utils.DEFAULT_MAX_RECONNECT_DELAY_MS,
        queueQoSZero : false,
        autoUseTopicAlias : false,
        autoAssignTopicAlias : false,
        transformWsUrl: undefined, /* TOFIX */
        resubscribe : false
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
        offlineQueueBehavior: ClientOperationQueueBehavior.FailQos0PublishOnDisconnect,
        retryJitterMode: RetryJitterType.Decorrelated,
        minReconnectDelayMs : 1000,
        maxReconnectDelayMs : 60000,
        minConnectedTimeToResetReconnectDelayMs : 30000,
        pingTimeoutMs : 30000,
        connackTimeoutMs : 10000,
        operationTimeoutSeconds : 120000,
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
    expectedOptions["reconnectPeriod"] = 60000;
    expectedOptions["username"] = "Larry";
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
        offlineQueueBehavior: ClientOperationQueueBehavior.FailQos0PublishOnDisconnect,
        retryJitterMode: RetryJitterType.Decorrelated,
        minReconnectDelayMs : 1000,
        maxReconnectDelayMs : 60000,
        minConnectedTimeToResetReconnectDelayMs : 30000,
        pingTimeoutMs : 30000,
        connackTimeoutMs : 10000,
        operationTimeoutSeconds : 120000,
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
    expectedOptions["reconnectPeriod"] = 60000;
    expectedOptions["username"] = "Larry";
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

});

test('transform_crt_subscribe_to_mqtt_js_subscribe_options minimal', async() => {

});

test('transform_crt_subscribe_to_mqtt_js_subscribe_options maximal', async() => {

});

test('transform_mqtt_js_subscription_grants_to_crt_suback', async() => {

});

test('transform_crt_publish_to_mqtt_js_publish_options minimal', async() => {

});

test('transform_crt_publish_to_mqtt_js_publish_options maximal', async() => {

});

test('transform_mqtt_js_publish_to_crt_publish minimal', async() => {

});

test('transform_mqtt_js_publish_to_crt_publish maximal', async() => {

});

test('transform_mqtt_js_puback_to_crt_puback minimal', async() => {

});

test('transform_mqtt_js_puback_to_crt_puback maximal', async() => {

});

test('transform_crt_unsubscribe_to_mqtt_js_unsubscribe_options minimal', async() => {

});

test('transform_crt_unsubscribe_to_mqtt_js_unsubscribe_options maximal', async() => {

});

test('transform_mqtt_js_unsuback_to_crt_unsuback minimal', async() => {

});

test('transform_mqtt_js_unsuback_to_crt_unsuback maximal', async() => {

});
