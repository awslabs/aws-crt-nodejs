/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

type HttpHeader = string[];

export class HttpHeaders {
    // Map from "header": [["HeAdEr", "value1"], ["HEADER", "value2"], ["header", "value3"]]
    private headers: { [index: string]: [HttpHeader] } = {};

    constructor(headers: HttpHeader[] = []) {
        for (const header of headers) {
            this.add(header[0], header[1]);
        }
    }

    add(name: string, value: string) {
        let values = this.headers[name.toLowerCase()];
        if (values) {
            values.push([name, value]);
        } else {
            this.set(name, value);
        }
    }

    set(name: string, value: string) {
        this.headers[name.toLowerCase()] = [[name, value]];
    }

    get_values(name: string) {
        const values_list = this.headers[name.toLowerCase()] || [];
        const values = [];
        for (const entry of values_list) {
            values.push(entry[1]);
        }
        return values;
    }

    get(name: string) {
        const values = this.headers[name.toLowerCase()];
        if (!values) { 
            return "";
        }
        return values[0][1] || "";
    }

    remove(name: string) {
        delete this.headers[name.toLowerCase()];
    }

    remove_value(name: string, value: string) {
        let values = this.headers[name.toLowerCase()];
        for (let idx = 0; idx < values.length; ++idx) {
            const entry = values[idx];
            if (entry[0] == name) {
                if (values.length == 1) {
                    delete this.headers[name.toLowerCase()];
                } else {
                    delete values[idx];
                }
            }
        }
    }

    clear() {
        this.headers = {};
    }

    *[Symbol.iterator]() {
        for (const key in this.headers) {
            const values = this.headers[key];
            for (let entry of values) {
                yield entry;
            }
        }
    }

    _flatten(): string[][] {
        let flattened = [];
        for (let key in this.headers) {
            flattened.push([key, this.headers[key][0][0]]);
        }
        return flattened;
    }
}

export class HttpRequest {
    public headers = new HttpHeaders();
    constructor(
        public method: string,
        public path: string,
        public body: string) {
    }
}
