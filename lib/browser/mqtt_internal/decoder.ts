/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import {CrtError} from "../error";
import * as mqtt5_packet from '../../common/mqtt5_packet';
import * as vli from "./vli";
import * as model from "./model";

function decode_connack_packet_311(firstByte: number, payload: DataView) : mqtt5_packet.ConnackPacket {
    if (payload.byteLength != 2) {
        throw new CrtError("Invalid connack packet received");
    }
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

        let result = vli.decode_vli(new DataView(this.scratchBuffer, 0, this.scratchIndex));
        if (result.type == vli.VliDecodeResultType.Success) {
            // @ts-ignore
            this.remainingLength = result.value;
            this.scratchIndex = 0;
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