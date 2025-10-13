/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as vli from "./vli";
import * as model from "./model";
import {toUtf8} from "@aws-sdk/util-utf8-browser";

function decode_boolean(payload: DataView, offset: number) : [boolean, number] {
    return [payload.getUint8(offset) ? true : false, offset + 1];
}

function decode_u8(payload: DataView, offset: number) : [number, number] {
    return [payload.getUint8(offset), offset + 1];
}

function decode_u16(payload: DataView, offset: number) : [number, number] {
    return [payload.getUint16(offset), offset + 2];
}

function decode_u32(payload: DataView, offset: number) : [number, number] {
    return [payload.getUint32(offset), offset + 4];
}

function decode_vli(payload: DataView, offset: number) : [number, number] {
    let result = vli.decode_vli(payload, offset);
    if (result.type == vli.VliDecodeResultType.Success) {
        // @ts-ignore
        return [result.value, result.nextOffset];
    }

    throw new CrtError("Vli overflow during decoding");
}

function decode_string(payload: DataView, offset: number, length: number) : [string, number] {
    return [toUtf8(new Uint8Array(payload.buffer, offset, length)), offset + length];
}

function decode_bytes(payload: DataView, offset: number, length: number) : [ArrayBuffer, number] {
    return [payload.buffer.slice(offset, length), offset + length];
}

function decode_connack_packet_311(firstByte: number, payload: DataView) : mqtt5_packet.ConnackPacket {
    if (payload.byteLength != 2) {
        throw new CrtError("Invalid 311 Connack packet received");
    }

    let index : number = 0;
    let flags : number = 0;
    // @ts-ignore
    let connack: mqtt5_packet.ConnackPacket = {};

    [flags, index] = decode_u8(payload, index);
    if ((flags & ~0x01) != 0) {
        throw new CrtError("Invalid connack flags");
    }
    connack.sessionPresent = flags != 0;
    [connack.reasonCode, index] = decode_u8(payload, index);

    return connack;
}

function decode_publish_packet_311(firstByte: number, payload: DataView) : mqtt5_packet.PublishPacket {

}

function decode_puback_packet_311(firstByte: number, payload: DataView) : mqtt5_packet.PubackPacket {

}

function decode_suback_packet_311(firstByte: number, payload: DataView) : mqtt5_packet.SubackPacket {

}

function decode_unsuback_packet_311(firstByte: number, payload: DataView) : mqtt5_packet.UnsubackPacket {

}

function decode_pingresp_packet(firstByte: number, payload: DataView) : mqtt5_packet.PingrespPacket {

}

export type DecodingFunction = (firstByte: number, payload: DataView) => mqtt5_packet.IPacket;
export type DecodingFunctionSet = Map<mqtt5_packet.PacketType, DecodingFunction>;

export function build_client_decoding_function_set(mode: model.ProtocolMode) : DecodingFunctionSet {
    switch (mode) {
        case model.ProtocolMode.Mqtt311:
            return new Map<mqtt5_packet.PacketType, DecodingFunction>([
                [mqtt5_packet.PacketType.Connack, decode_connack_packet_311],
            ]);

        case model.ProtocolMode.Mqtt5:
            return new Map<mqtt5_packet.PacketType, DecodingFunction>([
            ]);

    }

    throw new CrtError("Unsupported protocol");
}

enum DecoderStateType {
    PendingFirstByte,
    PendingRemainingLength,
    PendingPayload
}

const DEFAULT_SCRATCH_BUFFER_SIZE : number = 16 * 1024;

export class Decoder {

    private state: DecoderStateType;
    private scratchBuffer: ArrayBuffer = new ArrayBuffer(DEFAULT_SCRATCH_BUFFER_SIZE);
    private scratchView: DataView = new DataView(this.scratchBuffer);
    private scratchIndex: number = 0;
    private remainingLength : number = 0;
    private firstByte : number = 0;

    constructor(private decoders: DecodingFunctionSet) {
        this.state = DecoderStateType.PendingFirstByte;
    }

    reset() {
        this.state = DecoderStateType.PendingFirstByte;
        this.remainingLength = 0;
        this.firstByte = 0;
        this.scratchIndex = 0;
    }

    decode(data: DataView) : Array<mqtt5_packet.IPacket> | null {
        let current_data = data;
        while (current_data.byteLength > 0) {
            switch (this.state) {
                case DecoderStateType.PendingFirstByte:
                    current_data = this._handle_first_byte(current_data);
                    break;

                case DecoderStateType.PendingRemainingLength:
                    current_data = this._handle_remaining_length(current_data);
                    break;

                case DecoderStateType.PendingPayload:
                    current_data = this._handle_pending_payload(current_data);
                    break;
            }
        }

        return null;
    }

    private _handle_first_byte(data: DataView) : DataView {
        this.firstByte = data.getUint8(0);
        this.state = DecoderStateType.PendingRemainingLength;
        this.scratchView = new DataView(this.scratchBuffer);
        return new DataView(data.buffer, data.byteOffset + 1, data.byteLength - 1);
    }

    private _handle_remaining_length(data: DataView) : DataView {
        let nextByte = data.getUint8(0);
        this.scratchView.setUint8(this.scratchIndex++, nextByte);

        let result = vli.decode_vli(new DataView(this.scratchBuffer, 0, this.scratchIndex), 0);
        if (result.type == vli.VliDecodeResultType.Success) {
            // @ts-ignore
            this.remainingLength = result.value;
            this.scratchIndex = 0;
            if (this.remainingLength > this.scratchBuffer.byteLength) {
                this.scratchBuffer = new ArrayBuffer(this.remainingLength);
            }
            this.scratchView = new DataView(this.scratchBuffer, 0, this.remainingLength);
            this.state = DecoderStateType.PendingPayload;
        }

        return new DataView(data.buffer, data.byteOffset + 1, data.byteLength - 1);
    }

    private _handle_pending_payload(data: DataView) : DataView {
        let bytesToCopy = Math.min(data.byteLength, this.remainingLength - this.scratchIndex);
        if (bytesToCopy > 0) {
            let sourceView = new Uint8Array(data.buffer, data.byteOffset, bytesToCopy);
            let destView = new Uint8Array(this.scratchBuffer, this.scratchIndex, bytesToCopy);
            destView.set(sourceView);
        }

        if (this.scratchIndex == this.remainingLength) {
            this.state = DecoderStateType.PendingFirstByte;
            this.scratchView = new DataView(this.scratchBuffer, 0, this.remainingLength);
            this._decode_packet();
        }

        return new DataView(data.buffer, data.byteOffset + bytesToCopy, data.byteLength - bytesToCopy);
    }

    private _decode_packet() {
        let packetType = this.firstByte >> 4;
        let decoder = this.decoders.get(packetType);
        if (!decoder) {
            throw new CrtError("No decoder for packet type");
        }

        let packet = decoder(this.firstByte, this.scratchView);
    }
}