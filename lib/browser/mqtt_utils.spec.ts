/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import * as mqtt from "mqtt";
import {UserProperty, ConnackPacket, ConnectReasonCode, QoS} from "../common/mqtt5_packet";
import {
    transform_mqtt_js_user_properties_to_crt_user_properties,
    transform_crt_user_properties_to_mqtt_js_user_properties,
    transform_mqtt_js_connack_to_crt_connack
} from "./mqtt_utils";

test('MQTT.JS User Properties to CRT User Properties undefined', async () => {
    let crtUserProperties : UserProperty[] | undefined = transform_mqtt_js_user_properties_to_crt_user_properties(undefined);

    expect(crtUserProperties).toBeUndefined();
});

test('MQTT.JS User Properties to CRT User Properties single', async () => {
    let mqttJsUserProperties : mqtt.UserProperties = {
        prop1 : "value1",
        prop2 : "value2"
    }

    let crtUserProperties : UserProperty[] | undefined = transform_mqtt_js_user_properties_to_crt_user_properties(mqttJsUserProperties);

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

    let crtUserProperties : UserProperty[] | undefined = transform_mqtt_js_user_properties_to_crt_user_properties(mqttJsUserProperties);

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
    let mqttJsUserProperties : mqtt.UserProperties = transform_crt_user_properties_to_mqtt_js_user_properties(undefined);

    expect(mqttJsUserProperties).toEqual({});
});

test('CRT User Properties to MQTT.js User Properties single', async () => {
    let crtUserProperties : UserProperty[] = [
        { name : "prop1", value: "value1"},
        { name : "prop2", value: "value2"}
    ]

    let mqttJsUserProperties : mqtt.UserProperties = transform_crt_user_properties_to_mqtt_js_user_properties(crtUserProperties);

    expect(mqttJsUserProperties).toEqual(
        {
            prop1: ["value1"],
            prop2: ["value2"]
        } );
});

test('CRT User Properties to MQTT.js User Properties single', async () => {
    let crtUserProperties : UserProperty[] = [
        { name : "prop1", value: "value1"},
        { name : "prop2", value: "value2_1"},
        { name : "prop2", value: "value2_2"},
        { name : "prop2", value: "value2_3"}
    ]

    let mqttJsUserProperties : mqtt.UserProperties = transform_crt_user_properties_to_mqtt_js_user_properties(crtUserProperties);

    const {prop1 : propOne, prop2: propTwo, ...rest} = mqttJsUserProperties;

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

    let crtConnack : ConnackPacket = transform_mqtt_js_connack_to_crt_connack(mqttJsConnack);

    expect(crtConnack).toEqual({
        sessionPresent : true,
        reasonCode : ConnectReasonCode.Success
    });
});

test('transform_mqtt_js_connack_to_crt_connack maximal', async() => {
    let mqttJsConnack : mqtt.IConnackPacket = {
        cmd: 'connack',
        sessionPresent: false,
        reasonCode : ConnectReasonCode.UnspecifiedError,
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

    let crtConnack : ConnackPacket = transform_mqtt_js_connack_to_crt_connack(mqttJsConnack);

    expect(crtConnack).toEqual({
        sessionPresent : false,
        reasonCode : ConnectReasonCode.UnspecifiedError,
        sessionExpiryInterval: 3600,
        receiveMaximum: 10,
        maximumQos: QoS.AtLeastOnce,
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

});

test('create_negotiated_settings empty connack, full connect', async() => {

});

test('create_negotiated_settings full connack, empty connect', async() => {

});

test('create_negotiated_settings full connack, full connect', async() => {

});

test('create_mqtt_js_client_config_from_crt_client_config minimal', async() => {

});

test('create_mqtt_js_client_config_from_crt_client_config maximal', async() => {

});