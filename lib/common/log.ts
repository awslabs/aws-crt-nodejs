/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 *
 * Package-private module containing a grab bag of support for building log strings
 *
 * @packageDocumentation
 * @module log
 */

/*
 * A bunch of helper functions for building more complex log strings.  We don't just toString() objects because
 * there are fields we may want to transform or hide
 */

export function appendBooleanPropertyLine(current: string, prefix: string, propertyName: string, value: boolean) : string {
    return current + `${prefix}  ${propertyName}: ${value ? "true" : "false"}\n`;
}

export function appendOptionalBooleanPropertyLine(current: string, prefix: string, propertyName: string, value?: boolean) : string {
    if (value == undefined) {
        return current;
    } else {
        return appendBooleanPropertyLine(current, prefix, propertyName, value);
    }
}

export function appendNumericPropertyLine(current: string, prefix: string, propertyName: string, value: number) : string {
    return current + `${prefix}  ${propertyName}: ${value}\n`;
}

export function appendOptionalNumericPropertyLine(current: string, prefix: string, propertyName: string, value?: number) : string {
    if (value == undefined) {
        return current;
    } else {
        return appendNumericPropertyLine(current, prefix, propertyName, value);
    }
}

export function appendOptionalNumericArrayPropertyLine(current: string, prefix: string, propertyName: string, values?: Array<number>) : string {
    if (values == undefined) {
        return current;
    } else {
        current += `${prefix}  ${propertyName}: [`;
        for (let i = 0; i < values.length; i++) {
            if (i > 0) {
                current += ", ";
            }

            current += values[i];
        }
        current += "]\n";

        return current;
    }
}

export function appendEnumPropertyLine(current: string, prefix: string, propertyName: string, valueNameConverter: (val : number) => string, value: number) : string {
    return current + `${prefix}  ${propertyName}: ${valueNameConverter(value)}(${value})\n`;
}

export function appendOptionalEnumPropertyLine(current: string, prefix: string, propertyName: string, valueNameConverter: (val : number) => string, value?: number) : string {
    if (value == undefined) {
        return current;
    } else {
        return appendEnumPropertyLine(current, prefix, propertyName, valueNameConverter, value);
    }
}

export function appendEnumArrayPropertyLine<T>(current: string, prefix: string, propertyName: string, valueNameConverter: (val : number) => string, values: Array<T>) : string {
    current += `${prefix}  ${propertyName}: [\n`;
    for (let i = 0; i < values.length; i++) {
        let value = values[i];
        current += `${prefix}    ${valueNameConverter(value as number)}(${value})\n`;
    }
    current += `${prefix}  ]\n`;

    return current;
}

export function appendStringPropertyLine(current: string, prefix: string, propertyName: string, value: string) : string {
    return current + `${prefix}  ${propertyName}: ${value}\n`;
}

export function appendOptionalStringPropertyLine(current: string, prefix: string, propertyName: string, value?: string) : string {
    if (value == undefined) {
        return current;
    } else {
        return appendStringPropertyLine(current, prefix, propertyName, value);
    }
}

export function appendStringArrayPropertyLine(current: string, prefix: string, propertyName: string, values: Array<string>) : string {
    current += `${prefix}  ${propertyName}: [\n`;
    for (let value of values) {
        current += `${prefix}    ${value}\n`;
    }
    current += `${prefix}  ]\n`;

    return current;
}

export function appendBytesPropertyLine(current: string, prefix: string, propertyName: string, value: BinaryData | string) : string {
    let valueByteLength : number = 0;
    if (typeof value === 'string') {
        let encoder = new TextEncoder();
        valueByteLength = encoder.encode(value).buffer.byteLength;
    } else {
        valueByteLength = value.byteLength;
    }

    return current + `${prefix}  ${propertyName}: [..${valueByteLength} bytes..]\n`;
}

export function appendOptionalBytesPropertyLine(current: string, prefix: string, propertyName: string, value?: BinaryData | string) : string {
    if (value == undefined) {
        return current;
    } else {
        return appendBytesPropertyLine(current, prefix, propertyName, value);
    }
}
