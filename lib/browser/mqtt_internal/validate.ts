/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import * as encoder from "./encoder";
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

export function validateUserSubmittedOutboundPacket(packet: mqtt5_packet.IPacket, mode: model.ProtocolMode) {
    switch(packet.type) {
        case mqtt5_packet.PacketType.Publish:
            validateUserSubmittedPublish(packet as mqtt5_packet.PublishPacket, mode);
            break;

        case mqtt5_packet.PacketType.Subscribe:
            validateUserSubmittedSubscribe(packet as mqtt5_packet.SubscribePacket, mode);
            break;

        case mqtt5_packet.PacketType.Unsubscribe:
            validateUserSubmittedUnsubscribe(packet as mqtt5_packet.UnsubscribePacket, mode);
            break;

        case mqtt5_packet.PacketType.Disconnect:
            validateUserSubmittedDisconnect(packet as mqtt5_packet.DisconnectPacket, mode);
            break;

        default:
            break;
    }
}

export function validateBinaryOutboundPacket(packet: model.IPacketBinary, mode: model.ProtocolMode, settings: mqtt5_common.NegotiatedSettings) {
    switch(packet.type) {
        case mqtt5_packet.PacketType.Publish:
            validateBinaryPublish(packet as model.PublishPacketBinary, mode, settings, false);
            break;

        case mqtt5_packet.PacketType.Subscribe:
            validateBinarySubscribe(packet as model.SubscribePacketBinary, mode, settings);
            break;

        case mqtt5_packet.PacketType.Unsubscribe:
            validateBinaryUnsubscribe(packet as model.UnsubscribePacketBinary, mode, settings);
            break;

        case mqtt5_packet.PacketType.Disconnect:
            validateBinaryDisconnect(packet as model.DisconnectPacketBinary, mode, settings);
            break;

        case mqtt5_packet.PacketType.Connect:
            validateBinaryConnect(packet as model.ConnectPacketBinary, mode, settings);
            break;

        case mqtt5_packet.PacketType.Puback:
            validateBinaryPuback(packet as model.PubackPacketBinary, mode, settings);
            break;

        default:
            break;
    }
}

export function validateInboundPacket(packet: mqtt5_packet.IPacket, mode: model.ProtocolMode) {
    switch(packet.type) {
        case mqtt5_packet.PacketType.Publish:
            validateInboundPublish(packet as model.PublishPacketInternal, mode);
            break;

        case mqtt5_packet.PacketType.Puback:
            validateInboundPuback(packet as model.PubackPacketInternal, mode);
            break;

        case mqtt5_packet.PacketType.Connack:
            validateInboundConnack(packet as model.ConnackPacketInternal, mode);
            break;

        case mqtt5_packet.PacketType.Suback:
            validateInboundSuback(packet as model.SubackPacketInternal, mode);
            break;

        case mqtt5_packet.PacketType.Unsuback:
            validateInboundUnsuback(packet as model.UnsubackPacketInternal, mode);
            break;

        case mqtt5_packet.PacketType.Disconnect:
            validateInboundDisconnect(packet as model.DisconnectPacketInternal, mode);
            break;

        default:
            break;
    }
}

// primitive fields

// we don't validate booleans because we use truthiness to map to 0 or 1, so there's no need

function validateU8(value: number, fieldName: string) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new CrtError(`Field "${fieldName}" with value "${value}" is not a valid u8`);
    }
}

function validateU16(value: number, fieldName: string) {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new CrtError(`Field "${fieldName}" with value "${value}" is not a valid u16`);
    }
}

function validateOptionalPositiveU16(value: number | undefined, fieldName: string) {
    if (value != undefined) {
        validateU16(value, fieldName);
        if (value == 0) {
            throw new CrtError(`Field "${fieldName}" with value "${value}" cannot be 0`);
        }
    }
}

function validateU32(value: number, fieldName: string) {
    if (!Number.isInteger(value) || value < 0 || value > (256 * 256 * 256 * 256 - 1)) {
        throw new CrtError(`Field "${fieldName}" with value "${value}" is not a valid u32`);
    }
}

function validateOptionalU32(value: number | undefined, fieldName: string) {
    if (value != undefined) {
        validateU32(value, fieldName);
    }
}

function validateVli(value: number, fieldName: string) {
    if (!Number.isInteger(value) || value < 0 || value > (128 * 128 * 128 * 128 - 1)) {
        throw new CrtError(`Field "${fieldName}" with value "${value}" cannot be VLI-encoded`);
    }
}

function validateOptionalVli(value: number | undefined, fieldName: string) {
    if (value != undefined) {
        validateVli(value, fieldName);
    }
}

// we don't validate length here because we don't know encoding length without doing a utf-8 conversion.
// This means we validate string length in the internal validators which checks ArrayBuffer lengths.
function validateString(value: any, fieldName: string) {
    if ((typeof value === 'string') || (value instanceof String)) {
        return;
    }

    throw new CrtError(`Field "${fieldName}" with value "${value}" is not a valid string`);
}

function validateOptionalString(value: string | undefined, fieldName: string) {
    if (value === undefined) {
        return;
    }

    validateString(value, fieldName);
}


function validateBufferLength(value : ArrayBuffer, fieldName: string) {
    // we don't do typechecking here because this is only used by internal validators which are checking values
    // that we explicitly constructed ourselves when converting to the binary model
    if (value.byteLength > 65535) {
        throw new CrtError(`Field "${fieldName}" is not a 16-bit length buffer`);
    }
}

function validateOptionalBufferLength(value : ArrayBuffer | undefined, fieldName: string) {
    if (value == undefined) {
        return;
    }

    validateBufferLength(value, fieldName);
}

// enum validation

function validateSubackReasonCode(value: mqtt5_packet.SubackReasonCode, mode: model.ProtocolMode) {
    validateU8(value, 'reasonCodes');

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

function validatePubackReasonCode(value: mqtt5_packet.PubackReasonCode, mode: model.ProtocolMode) {
    validateU8(value, 'reasonCode');
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

function validateUnsubackReasonCode(value: mqtt5_packet.UnsubackReasonCode, mode: model.ProtocolMode) {
    validateU8(value, 'reasonCodes');
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

function validateConnectReasonCode(value: mqtt5_packet.ConnectReasonCode, mode: model.ProtocolMode) {
    validateU8(value, 'reasonCode');

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

function validateDisconnectReasonCode(value: mqtt5_packet.DisconnectReasonCode, mode: model.ProtocolMode) {
    validateU8(value, 'reasonCode');
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

function validateQos(qos: mqtt5_packet.QoS) {
    validateU8(qos, 'QoS');
    switch (qos) {
        case mqtt5_packet.QoS.AtLeastOnce:
        case mqtt5_packet.QoS.AtMostOnce:
        case mqtt5_packet.QoS.ExactlyOnce:
            break;

        default:
            throw new CrtError(`"${qos}" is not a valid QualityOfService`);
    }
}

function validateOptionalPayloadFormat(payloadFormat: mqtt5_packet.PayloadFormatIndicator | undefined, fieldName: string) {
    if (payloadFormat === undefined) {
        return;
    }

    validateU8(payloadFormat, fieldName);
    switch (payloadFormat) {
        case mqtt5_packet.PayloadFormatIndicator.Bytes:
        case mqtt5_packet.PayloadFormatIndicator.Utf8:
            break;

        default:
            throw new CrtError(`Field "${fieldName}" with value "${payloadFormat}" is not a valid PayloadFormatIndicator`);
    }
}

function validateOptionalRetainHandlingType(retainHandling: mqtt5_packet.RetainHandlingType | undefined, fieldName: string) {
    if (retainHandling === undefined) {
        return;
    }

    validateU8(retainHandling, fieldName);
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

function validateUserProperties(userProperties: Array<mqtt5_packet.UserProperty> | undefined) {
    if (!userProperties) {
        return;
    }

    if (!Array.isArray(userProperties)) {
        throw new CrtError('UserProperties is not an array');
    }

    for (let userProperty of userProperties) {
        validateString(userProperty.name, 'UserProperty.name');
        validateString(userProperty.value, 'UserProperty.value');
    }
}

function validatePayload(payload: mqtt5_packet.Payload | undefined) {
    if (!payload) {
        return;
    }

    if (!model.isValidPayload(payload)) {
        throw new CrtError("Invalid payload value");
    }
}

function validateBinaryData(value: mqtt5_packet.BinaryData, fieldName: string) {
    if (!model.isValidBinaryData(value)) {
        throw new CrtError(`Field ${fieldName} is not valid binary data`);
    }
}

function validateOptionalBinaryData(value: mqtt5_packet.BinaryData | undefined, fieldName: string) {
    if (!value) {
        return;
    }

    return validateBinaryData(value, fieldName);
}

function validateTopic(value: string, fieldName:string) {
    validateString(value, fieldName);
    if (!mqtt_shared.isValidTopic(value)) {
        throw new CrtError(`value "${value}" of field "${fieldName}" is not a valid topic`);
    }
}

function validateOptionalTopic(value: string | undefined, fieldName:string) {
    if (value == undefined) {
        return;
    }

    validateTopic(value, fieldName);
}

function validateTopicFilter(value: string, fieldName:string) {
    validateString(value, fieldName);
    if (!mqtt_shared.isValidTopicFilter(value)) {
        throw new CrtError(`value "${value}" of field "${fieldName}" is not a valid topic filter`);
    }
}

function validateRequiredPacketId(value: number | undefined, fieldName:string) {
    if (value == undefined) {
        throw new CrtError(`packet id field ${fieldName} must be defined"`);
    }

    validateU16(value, fieldName);
    if (value == 0) {
        throw new CrtError(`packet id field "${fieldName}" is not a valid packetId`);
    }
}

// user-submitted outbound packet validators

function validateUserSubmittedPublish(packet: mqtt5_packet.PublishPacket, mode: model.ProtocolMode) {
    validateTopic(packet.topicName, 'topicName');
    validatePayload(packet.payload);
    validateQos(packet.qos);

    if (mode == model.ProtocolMode.Mqtt5) {
        validateOptionalPayloadFormat(packet.payloadFormat, "payloadFormat");
        validateOptionalU32(packet.messageExpiryIntervalSeconds, "messageExpiryIntervalSeconds");
        validateOptionalPositiveU16(packet.topicAlias, "topicAlias"); // 0 is also invalid
        validateOptionalTopic(packet.responseTopic, "responseTopic");
        validateOptionalBinaryData(packet.correlationData, "correlationData");
        validateOptionalString(packet.contentType, "contentType");
        validateUserProperties(packet.userProperties);
    }
}

function validateSubscriptions(subscriptions: Array<mqtt5_packet.Subscription>, mode: model.ProtocolMode) {
    if (!Array.isArray(subscriptions)) {
        throw new CrtError("Subscriptions must be an array");
    }

    if (subscriptions.length == 0) {
        throw new CrtError("Subscriptions cannot be empty");
    }

    for (let subscription of subscriptions) {
        validateTopicFilter(subscription.topicFilter, "topicFilter");
        validateQos(subscription.qos);

        if (mode == model.ProtocolMode.Mqtt5) {
            // no need to validate noLocal or retainAsPublished booleans
            validateOptionalRetainHandlingType(subscription.retainHandlingType, "Subscription.retainHandling");
        }
    }
}

function validateUserSubmittedSubscribe(packet: mqtt5_packet.SubscribePacket, mode: model.ProtocolMode) {
    validateSubscriptions(packet.subscriptions, mode);
    if (mode == model.ProtocolMode.Mqtt5) {
        validateOptionalVli(packet.subscriptionIdentifier, "subscriptionIdentifier");
        validateUserProperties(packet.userProperties);
    }
}

function validateUserSubmittedUnsubscribe(packet: mqtt5_packet.UnsubscribePacket, mode: model.ProtocolMode) {
    if (!packet.topicFilters || packet.topicFilters.length == 0) {
        throw new CrtError("TopicFilters cannot be empty");
    }

    for (let filter of packet.topicFilters) {
        validateTopicFilter(filter, "topicFilters");
    }

    if (mode == model.ProtocolMode.Mqtt5) {
        validateUserProperties(packet.userProperties);
    }
}

function validateUserSubmittedDisconnect(packet: mqtt5_packet.DisconnectPacket, mode: model.ProtocolMode) {
    if (mode == model.ProtocolMode.Mqtt5) {
        validateDisconnectReasonCode(packet.reasonCode, mode);
        validateOptionalU32(packet.sessionExpiryIntervalSeconds, "sessionExpiryIntervalSeconds");
        validateOptionalString(packet.reasonString, "reasonString");
        validateOptionalString(packet.serverReference, "serverReference");
        validateUserProperties(packet.userProperties);
    }
}

// binary outbound packet validators; user-submitted validation is not repeated here

function validatePacketLength(packet: model.IPacketBinary, mode: model.ProtocolMode, maximumPacketSize: number) {
    let length = encoder.computePacketEncodingLength(packet, mode);
    if (length > maximumPacketSize) {
        throw new CrtError(`Packet with length ${length} exceeds established maximum packet size of ${maximumPacketSize}`);
    }
}

function validateBinaryUserProperties(userProperties: Array<model.UserPropertyBinary> | undefined) {
    if (!userProperties) {
        return;
    }

    for (let userProperty of userProperties) {
        validateBufferLength(userProperty.name, "UserProperty.name");
        validateBufferLength(userProperty.value, "UserProperty.value");
    }
}

function validateBinaryPublish(packet: model.PublishPacketBinary, mode: model.ProtocolMode, settings: mqtt5_common.NegotiatedSettings, isWill: boolean) {
    if (isWill) {
        validatePacketLength(packet, mode, 65535);
    } else {
        validatePacketLength(packet, mode, settings.maximumPacketSizeToServer);
    }

    if (!isWill) {
        if (packet.qos == mqtt5_packet.QoS.AtMostOnce) {
            if (packet.packetId != undefined) {
                throw new CrtError("packetId must not be set on outbound publish packets with QoS 0");
            }

            if (packet.duplicate) {
                throw new CrtError("duplicate must not be set on outbound publish packets with QoS 0");
            }
        } else {
            validateRequiredPacketId(packet.packetId, "packetId");
        }
    }

    if (packet.retain && !settings.retainAvailable) {
        throw new CrtError("retain cannot be set on outbound publish packets if the server does not support retained messages");
    }

    if (packet.qos > settings.maximumQos) {
        throw new CrtError(`QoS ${packet.qos} is greater than the maximum QoS (${settings.maximumQos}) supported by the server`);
    }

    validateBufferLength(packet.topicName, "topicName");

    if (mode == model.ProtocolMode.Mqtt5) {
        if (packet.subscriptionIdentifiers != undefined) {
            throw new CrtError("subscriptionIdentifiers may not be set on outbound publish packets");
        }

        if (!isWill && packet.topicAlias != undefined) {
            if (packet.topicAlias == 0) {
                throw new CrtError("topicAlias cannot be zero");
            } else if (packet.topicAlias > settings.topicAliasMaximumToServer) {
                throw new CrtError(`topicAlias value ${packet.topicAlias} is greater than the maximum topic alias (${settings.topicAliasMaximumToServer}) supported by the server`);
            }
        }

        validateOptionalBufferLength(packet.responseTopic, "responseTopic");
        validateOptionalBufferLength(packet.correlationData, "correlationData");
        validateOptionalBufferLength(packet.contentType, "contentType");
        validateBinaryUserProperties(packet.userProperties);
    }
}

function validateBinaryPuback(packet: model.PubackPacketBinary, mode: model.ProtocolMode, settings: mqtt5_common.NegotiatedSettings) {
    validatePacketLength(packet, mode, settings.maximumPacketSizeToServer);
    validateRequiredPacketId(packet.packetId, "packetId");

    if (mode == model.ProtocolMode.Mqtt5) {
        validateOptionalBufferLength(packet.reasonString, "reasonString");
        validateBinaryUserProperties(packet.userProperties);
    }
}

function validateSubscription(subscription: model.SubscriptionBinary, mode: model.ProtocolMode, settings: mqtt5_common.NegotiatedSettings) {
    let properties = mqtt_shared.computeTopicProperties(subscription.topicFilterAsString, true);
    if (properties.isShared) {
        if (!settings.sharedSubscriptionsAvailable) {
            throw new CrtError("Shared subscriptions are not supported by the server");
        }

        if (mode == model.ProtocolMode.Mqtt5) {
            if (subscription.noLocal) {
                throw new CrtError("noLocal may not be set on a shared subscriptions");
            }
        }
    }

    if (properties.hasWildcard && !settings.wildcardSubscriptionsAvailable) {
        throw new CrtError("Wildcard subscriptions are not supported by the server");
    }

    validateBufferLength(subscription.topicFilter, "subscription.topicFilter");
}

function validateBinarySubscribe(packet: model.SubscribePacketBinary, mode: model.ProtocolMode, settings: mqtt5_common.NegotiatedSettings) {
    validatePacketLength(packet, mode, settings.maximumPacketSizeToServer);
    validateRequiredPacketId(packet.packetId, "packetId");

    for (let subscription of packet.subscriptions) {
        validateSubscription(subscription, mode, settings);
    }

    if (mode == model.ProtocolMode.Mqtt5) {
        validateBinaryUserProperties(packet.userProperties);
    }
}

function validateBinaryUnsubscribe(packet: model.UnsubscribePacketBinary, mode: model.ProtocolMode, settings: mqtt5_common.NegotiatedSettings) {
    validatePacketLength(packet, mode, settings.maximumPacketSizeToServer);
    validateRequiredPacketId(packet.packetId, "packetId");

    for (let topicFilter of packet.topicFilters) {
        validateBufferLength(topicFilter, "topicFilter");
    }

    if (mode == model.ProtocolMode.Mqtt5) {
        validateBinaryUserProperties(packet.userProperties);
    }
}

function validateBinaryDisconnect(packet: model.DisconnectPacketBinary, mode: model.ProtocolMode, settings: mqtt5_common.NegotiatedSettings) {
    validatePacketLength(packet, mode, settings.maximumPacketSizeToServer);

    if (mode == model.ProtocolMode.Mqtt5) {
        if (settings.sessionExpiryInterval == 0) {
            if (packet.sessionExpiryIntervalSeconds != undefined && packet.sessionExpiryIntervalSeconds > 0) {
                throw new CrtError("sessionExpiryIntervalSeconds cannot be positive when the connection was established with a zero-valued session expiry interval");
            }
        }

        validateOptionalBufferLength(packet.reasonString, "reasonString");
        validateOptionalBufferLength(packet.serverReference, "serverReference");
        validateBinaryUserProperties(packet.userProperties);
    }
}

// Connect packets are synthesized internally based on configuration settings and state
// we validate type and integer widths when we validate the corresponding component of client configuration
function validateBinaryConnect(packet: model.ConnectPacketBinary, mode: model.ProtocolMode, settings: mqtt5_common.NegotiatedSettings) {
    validatePacketLength(packet, mode, settings.maximumPacketSizeToServer);

    validateOptionalBufferLength(packet.clientId, "clientId");
    validateOptionalBufferLength(packet.username, "username");
    validateOptionalBufferLength(packet.password, "password");

    if (packet.will) {
        validateBinaryPublish(packet.will, mode, settings, true);
    }

    if (mode == model.ProtocolMode.Mqtt5) {
        validateOptionalBufferLength(packet.authenticationMethod, "authenticationMethod");
        validateOptionalBufferLength(packet.authenticationData, "authenticationData");

        validateBinaryUserProperties(packet.userProperties);
    }
}

// inbound packet validators - we don't type check or integer-width check anything because we're the ones
// who initialized the packet with appropriate byte-level decoding operations.  We do check
//   1. enum values
//   2. packet ids (non-zero)
//   3. misc. property constraints

function validateInboundPublish(packet: model.PublishPacketInternal, mode: model.ProtocolMode) {
    validateQos(packet.qos);
    if (packet.qos == mqtt5_packet.QoS.AtMostOnce) {
        if (packet.packetId != undefined) {
            throw new CrtError("packetId must not be set on QoS 0 publishes");
        }
    } else {
        validateRequiredPacketId(packet.packetId, "packetId");
    }

    if (packet.topicName.length == 0) {
        throw new CrtError("topicName is empty (alias could not be resolved)");
    }
}

function validateInboundPuback(packet: model.PubackPacketInternal, mode: model.ProtocolMode) {
    validateRequiredPacketId(packet.packetId, "packetId");
    validatePubackReasonCode(packet.reasonCode, mode);
}

function validateInboundConnack(packet: model.ConnackPacketInternal, mode: model.ProtocolMode) {
    validateConnectReasonCode(packet.reasonCode, mode);
    if (packet.sessionPresent) {
        if (packet.reasonCode != mqtt5_packet.ConnectReasonCode.Success) {
            throw new CrtError("sessionPresent cannot be true with an unsuccessful connect reason code");
        }
    }

    if (mode == model.ProtocolMode.Mqtt5) {
        if (packet.receiveMaximum != undefined && packet.receiveMaximum == 0) {
            throw new CrtError("receiveMaximum must be a positive integer");
        }

        if (packet.maximumQos != undefined) {
            if (packet.maximumQos != mqtt5_packet.QoS.AtLeastOnce && packet.maximumQos != mqtt5_packet.QoS.AtMostOnce) {
                throw new CrtError("maximumQos can only be 0 or 1");
            }
        }

        if (packet.maximumPacketSize != undefined && packet.maximumPacketSize == 0) {
            throw new CrtError("maximumPacketSize must be a positive integer");
        }
    }
}

function validateInboundSuback(packet: model.SubackPacketInternal, mode: model.ProtocolMode) {
    validateRequiredPacketId(packet.packetId, "packetId");
    for (let reasonCode of packet.reasonCodes) {
        validateSubackReasonCode(reasonCode, mode);
    }
}

function validateInboundUnsuback(packet: model.UnsubackPacketInternal, mode: model.ProtocolMode) {
    validateRequiredPacketId(packet.packetId, "packetId");
    for (let reasonCode of packet.reasonCodes) {
        validateUnsubackReasonCode(reasonCode, mode);
    }
}

function validateInboundDisconnect(packet: model.DisconnectPacketInternal, mode: model.ProtocolMode) {
    validateDisconnectReasonCode(packet.reasonCode, mode);
    if (mode == model.ProtocolMode.Mqtt5) {
        if (packet.sessionExpiryIntervalSeconds != undefined) {
            throw new CrtError("server Disconnect packets must not define sessionExpiryIntervalSeconds");
        }
    }
}
