
/**
 * @packageDocumentation
 * @module mqtt5
 */

import * as mqtt from "mqtt";
import {ConnackPacket, ConnectReasonCode, QoS} from "../common/mqtt5_packet";
import {NegotiatedSettings} from "../common/mqtt5";
import {Mqtt5ClientConfig} from "./mqtt5";

/** @internal */
export function transform_mqtt_js_connack_to_crt_connack(mqtt_js_connack: mqtt.IConnackPacket) : ConnackPacket {
    return {
        sessionPresent : mqtt_js_connack.sessionPresent,
        reasonCode : mqtt_js_connack.reasonCode ?? ConnectReasonCode.Success
    };
}

/** @internal */
export function create_negotiated_settings(config : Mqtt5ClientConfig, connack: ConnackPacket) : NegotiatedSettings {
    return {
        maximumQos: QoS.AtLeastOnce,
        sessionExpiryInterval: 0,
        receiveMaximumFromServer: 10,
        maximumPacketSizeToServer: 128000,
        serverKeepAlive: 1200,
        retainAvailable: true,
        wildcardSubscriptionsAvailable: true,
        subscriptionIdentifiersAvailable: true,
        sharedSubscriptionsAvailable: true,
        rejoinedSession: connack.sessionPresent,
        clientId: "derp"
    };
}