
/**
 * @packageDocumentation
 * @module mqtt5
 */

import * as mqtt from "mqtt";
import * as mqtt5_packet from "../common/mqtt5_packet";
import { ClientSessionBehavior, NegotiatedSettings } from "../common/mqtt5";
import { Mqtt5ClientConfig } from "./mqtt5";

export const MAXIMUM_VARIABLE_LENGTH_INTEGER : number= 268435455;
export const MAXIMUM_PACKET_SIZE : number = 5 + MAXIMUM_VARIABLE_LENGTH_INTEGER;
export const DEFAULT_RECEIVE_MAXIMUM : number = 65535;
export const DEFAULT_KEEP_ALIVE : number = 1200;
export const DEFAULT_CONNACK_TIMEOUT_MS : number = 30000;
export const DEFAULT_MIN_RECONNECT_DELAY_MS : number = 1000;
export const DEFAULT_MAX_RECONNECT_DELAY_MS : number = 120000;
export const DEFAULT_MIN_CONNECTED_TIME_TO_RESET_RECONNECT_DELAY_MS : number = 30000;

/** @internal */
function set_defined_property(object: any, propertyName: string, value: any) : boolean {
    if (value === undefined) {
        return false;
    }

    object[propertyName] = value;

    return true;
}

/** @internal */
export function transform_mqtt_js_connack_to_crt_connack(mqtt_js_connack: mqtt.IConnackPacket) : mqtt5_packet.ConnackPacket {
    let connack : mqtt5_packet.ConnackPacket =  {
        type: mqtt5_packet.PacketType.Connack,
        sessionPresent: mqtt_js_connack.sessionPresent,
        reasonCode : mqtt_js_connack.reasonCode ?? mqtt5_packet.ConnectReasonCode.Success
    };

    set_defined_property(connack, "sessionExpiryInterval", mqtt_js_connack.properties?.sessionExpiryInterval);
    set_defined_property(connack, "receiveMaximum", mqtt_js_connack.properties?.receiveMaximum);
    set_defined_property(connack, "maximumQos", mqtt_js_connack.properties?.maximumQoS);
    set_defined_property(connack, "retainAvailable", mqtt_js_connack.properties?.retainAvailable);
    set_defined_property(connack, "maximumPacketSize", mqtt_js_connack.properties?.maximumPacketSize);
    set_defined_property(connack, "assignedClientIdentifier", mqtt_js_connack.properties?.assignedClientIdentifier);
    set_defined_property(connack, "topicAliasMaximum", mqtt_js_connack.properties?.topicAliasMaximum);
    set_defined_property(connack, "reasonString", mqtt_js_connack.properties?.reasonString);
    set_defined_property(connack, "userProperties", transform_mqtt_js_user_properties_to_crt_user_properties(mqtt_js_connack.properties?.userProperties));
    set_defined_property(connack, "wildcardSubscriptionsAvailable", mqtt_js_connack.properties?.wildcardSubscriptionAvailable);
    set_defined_property(connack, "subscriptionIdentifiersAvailable", mqtt_js_connack.properties?.subscriptionIdentifiersAvailable);
    set_defined_property(connack, "sharedSubscriptionsAvailable", mqtt_js_connack.properties?.sharedSubscriptionAvailable);
    set_defined_property(connack, "serverKeepAlive", mqtt_js_connack.properties?.serverKeepAlive);
    set_defined_property(connack, "responseInformation", mqtt_js_connack.properties?.responseInformation);
    set_defined_property(connack, "serverReference", mqtt_js_connack.properties?.serverReference);

    return connack;
}

/** @internal */
export function create_negotiated_settings(config : Mqtt5ClientConfig, connack: mqtt5_packet.ConnackPacket) : NegotiatedSettings {
    return {
        maximumQos: connack.maximumQos ?? mqtt5_packet.QoS.ExactlyOnce,
        sessionExpiryInterval: connack.sessionExpiryInterval ?? config.connectProperties?.sessionExpiryIntervalSeconds ?? 0,
        receiveMaximumFromServer: connack.receiveMaximum ?? DEFAULT_RECEIVE_MAXIMUM,
        maximumPacketSizeToServer: connack.maximumPacketSize ?? MAXIMUM_PACKET_SIZE,
        serverKeepAlive: connack.serverKeepAlive ?? config.connectProperties?.keepAliveIntervalSeconds ?? DEFAULT_KEEP_ALIVE,
        retainAvailable: connack.retainAvailable ?? true,
        wildcardSubscriptionsAvailable: connack.wildcardSubscriptionsAvailable ?? true,
        subscriptionIdentifiersAvailable: connack.subscriptionIdentifiersAvailable ?? true,
        sharedSubscriptionsAvailable: connack.sharedSubscriptionsAvailable ?? true,
        rejoinedSession: connack.sessionPresent,
        clientId: connack.assignedClientIdentifier ?? config.connectProperties?.clientId ?? ""
    };
}

/** @internal */
function create_mqtt_js_will_from_crt_config(connectProperties? : mqtt5_packet.ConnectPacket) : any {
    if (connectProperties === undefined || connectProperties.will == undefined) {
        return undefined;
    }

    let crtWill : mqtt5_packet.PublishPacket = connectProperties.will;

    let hasWillProperties : boolean = false;
    let willProperties : any = {};
    hasWillProperties = set_defined_property(willProperties, "willDelayInterval", connectProperties.willDelayIntervalSeconds) || hasWillProperties;
    if (crtWill.payloadFormat !== undefined) {
        hasWillProperties = set_defined_property(willProperties, "payloadFormatIndicator", crtWill.payloadFormat == mqtt5_packet.PayloadFormatIndicator.Utf8) || hasWillProperties;
    }
    hasWillProperties = set_defined_property(willProperties, "messageExpiryInterval", crtWill.messageExpiryIntervalSeconds) || hasWillProperties;
    hasWillProperties = set_defined_property(willProperties, "contentType", crtWill.contentType) || hasWillProperties;
    hasWillProperties = set_defined_property(willProperties, "responseTopic", crtWill.responseTopic) || hasWillProperties;
    hasWillProperties = set_defined_property(willProperties, "correlationData", crtWill.correlationData) || hasWillProperties;
    hasWillProperties = set_defined_property(willProperties, "userProperties", transform_crt_user_properties_to_mqtt_js_user_properties(crtWill.userProperties)) || hasWillProperties;

    let will : any = {
        topic: crtWill.topicName,
        payload: crtWill.payload ?? "",
        qos: crtWill.qos,
        retain: crtWill.retain ?? false
    };

    if (hasWillProperties) {
        will["properties"] = willProperties;
    }

    return will;
}

/** @internal */
export function getOrderedReconnectDelayBounds(configMin?: number, configMax?: number) : [number, number] {
    const minDelay : number = Math.max(1, configMin ?? DEFAULT_MIN_RECONNECT_DELAY_MS);
    const maxDelay : number = Math.max(1, configMax ?? DEFAULT_MAX_RECONNECT_DELAY_MS);
    if (minDelay > maxDelay) {
        return [maxDelay, minDelay];
    } else {
        return [minDelay, maxDelay];
    }
}

/** @internal */
function should_mqtt_js_use_clean_start(session_behavior? : ClientSessionBehavior) : boolean {
    return session_behavior !== ClientSessionBehavior.RejoinPostSuccess;
}

/** @internal */
export function compute_mqtt_js_reconnect_delay_from_crt_max_delay(maxReconnectDelayMs : number) : number {
    /*
     * This is an attempt to guarantee that the mqtt-js will never try to reconnect on its own and instead always
     * be controlled by our reconnection scheduler logic.
     */
    return maxReconnectDelayMs * 2 + 60000;
}

/** @internal */
export function create_mqtt_js_client_config_from_crt_client_config(crtConfig : Mqtt5ClientConfig) : mqtt.IClientOptions {

    let [_, maxDelay] = getOrderedReconnectDelayBounds(crtConfig.minReconnectDelayMs, crtConfig.maxReconnectDelayMs);

    maxDelay = compute_mqtt_js_reconnect_delay_from_crt_max_delay(maxDelay);

    let mqttJsClientConfig : mqtt.IClientOptions = {
        protocolVersion: 5,
        keepalive: crtConfig.connectProperties?.keepAliveIntervalSeconds ?? DEFAULT_KEEP_ALIVE,
        connectTimeout: crtConfig.connackTimeoutMs ?? DEFAULT_CONNACK_TIMEOUT_MS,
        clean: should_mqtt_js_use_clean_start(crtConfig.sessionBehavior),
        reconnectPeriod: maxDelay,
        queueQoSZero : false,
        // @ts-ignore
        autoUseTopicAlias : false,
        // @ts-ignore
        autoAssignTopicAlias : false,
        transformWsUrl: undefined, /* TODO */
        resubscribe : false
    };

    set_defined_property(mqttJsClientConfig, "clientId", crtConfig.connectProperties?.clientId);
    set_defined_property(mqttJsClientConfig, "username", crtConfig.connectProperties?.username);
    set_defined_property(mqttJsClientConfig, "password", crtConfig.connectProperties?.password);
    set_defined_property(mqttJsClientConfig, "will", create_mqtt_js_will_from_crt_config(crtConfig.connectProperties));

    let hasProperties : boolean = false;
    let properties: any = {};
    hasProperties = set_defined_property(properties, "sessionExpiryInterval", crtConfig.connectProperties?.sessionExpiryIntervalSeconds) || hasProperties;
    hasProperties = set_defined_property(properties, "receiveMaximum", crtConfig.connectProperties?.receiveMaximum) || hasProperties;
    hasProperties = set_defined_property(properties, "maximumPacketSize", crtConfig.connectProperties?.maximumPacketSizeBytes) || hasProperties;
    hasProperties = set_defined_property(properties, "requestResponseInformation", crtConfig.connectProperties?.requestResponseInformation) || hasProperties;
    hasProperties = set_defined_property(properties, "requestProblemInformation", crtConfig.connectProperties?.requestProblemInformation) || hasProperties;
    hasProperties = set_defined_property(properties, "userProperties", transform_crt_user_properties_to_mqtt_js_user_properties(crtConfig.connectProperties?.userProperties)) || hasProperties;

    if (hasProperties) {
        mqttJsClientConfig["properties"] = properties;
    }

    return mqttJsClientConfig;
}

/** @internal */
export function transform_crt_user_properties_to_mqtt_js_user_properties(userProperties?: mqtt5_packet.UserProperty[]) : mqtt.UserProperties | undefined {
    if (userProperties == undefined) {
        return undefined;
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
export function transform_mqtt_js_user_properties_to_crt_user_properties(userProperties?: mqtt.UserProperties) : mqtt5_packet.UserProperty[] | undefined {
    if (userProperties === undefined) {
        return undefined;
    }

    let crtProperties : mqtt5_packet.UserProperty[] | undefined = undefined;

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

/** @internal */
export function transform_crt_disconnect_to_mqtt_js_disconnect(disconnect: mqtt5_packet.DisconnectPacket) : mqtt.IDisconnectPacket {

    let properties = {};
    let propertiesValid : boolean = false;

    propertiesValid = set_defined_property(properties, "sessionExpiryInterval", disconnect.sessionExpiryIntervalSeconds) || propertiesValid;
    propertiesValid = set_defined_property(properties, "reasonString", disconnect.reasonString) || propertiesValid;
    propertiesValid = set_defined_property(properties, "userProperties", transform_crt_user_properties_to_mqtt_js_user_properties(disconnect.userProperties)) || propertiesValid;
    propertiesValid = set_defined_property(properties, "serverReference", disconnect.serverReference) || propertiesValid;

    let mqttJsDisconnect : mqtt.IDisconnectPacket = {
        cmd: 'disconnect',
        reasonCode : disconnect.reasonCode
    };

    if (propertiesValid) {
        mqttJsDisconnect["properties"] = properties;
    }

    return mqttJsDisconnect;
}

/** @internal **/
export function transform_mqtt_js_disconnect_to_crt_disconnect(disconnect: mqtt.IDisconnectPacket) : mqtt5_packet.DisconnectPacket {

    let crtDisconnect : mqtt5_packet.DisconnectPacket = {
        type: mqtt5_packet.PacketType.Disconnect,
        reasonCode : disconnect.reasonCode ?? mqtt5_packet.DisconnectReasonCode.NormalDisconnection
    };

    set_defined_property(crtDisconnect, "sessionExpiryIntervalSeconds", disconnect.properties?.sessionExpiryInterval);
    set_defined_property(crtDisconnect, "reasonString", disconnect.properties?.reasonString);
    set_defined_property(crtDisconnect, "userProperties", transform_mqtt_js_user_properties_to_crt_user_properties(disconnect.properties?.userProperties));
    set_defined_property(crtDisconnect, "serverReference", disconnect.properties?.serverReference);

    return crtDisconnect;
}

/** @internal **/
export function transform_crt_subscribe_to_mqtt_js_subscription_map(subscribe: mqtt5_packet.SubscribePacket) : mqtt.ISubscriptionMap {

    let subscriptionMap : mqtt.ISubscriptionMap = {};

    for (const subscription of subscribe.subscriptions) {
        let mqttJsSub = {
            qos: subscription.qos,
            nl : subscription.noLocal ?? false,
            rap: subscription.retainAsPublished ?? false,
            rh: subscription.retainHandlingType ?? mqtt5_packet.RetainHandlingType.SendOnSubscribe
        };

        subscriptionMap[subscription.topicFilter] = mqttJsSub;
    }

    return subscriptionMap;
}

/** @internal **/
export function transform_crt_subscribe_to_mqtt_js_subscribe_options(subscribe: mqtt5_packet.SubscribePacket) : mqtt.IClientSubscribeOptions {

    let properties = {};
    let propertiesValid : boolean = false;

    propertiesValid = set_defined_property(properties, "subscriptionIdentifier", subscribe.subscriptionIdentifier) || propertiesValid;
    propertiesValid = set_defined_property(properties, "userProperties", transform_crt_user_properties_to_mqtt_js_user_properties(subscribe.userProperties)) || propertiesValid;

    let options : mqtt.IClientSubscribeOptions = {
        qos: 0
    }

    if (propertiesValid) {
        options["properties"] = properties;
    }

    return options;
}

/** @internal **/
export function transform_mqtt_js_subscription_grants_to_crt_suback(subscriptionsGranted: mqtt.ISubscriptionGrant[]) : mqtt5_packet.SubackPacket {

    let crtSuback : mqtt5_packet.SubackPacket = {
        type: mqtt5_packet.PacketType.Suback,
        reasonCodes : subscriptionsGranted.map((subscription: mqtt.ISubscriptionGrant, index: number, array : mqtt.ISubscriptionGrant[]) : mqtt5_packet.SubackReasonCode => { return subscription.qos; })
    }

    /*
     * TODO: mqtt-js does not expose the suback packet to subscribe's completion callback, so we cannot extract
     * reasonString and userProperties atm.
     *
     * Revisit if this changes.
     */


    return crtSuback;
}

/** @internal */
export function transform_crt_publish_to_mqtt_js_publish_options(publish: mqtt5_packet.PublishPacket) : mqtt.IClientPublishOptions {

    let properties = {};
    let propertiesValid : boolean = false;

    if (publish.payloadFormat !== undefined) {
        propertiesValid = set_defined_property(properties, "payloadFormatIndicator", publish.payloadFormat == mqtt5_packet.PayloadFormatIndicator.Utf8) || propertiesValid;
    }
    propertiesValid = set_defined_property(properties, "messageExpiryInterval", publish.messageExpiryIntervalSeconds) || propertiesValid;
    propertiesValid = set_defined_property(properties, "responseTopic", publish.responseTopic) || propertiesValid;
    propertiesValid = set_defined_property(properties, "correlationData", publish.correlationData) || propertiesValid;
    propertiesValid = set_defined_property(properties, "userProperties", transform_crt_user_properties_to_mqtt_js_user_properties(publish.userProperties)) || propertiesValid;
    propertiesValid = set_defined_property(properties, "contentType", publish.contentType) || propertiesValid;

    let mqttJsPublish : mqtt.IClientPublishOptions = {
        qos: publish.qos,
        retain: publish.retain ?? false,
    };

    if (propertiesValid) {
        mqttJsPublish["properties"] = properties;
    }

    return mqttJsPublish;
}

/** @internal **/
export function transform_mqtt_js_publish_to_crt_publish(publish: mqtt.IPublishPacket) : mqtt5_packet.PublishPacket {

    let crtPublish : mqtt5_packet.PublishPacket = {
        type: mqtt5_packet.PacketType.Publish,
        qos: publish.qos,
        retain: publish.retain,
        topicName: publish.topic,
        payload: publish.payload
    };

    if (publish.properties !== undefined) {
        if (publish.properties.payloadFormatIndicator !== undefined) {
            set_defined_property(crtPublish, "payloadFormat", publish.properties.payloadFormatIndicator ? mqtt5_packet.PayloadFormatIndicator.Utf8 : mqtt5_packet.PayloadFormatIndicator.Bytes);
        }
        set_defined_property(crtPublish, "messageExpiryIntervalSeconds", publish.properties?.messageExpiryInterval);
        set_defined_property(crtPublish, "responseTopic", publish.properties?.responseTopic);
        set_defined_property(crtPublish, "correlationData", publish.properties?.correlationData);
        set_defined_property(crtPublish, "userProperties", transform_mqtt_js_user_properties_to_crt_user_properties(publish.properties?.userProperties));
        set_defined_property(crtPublish, "contentType", publish.properties?.contentType);

        let subIds : number | number[] | undefined = publish.properties?.subscriptionIdentifier;
        let subIdsType : string = typeof subIds;
        if (subIds !== undefined) {
            if (subIdsType == 'number') {
                crtPublish["subscriptionIdentifiers"] = [subIds];
            } else if (Array.isArray(subIds)) {
                crtPublish["subscriptionIdentifiers"] = subIds;
            }
        }
    }

    return crtPublish;
}

/** @internal **/
export function transform_mqtt_js_puback_to_crt_puback(puback: mqtt.IPubackPacket) : mqtt5_packet.PubackPacket {

    let crtPuback : mqtt5_packet.PubackPacket = {
        type: mqtt5_packet.PacketType.Puback,
        reasonCode: puback.reasonCode ?? mqtt5_packet.PubackReasonCode.Success,
    };

    if (puback.properties !== undefined) {
        set_defined_property(crtPuback, "reasonString", puback.properties?.reasonString);
        set_defined_property(crtPuback, "userProperties", transform_mqtt_js_user_properties_to_crt_user_properties(puback.properties?.userProperties));
    }

    return crtPuback;
}

/** @internal **/
export function transform_crt_unsubscribe_to_mqtt_js_unsubscribe_options(unsubscribe: mqtt5_packet.UnsubscribePacket) : Object {

    let properties = {};
    let propertiesValid : boolean = false;

    propertiesValid = set_defined_property(properties, "userProperties", transform_crt_user_properties_to_mqtt_js_user_properties(unsubscribe.userProperties));

    let options : any = {};

    if (propertiesValid) {
        options["properties"] = properties;
    }

    return options;
}

/** @internal **/
export function transform_mqtt_js_unsuback_to_crt_unsuback(packet: mqtt.IUnsubackPacket) : mqtt5_packet.UnsubackPacket {

    let reasonCodes : number | number[] | undefined = packet.reasonCode;

    let codes : number[];
    if (Array.isArray(reasonCodes)) {
        codes = reasonCodes;
    } else if (typeof reasonCodes == 'number') {
        codes = [reasonCodes];
    } else {
        codes = [];
    }

    let crtUnsuback : mqtt5_packet.UnsubackPacket = {
        type: mqtt5_packet.PacketType.Unsuback,
        reasonCodes : codes
    }

    if (packet.properties !== undefined) {
        set_defined_property(crtUnsuback, "reasonString", packet.properties?.reasonString);
        set_defined_property(crtUnsuback, "userProperties", transform_mqtt_js_user_properties_to_crt_user_properties(packet.properties?.userProperties));
    }

    return crtUnsuback;
}
