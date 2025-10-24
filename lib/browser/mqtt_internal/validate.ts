/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as mqtt5_common from "../../common/mqtt5";
import * as mqtt_shared from '../../common/mqtt_shared';
import * as model from "./model";

/**
 * This module contains three validation suites needed by the client implementation:
 *
 * 1. Validation of user-submitted outbound packets at submission time.  This checks all public fields for valid
 *    types, values, and ranges.
 * 2. Validation of internal outbound packets prior to encoding.  This checks constraints on internally managed fields
 *    like packetId.  It also checks constraints that can change across separate connection (maximum qos, for example).
 * 3. Protocol-error validation of inbound packets from the server.  This primarily checks protocol constraints
 *    and enumerated values.  We don't validate against negotiated settings because the server breaking that contract
 *    isn't really a fatal flaw.  In that case, it's better to be forgiving.
 *
 * Validation differs slightly based on what protocol level is being used (primarily reason codes).  It is not
 * considered a validation error to have 5-only fields set while operating in 311; the additional fields are just
 * ignored.
 *
 * Validation failure is indicated by throwing a CrtError.
 *
 * There are a few validation checks that are done outside this module.  Validation of binary properties that
 * are lost on decoding (certain bits not set) is done in the decoder.  Validation of maximum packet size constraints
 * is done in the encoder (NYI though).
 *
 * We also skip validation of certain fields that are not relevant in the particular use case.  For example, we don't
 * validate subscription identifiers on outbound publishes because that field is ignored when converting the
 * submitted packet into the internal model.
 */

// Exported Internal API

export function validate_user_submitted_outbound_packet(packet: mqtt5_packet.IPacket, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
    switch(packet.type) {
        case mqtt5_packet.PacketType.Publish:
            validate_user_submitted_publish(packet as mqtt5_packet.PublishPacket, mode, settings);
            break;

        case mqtt5_packet.PacketType.Subscribe:
            validate_user_submitted_subscribe(packet as mqtt5_packet.SubscribePacket, mode, settings);
            break;

        case mqtt5_packet.PacketType.Unsubscribe:
            validate_user_submitted_unsubscribe(packet as mqtt5_packet.UnsubscribePacket, mode, settings);
            break;

        case mqtt5_packet.PacketType.Disconnect:
            validate_user_submitted_disconnect(packet as mqtt5_packet.DisconnectPacket, mode, settings);
            break;

        default:
            break;
    }
}

export function validate_binary_outbound_packet(packet: model.IPacketBinary, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
    switch(packet.type) {
        case mqtt5_packet.PacketType.Publish:
            validate_binary_publish(packet as model.PublishPacketBinary, mode, settings);
            break;

        case mqtt5_packet.PacketType.Subscribe:
            validate_binary_subscribe(packet as model.SubscribePacketBinary, mode, settings);
            break;

        case mqtt5_packet.PacketType.Unsubscribe:
            validate_binary_unsubscribe(packet as model.UnsubscribePacketBinary, mode, settings);
            break;

        case mqtt5_packet.PacketType.Disconnect:
            validate_binary_disconnect(packet as model.DisconnectPacketBinary, mode, settings);
            break;

        case mqtt5_packet.PacketType.Connect:
            validate_binary_connect(packet as model.ConnectPacketBinary, mode, settings);
            break;

        case mqtt5_packet.PacketType.Puback:
            validate_binary_puback(packet as model.PubackPacketBinary, mode, settings);
            break;

        default:
            break;
    }
}

export function validate_inbound_packet(packet: mqtt5_packet.IPacket, mode: model.ProtocolMode) {
    switch(packet.type) {
        case mqtt5_packet.PacketType.Publish:
            validate_inbound_publish(packet as model.PublishPacketInternal, mode);
            break;

        case mqtt5_packet.PacketType.Puback:
            validate_inbound_puback(packet as model.PubackPacketInternal, mode);
            break;

        case mqtt5_packet.PacketType.Connack:
            validate_inbound_connack(packet as model.ConnackPacketInternal, mode);
            break;

        case mqtt5_packet.PacketType.Suback:
            validate_inbound_suback(packet as model.SubackPacketInternal, mode);
            break;

        case mqtt5_packet.PacketType.Unsuback:
            validate_inbound_unsuback(packet as model.UnsubackPacketInternal, mode);
            break;

        case mqtt5_packet.PacketType.Disconnect:
            validate_inbound_disconnect(packet as model.DisconnectPacketInternal, mode);
            break;

        default:
            break;
    }
}

// primitive fields

// we don't validate booleans because we use truthiness to map to 0 or 1, so there's no need

function validate_u8(value: number, fieldName: string) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new CrtError(`Field "${fieldName}" with value "${value}" is not a valid u8`);
    }
}

function validate_u16(value: number, fieldName: string) {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new CrtError(`Field "${fieldName}" with value "${value}" is not a valid u16`);
    }
}

function validate_optional_u16(value: number | undefined, fieldName: string) {
    if (value != undefined) {
        validate_u16(value, fieldName);
    }
}

function validate_u32(value: number, fieldName: string) {
    if (!Number.isInteger(value) || value < 0 || value > (256 * 256 * 256 * 256 - 1)) {
        throw new CrtError(`Field "${fieldName}" with value "${value}" is not a valid u32`);
    }
}

function validate_optional_u32(value: number | undefined, fieldName: string) {
    if (value != undefined) {
        validate_u32(value, fieldName);
    }
}

function validate_vli(value: number, fieldName: string) {
    if (!Number.isInteger(value) || value < 0 || value > (128 * 128 * 128 * 128 - 1)) {
        throw new CrtError(`Field "${fieldName}" with value "${value}" cannot be VLI-encoded`);
    }
}

function validate_optional_vli(value: number | undefined, fieldName: string) {
    if (value != undefined) {
        validate_vli(value, fieldName);
    }
}

// we don't validate length here because we don't know encoding length without doing a utf-8 conversion.
// This means we validate string length in the internal validators which checks ArrayBuffer lengths.
function validate_string(value: string, fieldName: string) {
    if ((typeof value === 'string') || (value instanceof String)) {
        return;
    }

    throw new CrtError(`Field "${fieldName}" with value "${value}" is not a valid string`);
}

function validate_optional_string(value: string | undefined, fieldName: string) {
    if (value === undefined) {
        return;
    }

    validate_string(value, fieldName);
}


function validate_16bit_buffer_length(value : ArrayBuffer, fieldName: string) {
    // we don't do typechecking here because this is only used by internal validators which are checking values
    // that we explicitly constructed ourselves when converting to the binary model
    if (value.byteLength > 65535) {
        throw new CrtError(`Field "${fieldName}" is not a 16-bit length buffer`);
    }
}

// enum validation

function validate_suback_reason_code(value: mqtt5_packet.SubackReasonCode, mode: model.ProtocolMode) {
    validate_u8(value, 'reasonCodes');

    if (mode == model.ProtocolMode.Mqtt311) {
        switch(value) {
            case mqtt5_packet.SubackReasonCode.GrantedQoS0:
            case mqtt5_packet.SubackReasonCode.GrantedQoS1:
            case mqtt5_packet.SubackReasonCode.GrantedQoS2:
            case mqtt5_packet.SubackReasonCode.Failure311:
                break;

            default:
                throw new CrtError(`"${value}" is not a valid MQTT311 SubackReasonCode`);
        }
    } else if (mode == model.ProtocolMode.Mqtt5) {
        switch(value) {
            case mqtt5_packet.SubackReasonCode.GrantedQoS0:
            case mqtt5_packet.SubackReasonCode.GrantedQoS1:
            case mqtt5_packet.SubackReasonCode.GrantedQoS2:
            case mqtt5_packet.SubackReasonCode.UnspecifiedError:
            case mqtt5_packet.SubackReasonCode.ImplementationSpecificError:
            case mqtt5_packet.SubackReasonCode.NotAuthorized:
            case mqtt5_packet.SubackReasonCode.TopicFilterInvalid:
            case mqtt5_packet.SubackReasonCode.PacketIdentifierInUse:
            case mqtt5_packet.SubackReasonCode.QuotaExceeded:
            case mqtt5_packet.SubackReasonCode.SharedSubscriptionsNotSupported:
            case mqtt5_packet.SubackReasonCode.SubscriptionIdentifiersNotSupported:
            case mqtt5_packet.SubackReasonCode.WildcardSubscriptionsNotSupported:
                break;

            default:
                throw new CrtError(`"${value}" is not a valid MQTT5 SubackReasonCode`);
        }
    }
}

function validate_puback_reason_code(value: mqtt5_packet.PubackReasonCode, mode: model.ProtocolMode) {
    validate_u8(value, 'reasonCode');
    if (mode == model.ProtocolMode.Mqtt5) {
        switch(value) {
            case mqtt5_packet.PubackReasonCode.Success:
            case mqtt5_packet.PubackReasonCode.NoMatchingSubscribers:
            case mqtt5_packet.PubackReasonCode.UnspecifiedError:
            case mqtt5_packet.PubackReasonCode.ImplementationSpecificError:
            case mqtt5_packet.PubackReasonCode.NotAuthorized:
            case mqtt5_packet.PubackReasonCode.TopicNameInvalid:
            case mqtt5_packet.PubackReasonCode.PacketIdentifierInUse:
            case mqtt5_packet.PubackReasonCode.QuotaExceeded:
            case mqtt5_packet.PubackReasonCode.PayloadFormatInvalid:
                break;

            default:
                throw new CrtError(`"${value}" is not a valid MQTT5 PubackReasonCode`);
        }
    }
}

function validate_unsuback_reason_code(value: mqtt5_packet.UnsubackReasonCode, mode: model.ProtocolMode) {
    validate_u8(value, 'reasonCodes');
    if (mode == model.ProtocolMode.Mqtt5) {
        switch(value) {
            case mqtt5_packet.UnsubackReasonCode.Success:
            case mqtt5_packet.UnsubackReasonCode.NoSubscriptionExisted:
            case mqtt5_packet.UnsubackReasonCode.UnspecifiedError:
            case mqtt5_packet.UnsubackReasonCode.ImplementationSpecificError:
            case mqtt5_packet.UnsubackReasonCode.NotAuthorized:
            case mqtt5_packet.UnsubackReasonCode.TopicFilterInvalid:
            case mqtt5_packet.UnsubackReasonCode.PacketIdentifierInUse:
                break;

            default:
                throw new CrtError(`"${value}" is not a valid MQTT5 UnsubackReasonCode`);
        }
    }
}

function validate_connect_reason_code(value: mqtt5_packet.ConnectReasonCode, mode: model.ProtocolMode) {
    validate_u8(value, 'reasonCode');

    if (mode == model.ProtocolMode.Mqtt311) {
        switch(value) {
            case mqtt5_packet.ConnectReasonCode.Success:
            case mqtt5_packet.ConnectReasonCode.UnacceptableProtocolVersion311:
            case mqtt5_packet.ConnectReasonCode.ClientIdRejected311:
            case mqtt5_packet.ConnectReasonCode.ServerUnavailable311:
            case mqtt5_packet.ConnectReasonCode.InvalidUsernameOrPassword311:
            case mqtt5_packet.ConnectReasonCode.NotAuthorized311:
                break;

            default:
                throw new CrtError(`"${value}" is not a valid MQTT311 ConnectReasonCode`);
        }
    } else if (mode == model.ProtocolMode.Mqtt5) {
        switch(value) {
            case mqtt5_packet.ConnectReasonCode.Success:
            case mqtt5_packet.ConnectReasonCode.UnspecifiedError:
            case mqtt5_packet.ConnectReasonCode.MalformedPacket:
            case mqtt5_packet.ConnectReasonCode.ProtocolError:
            case mqtt5_packet.ConnectReasonCode.ImplementationSpecificError:
            case mqtt5_packet.ConnectReasonCode.UnsupportedProtocolVersion:
            case mqtt5_packet.ConnectReasonCode.ClientIdentifierNotValid:
            case mqtt5_packet.ConnectReasonCode.BadUsernameOrPassword:
            case mqtt5_packet.ConnectReasonCode.NotAuthorized:
            case mqtt5_packet.ConnectReasonCode.ServerUnavailable:
            case mqtt5_packet.ConnectReasonCode.ServerBusy:
            case mqtt5_packet.ConnectReasonCode.Banned:
            case mqtt5_packet.ConnectReasonCode.BadAuthenticationMethod:
            case mqtt5_packet.ConnectReasonCode.TopicNameInvalid:
            case mqtt5_packet.ConnectReasonCode.PacketTooLarge:
            case mqtt5_packet.ConnectReasonCode.QuotaExceeded:
            case mqtt5_packet.ConnectReasonCode.PayloadFormatInvalid:
            case mqtt5_packet.ConnectReasonCode.RetainNotSupported:
            case mqtt5_packet.ConnectReasonCode.QosNotSupported:
            case mqtt5_packet.ConnectReasonCode.UseAnotherServer:
            case mqtt5_packet.ConnectReasonCode.ServerMoved:
            case mqtt5_packet.ConnectReasonCode.ConnectionRateExceeded:
                break;

            default:
                throw new CrtError(`"${value}" is not a valid MQTT5 ConnectReasonCode`);
        }
    }

}

function validate_disconnect_reason_code(value: mqtt5_packet.DisconnectReasonCode, mode: model.ProtocolMode) {
    validate_u8(value, 'reasonCode');
    if (mode == model.ProtocolMode.Mqtt5) {
        switch(value) {
            case mqtt5_packet.DisconnectReasonCode.NormalDisconnection:
            case mqtt5_packet.DisconnectReasonCode.DisconnectWithWillMessage:
            case mqtt5_packet.DisconnectReasonCode.UnspecifiedError:
            case mqtt5_packet.DisconnectReasonCode.MalformedPacket:
            case mqtt5_packet.DisconnectReasonCode.ProtocolError:
            case mqtt5_packet.DisconnectReasonCode.ImplementationSpecificError:
            case mqtt5_packet.DisconnectReasonCode.NotAuthorized:
            case mqtt5_packet.DisconnectReasonCode.ServerBusy:
            case mqtt5_packet.DisconnectReasonCode.ServerShuttingDown:
            case mqtt5_packet.DisconnectReasonCode.KeepAliveTimeout:
            case mqtt5_packet.DisconnectReasonCode.SessionTakenOver:
            case mqtt5_packet.DisconnectReasonCode.TopicFilterInvalid:
            case mqtt5_packet.DisconnectReasonCode.TopicNameInvalid:
            case mqtt5_packet.DisconnectReasonCode.ReceiveMaximumExceeded:
            case mqtt5_packet.DisconnectReasonCode.TopicAliasInvalid:
            case mqtt5_packet.DisconnectReasonCode.PacketTooLarge:
            case mqtt5_packet.DisconnectReasonCode.MessageRateTooHigh:
            case mqtt5_packet.DisconnectReasonCode.QuotaExceeded:
            case mqtt5_packet.DisconnectReasonCode.AdministrativeAction:
            case mqtt5_packet.DisconnectReasonCode.PayloadFormatInvalid:
            case mqtt5_packet.DisconnectReasonCode.RetainNotSupported:
            case mqtt5_packet.DisconnectReasonCode.QosNotSupported:
            case mqtt5_packet.DisconnectReasonCode.UseAnotherServer:
            case mqtt5_packet.DisconnectReasonCode.ServerMoved:
            case mqtt5_packet.DisconnectReasonCode.SharedSubscriptionsNotSupported:
            case mqtt5_packet.DisconnectReasonCode.ConnectionRateExceeded:
            case mqtt5_packet.DisconnectReasonCode.MaximumConnectTime:
            case mqtt5_packet.DisconnectReasonCode.SubscriptionIdentifiersNotSupported:
            case mqtt5_packet.DisconnectReasonCode.WildcardSubscriptionsNotSupported:
                break;

            default:
                throw new CrtError(`"${value}" is not a valid MQTT5 DisconnectReasonCode`);
        }
    }
}

function validate_qos(qos: mqtt5_packet.QoS) {
    validate_u8(qos, 'QoS');
    switch (qos) {
        case mqtt5_packet.QoS.AtLeastOnce:
        case mqtt5_packet.QoS.AtMostOnce:
        case mqtt5_packet.QoS.ExactlyOnce:
            break;

        default:
            throw new CrtError(`"${qos}" is not a valid QualityOfService`);
    }
}

function validate_optional_payload_format(payloadFormat: mqtt5_packet.PayloadFormatIndicator | undefined, fieldName: string) {
    if (payloadFormat === undefined) {
        return;
    }

    validate_u8(payloadFormat, fieldName);
    switch (payloadFormat) {
        case mqtt5_packet.PayloadFormatIndicator.Bytes:
        case mqtt5_packet.PayloadFormatIndicator.Utf8:
            break;

        default:
            throw new CrtError(`Field "${fieldName}" with value "${payloadFormat}" is not a valid PayloadFormatIndicator`);
    }
}

function validate_optional_retain_handling_type(retainHandling: mqtt5_packet.RetainHandlingType | undefined, fieldName: string) {
    if (retainHandling === undefined) {
        return;
    }

    validate_u8(retainHandling, fieldName);
    switch (retainHandling) {
        case mqtt5_packet.RetainHandlingType.SendOnSubscribe:
        case mqtt5_packet.RetainHandlingType.SendOnSubscribeIfNew:
        case mqtt5_packet.RetainHandlingType.DontSend:
            break;

        default:
            throw new CrtError(`Field "${fieldName}" with value "${retainHandling}" is not a valid RetainHandlingType`);
    }
}

// misc validation utilities

function validate_user_properties(userProperties: Array<mqtt5_packet.UserProperty> | undefined) {
    if (!userProperties) {
        return;
    }

    for (let userProperty of userProperties) {
        validate_string(userProperty.name, 'UserProperty.name');
        validate_string(userProperty.value, 'UserProperty.value');
    }
}

function validate_payload(payload: mqtt5_packet.Payload | undefined) {
    if (!payload) {
        return;
    }

    if (!model.is_valid_payload(payload)) {
        throw new CrtError("Invalid payload value");
    }
}

function validate_binary_data(value: mqtt5_packet.BinaryData, fieldName: string) {
    if (!model.is_valid_binary_data(value)) {
        throw new CrtError(`Field ${fieldName} is not valid binary data`);
    }
}

function validate_optional_binary_data(value: mqtt5_packet.BinaryData | undefined, fieldName: string) {
    if (!value) {
        return;
    }

    return validate_binary_data(value, fieldName);
}

function validate_topic(value: string, fieldName:string) {
    validate_string(value, fieldName);
    if (!mqtt_shared.isValidTopic(value)) {
        throw new CrtError(`value "${value}" of field "${fieldName}" is not a valid topic`);
    }
}

function validate_optional_topic(value: string | undefined, fieldName:string) {
    if (value == undefined) {
        return;
    }

    validate_topic(value, fieldName);
}

function validate_topic_filter(value: string, fieldName:string) {
    validate_string(value, fieldName);
    if (!mqtt_shared.isValidTopicFilter(value)) {
        throw new CrtError(`value "${value}" of field "${fieldName}" is not a valid topic filter`);
    }
}

// user-submitted outbound packet validators

function validate_user_submitted_publish(packet: mqtt5_packet.PublishPacket, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
    validate_topic(packet.topicName, 'topicName');
    validate_payload(packet.payload);
    validate_qos(packet.qos);

    if (mode == model.ProtocolMode.Mqtt5) {
        validate_optional_payload_format(packet.payloadFormat, "payloadFormat");
        validate_optional_u32(packet.messageExpiryIntervalSeconds, "messageExpiryIntervalSeconds");
        validate_optional_u16(packet.topicAlias, "topicAlias");
        validate_optional_topic(packet.responseTopic, "responseTopic");
        validate_optional_binary_data(packet.correlationData, "correlationData");
        validate_optional_string(packet.contentType, "contentType");
        validate_user_properties(packet.userProperties);
    }
}

function validate_subscriptions(subscriptions: Array<mqtt5_packet.Subscription>, mode: model.ProtocolMode) {
    if (!subscriptions || subscriptions.length == 0) {
        throw new CrtError("Subscriptions cannot be empty");
    }

    for (let subscription of subscriptions) {
        validate_topic_filter(subscription.topicFilter, "topicFilter");
        validate_qos(subscription.qos);

        if (mode == model.ProtocolMode.Mqtt5) {
            // no need to validate noLocal or retainAsPublished booleans
            validate_optional_retain_handling_type(subscription.retainHandlingType, "Subscription.retainHandling");
        }
    }
}

function validate_user_submitted_subscribe(packet: mqtt5_packet.SubscribePacket, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
    validate_subscriptions(packet.subscriptions, mode);
    if (mode == model.ProtocolMode.Mqtt5) {
        validate_optional_vli(packet.subscriptionIdentifier, "subscriptionIdentifier");
        validate_user_properties(packet.userProperties);
    }
}

function validate_user_submitted_unsubscribe(packet: mqtt5_packet.UnsubscribePacket, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
    if (!packet.topicFilters || packet.topicFilters.length == 0) {
        throw new CrtError("TopicFilters cannot be empty");
    }

    for (let filter of packet.topicFilters) {
        validate_string(filter, "topicFilters");
    }

    if (mode == model.ProtocolMode.Mqtt5) {
        validate_user_properties(packet.userProperties);
    }
}

function validate_user_submitted_disconnect(packet: mqtt5_packet.DisconnectPacket, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
    if (mode == model.ProtocolMode.Mqtt5) {
        validate_disconnect_reason_code(packet.reasonCode, mode);
        validate_optional_u32(packet.sessionExpiryIntervalSeconds, "sessionExpiryIntervalSeconds");
        validate_optional_string(packet.reasonString, "reasonString");
        validate_optional_string(packet.serverReference, "serverReference");
        validate_user_properties(packet.userProperties);
    }
}

// binary outbound packet validators

function validate_binary_publish(packet: model.PublishPacketBinary, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
}

function validate_binary_puback(packet: model.PubackPacketBinary, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
}

function validate_binary_subscribe(packet: model.SubscribePacketBinary, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
}

function validate_binary_unsubscribe(packet: model.UnsubscribePacketBinary, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
}

function validate_binary_disconnect(packet: model.DisconnectPacketBinary, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
}

function validate_binary_connect(packet: model.ConnectPacketBinary, mode: model.ProtocolMode, settings?: mqtt5_common.NegotiatedSettings) {
}

// inbound packet validators

function validate_inbound_publish(packet: model.PublishPacketInternal, mode: model.ProtocolMode) {

}

function validate_inbound_puback(packet: model.PubackPacketInternal, mode: model.ProtocolMode) {

}

function validate_inbound_connack(packet: model.ConnackPacketInternal, mode: model.ProtocolMode) {

}

function validate_inbound_suback(packet: model.SubackPacketInternal, mode: model.ProtocolMode) {

}

function validate_inbound_unsuback(packet: model.UnsubackPacketInternal, mode: model.ProtocolMode) {

}

function validate_inbound_disconnect(packet: model.DisconnectPacketInternal, mode: model.ProtocolMode) {

}