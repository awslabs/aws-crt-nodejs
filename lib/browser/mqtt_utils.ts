
/**
 * @packageDocumentation
 * @module mqtt5
 */

import * as mqtt from "mqtt";
import {ConnackPacket, ConnectReasonCode, QoS, ConnectPacket, UserProperty, PublishPacket} from "../common/mqtt5_packet";
import {ClientSessionBehavior, NegotiatedSettings} from "../common/mqtt5";
import {Mqtt5ClientConfig} from "./mqtt5";

const MAXIMUM_VARIABLE_LENGTH_INTEGER : number= 268435455;
const MAXIMUM_PACKET_SIZE : number = 5 + MAXIMUM_VARIABLE_LENGTH_INTEGER;
const DEFAULT_RECEIVE_MAXIMUM : number = 65535;

/** @internal */
function set_defined_property(object: any, propertyName: string, value: any) {
    if (value === undefined) {
        return;
    }

    object[propertyName] = value;
}

/** @internal */
export function transform_mqtt_js_connack_to_crt_connack(mqtt_js_connack: mqtt.IConnackPacket) : ConnackPacket {
    let connack : ConnackPacket =  {
        sessionPresent: mqtt_js_connack.sessionPresent,
        reasonCode : mqtt_js_connack.reasonCode ?? ConnectReasonCode.Success
    };

    set_defined_property(connack, "sessionExpiryInterval", mqtt_js_connack.properties?.sessionExpiryInterval ?? undefined);
    set_defined_property(connack, "receiveMaximum", mqtt_js_connack.properties?.receiveMaximum ?? undefined);
    set_defined_property(connack, "maximumQos", mqtt_js_connack.properties?.maximumQoS ?? undefined);
    set_defined_property(connack, "retainAvailable", mqtt_js_connack.properties?.retainAvailable ?? undefined);
    set_defined_property(connack, "maximumPacketSize", mqtt_js_connack.properties?.maximumPacketSize ?? undefined);
    set_defined_property(connack, "assignedClientIdentifier", mqtt_js_connack.properties?.assignedClientIdentifier ?? undefined);
    set_defined_property(connack, "topicAliasMaximum", mqtt_js_connack.properties?.topicAliasMaximum ?? undefined);
    set_defined_property(connack, "reasonString", mqtt_js_connack.properties?.reasonString ?? undefined);
    set_defined_property(connack, "userProperties", transform_mqtt_js_user_properties_to_crt_user_properties(mqtt_js_connack.properties?.userProperties));
    set_defined_property(connack, "wildcardSubscriptionsAvailable", mqtt_js_connack.properties?.wildcardSubscriptionAvailable ?? undefined);
    set_defined_property(connack, "subscriptionIdentifiersAvailable", mqtt_js_connack.properties?.subscriptionIdentifiersAvailable ?? undefined);
    set_defined_property(connack, "sharedSubscriptionsAvailable", mqtt_js_connack.properties?.sharedSubscriptionAvailable ?? undefined);
    set_defined_property(connack, "serverKeepAlive", mqtt_js_connack.properties?.serverKeepAlive ?? undefined);
    set_defined_property(connack, "responseInformation", mqtt_js_connack.properties?.responseInformation ?? undefined);
    set_defined_property(connack, "serverReference", mqtt_js_connack.properties?.serverReference ?? undefined);

    return connack;
}

/** @internal */
export function create_negotiated_settings(config : Mqtt5ClientConfig, connack: ConnackPacket) : NegotiatedSettings {
    return {
        maximumQos: connack.maximumQos?.valueOf() ?? QoS.ExactlyOnce,
        sessionExpiryInterval: connack.sessionExpiryInterval?.valueOf() ?? config.connectProperties?.sessionExpiryIntervalSeconds ?? 0,
        receiveMaximumFromServer: connack.receiveMaximum?.valueOf() ?? DEFAULT_RECEIVE_MAXIMUM,
        maximumPacketSizeToServer: connack.maximumPacketSize?.valueOf() ?? MAXIMUM_PACKET_SIZE,
        serverKeepAlive: connack.serverKeepAlive?.valueOf() ?? config.connectProperties?.keepAliveIntervalSeconds ?? 1200,
        retainAvailable: connack.retainAvailable?.valueOf() ?? true,
        wildcardSubscriptionsAvailable: connack.wildcardSubscriptionsAvailable?.valueOf() ?? true,
        subscriptionIdentifiersAvailable: connack.subscriptionIdentifiersAvailable?.valueOf() ?? true,
        sharedSubscriptionsAvailable: connack.sharedSubscriptionsAvailable?.valueOf() ?? true,
        rejoinedSession: connack.sessionPresent,
        clientId: connack.assignedClientIdentifier ?? config.connectProperties?.clientId ?? ""
    };
}

/** @internal */
export function create_mqtt_js_will_from_crt_config(connectProperties? : ConnectPacket) : any {
    if (connectProperties === undefined || connectProperties.will == undefined) {
        return undefined;
    }

    let crtWill : PublishPacket = connectProperties.will;

    return {
        topic: crtWill.topicName,
        payload: crtWill.payload,
        qos: crtWill.qos,
        retain: crtWill.retain,
        properties: {
            willDelayInterval: connectProperties.willDelayIntervalSeconds,
            payloadFormatIndicator: crtWill.payloadFormat,
            messageExpiryInterval: crtWill.messageExpiryIntervalSeconds,
            contentType: crtWill.contentType,
            responseTopic: crtWill.responseTopic,
            correlationData: crtWill.correlationData,
            userProperties: transform_crt_user_properties_to_mqtt_js_user_properties(crtWill.userProperties)
        }
    };
}

/** @internal */
export function create_mqtt_js_client_config_from_crt_client_config(crtConfig : Mqtt5ClientConfig) : mqtt.IClientOptions {
    return {
        keepalive: crtConfig.connectProperties?.keepAliveIntervalSeconds ?? 1200,
        clientId: crtConfig.connectProperties?.clientId ?? '',
        connectTimeout: crtConfig.connackTimeoutMs ?? 30 * 1000,
        clean: crtConfig.sessionBehavior == ClientSessionBehavior.Clean,
        reconnectPeriod: crtConfig.maxReconnectDelayMs ?? 120000,
        username: crtConfig.connectProperties?.username,
        // @ts-ignore
        password: crtConfig.connectProperties?.password ?? undefined,
        queueQoSZero : false,
        // @ts-ignore
        autoUseTopicAlias : false,
        // @ts-ignore
        autoAssignTopicAlias : false,
        properties : {
            sessionExpiryInterval : crtConfig.connectProperties?.sessionExpiryIntervalSeconds,
            receiveMaximum : crtConfig.connectProperties?.receiveMaximum,
            maximumPacketSize : crtConfig.connectProperties?.maximumPacketSizeBytes,
            requestResponseInformation : crtConfig.connectProperties?.requestResponseInformation?.valueOf() ?? undefined,
            requestProblemInformation : crtConfig.connectProperties?.requestProblemInformation?.valueOf() ?? undefined,
            userProperties : transform_crt_user_properties_to_mqtt_js_user_properties(crtConfig.connectProperties?.userProperties)
        },
        will: create_mqtt_js_will_from_crt_config(crtConfig.connectProperties),
        transformWsUrl: undefined, /* TODO */
        resubscribe : false
    };
}

/** @internal */
export function transform_crt_user_properties_to_mqtt_js_user_properties(userProperties?: UserProperty[]) : mqtt.UserProperties {
    if (userProperties == null) {
        return {};
    }

    /*
     * More restricted version of mqtt.UserProperties so that we can have type-checking but don't need to handle
     * the non-array case.
     */
    let mqttJsProperties : {[key : string] : string[] } = {};

    for (const property of userProperties) {
        const key : string = property.name;
        if (!(key in mqttJsProperties)) {
            mqttJsProperties[key] = [];
        }
        mqttJsProperties[key].push(property.value);
    }

    return mqttJsProperties;
}

/** @internal */
export function transform_mqtt_js_user_properties_to_crt_user_properties(userProperties?: mqtt.UserProperties) : [UserProperty] | undefined {
    if (userProperties === undefined) {
        return undefined;
    }

    let crtProperties : [UserProperty] | undefined = undefined;

    for (const [propName, propValue] of Object.entries(userProperties)) {

        let values : string[] = (typeof propValue === 'string') ? [propValue] : propValue;
        for (const valueIter of values) {
            let propertyEntry = {name : propName, value : valueIter};
            if (crtProperties === undefined) {
                crtProperties = [propertyEntry];
            } else {
                crtProperties.push(propertyEntry);
            }
        }
    }

    return crtProperties;
}