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

import { InputStreamBase } from "./io";

type HttpHeader = [string, string];

/**
 * Encapsulates an HTTP header block. Stores all headers in their original case format,
 * but allows for case-insensitive header lookup.
 */
export class HttpHeaders {
    // Map from "header": [["HeAdEr", "value1"], ["HEADER", "value2"], ["header", "value3"]]
    private headers: { [index: string]: [HttpHeader] } = {};

    /** Construct from a collection of [name, value] pairs */
    constructor(headers: HttpHeader[] = []) {
        for (const header of headers) {
            this.add(header[0], header[1]);
        }
    }

    /**
     * Add a name/value pair
     * @param name - The header name
     * @param value - The header value
    */
    add(name: string, value: string) {
        let values = this.headers[name.toLowerCase()];
        if (values) {
            values.push([name, value]);
        } else {
            this.set(name, value);
        }
    }

    /**
     * Set a name/value pair, replacing any existing values for the name
     * @param name - The header name
     * @param value - The header value
    */
    set(name: string, value: string) {
        this.headers[name.toLowerCase()] = [[name, value]];
    }

    /**
     * Get the list of values for the given name
     * @param name - The header name to look for
     * @return List of values, or empty list if none exist
     */
    get_values(name: string) {
        const values_list = this.headers[name.toLowerCase()] || [];
        const values = [];
        for (const entry of values_list) {
            values.push(entry[1]);
        }
        return values;
    }

    /**
     * Gets the first value for the given name, ignoring any additional values
     * @param name - The header name to look for
     * @param default_value - Value returned if no values are found for the given name
     * @return The first header value, or default if no values exist
     */
    get(name: string, default_value = "") {
        const values = this.headers[name.toLowerCase()];
        if (!values) {
            return "";
        }
        return values[0][1] || default_value;
    }

    /**
     * Removes all values for the given name
     * @param name - The header to remove all values for
     */
    remove(name: string) {
        delete this.headers[name.toLowerCase()];
    }

    /**
     * Removes a specific name/value pair
     * @param name - The header name to remove
     * @param value - The header value to remove
     */
    remove_value(name: string, value: string) {
        let values = this.headers[name.toLowerCase()];
        for (let idx = 0; idx < values.length; ++idx) {
            const entry = values[idx];
            if (entry[1] == value) {
                if (values.length == 1) {
                    delete this.headers[name.toLowerCase()];
                } else {
                    delete values[idx];
                }
                return;
            }
        }
    }

    /** Clears the entire header set */
    clear() {
        this.headers = {};
    }

    /**
     * Iterator. Allows for:
     * let headers = new HttpHeaders();
     * ...
     * for (const header of headers) { }
    */
    *[Symbol.iterator]() {
        for (const key in this.headers) {
            const values = this.headers[key];
            for (let entry of values) {
                yield entry;
            }
        }
    }

    _flatten(): [string, string][] {
        let flattened: [string, string][] = [];
        for (let key in this.headers) {
            flattened.push([key, this.headers[key][0][1]]);
        }
        return flattened;
    }
}

export enum HttpProxyAuthenticationType
{
    None = 0,
    Basic = 1,
};

/** Options used when connecting to an HTTP endpoint via a proxy */
export class HttpProxyOptions {
    constructor(
        public host_name: string,
        public port: number,
        public auth_method = HttpProxyAuthenticationType.None,
        public auth_username?: string,
        public auth_password?: string
    ) {
    }
}

/** Represents a request to a web server from a client */
export class HttpRequest {
    constructor(
        /** The verb to use for the request (i.e. GET, POST, PUT, DELETE, HEAD) */
        public method: string,
        /** The URI of the request */
        public path: string,
        /** The request body, in the case of a POST or PUT request */
        public body?: InputStreamBase,
        /** Additional custom headers to send to the server */
        public headers = new HttpHeaders()) {
    }
}
