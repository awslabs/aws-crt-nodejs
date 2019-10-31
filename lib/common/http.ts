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

type HttpHeader = [string, string];

/**
 * Encapsulates an HTTP header block. Stores all headers in their original case format,
 * but allows for case-insensitive header lookup.
 */
export class HttpHeaders {
    // Map from "header": [["HeAdEr", "value1"], ["HEADER", "value2"], ["header", "value3"]]
    private headers: { [index: string]: [HttpHeader] } = {};
    private internal_message: any; /* Keep this for GC reasons */
    private native_message: any; /* Actually an HttpRequest/Response from the native directory */

    /** Construct from a collection of [name, value] pairs */
    constructor(headers: HttpHeader[] = [], internal_message?: any) {
        if (internal_message) {
            this.internal_message = internal_message;
            this.native_message = internal_message.native_handle();

            <void>this.internal_message;
        }

        for (const header of headers) {
            this.add(header[0], header[1]);
        }
    }

    get length(): number {
        if (this.native_message) {
            return this.native_message.num_headers;
        } else {
            let length = 0;
            for (let key in this.headers) {
                length += this.headers[key].length;
            }
            return length;
        }
    }

    /**
     * Add a name/value pair
     * @param name - The header name
     * @param value - The header value
    */
    add(name: string, value: string) {
        if (this.native_message) {
            this.native_message.add_header(name, value);
        } else {
            let values = this.headers[name.toLowerCase()];
            if (values) {
                values.push([name, value]);
            } else {
                this.headers[name.toLowerCase()] = [[name, value]];
            }
        }
    }

    /**
     * Set a name/value pair, replacing any existing values for the name
     * @param name - The header name
     * @param value - The header value
    */
    set(name: string, value: string) {
        if (this.native_message) {
            this.native_message.set_header(name, value);
        } else {
            this.headers[name.toLowerCase()] = [[name, value]];
        }
    }

    /**
     * Get the list of values for the given name
     * @param name - The header name to look for
     * @return List of values, or empty list if none exist
     */
    get_values(name: string) {
        const key = name.toLowerCase();

        const values = [];
        if (this.native_message) {
            const len = this.length;
            for (let i = 0; i < len; ++i) {
                const header = this.native_message.get_header(i);
                if (header[0].toLowerCase() === key) {
                    values.push(header[1]);
                }
            }
        } else {
            const values_list = this.headers[key] || [];
            for (const entry of values_list) {
                values.push(entry[1]);
            }
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
        const key = name.toLowerCase();

        if (this.native_message) {
            const len = this.length;
            for (let i = 0; i < len; ++i) {
                const header = this.native_message.get_header(i);
                if (header[0].toLowerCase() === key) {
                    return header[1];
                }
            }

            return default_value;
        } else {
            const values = this.headers[key];
            if (!values) {
                return default_value;
            }
            return values[0][1] || default_value;
        }
    }

    /**
     * Removes all values for the given name
     * @param name - The header to remove all values for
     */
    remove(name: string) {
        const key = name.toLowerCase();

        if (this.native_message) {
            for (let i = this.length - 1; i >= 0; --i) {
                const header = this.native_message.get_header(i);
                if (header[0].toLowerCase() === key) {
                    this.native_message.erase_header(i);
                }
            }
        } else {
            delete this.headers[key];
        }
    }

    /**
     * Removes a specific name/value pair
     * @param name - The header name to remove
     * @param value - The header value to remove
     */
    remove_value(name: string, value: string) {
        const key = name.toLowerCase();

        if (this.native_message) {
            for (let i = this.length - 1; i >= 0; --i) {
                const header = this.native_message.get_header(i);
                if (header[0].toLowerCase() === key && header[1] === value) {
                    this.native_message.erase_header(i);
                }
            }
        } else {
            let values = this.headers[key];
            for (let idx = 0; idx < values.length; ++idx) {
                const entry = values[idx];
                if (entry[1] === value) {
                    if (values.length === 1) {
                        delete this.headers[key];
                    } else {
                        delete values[idx];
                    }
                    return;
                }
            }
        }
    }

    /** Clears the entire header set */
    clear() {
        if (this.native_message) {
            for (let i = this.length - 1; i >= 0; --i) {
                this.native_message.erase_header(i);
            }
        } else {
            this.headers = {};
        }
    }

    /**
     * Iterator. Allows for:
     * let headers = new HttpHeaders();
     * ...
     * for (const header of headers) { }
    */
    *[Symbol.iterator]() {
        if (this.native_message) {
            const len = this.length;
            for (let i = 0; i < len; ++i) {
                yield this.native_message.get_header(i);
            }
        } else {
            for (const key in this.headers) {
                const values = this.headers[key];
                for (let entry of values) {
                    yield entry;
                }
            }
        }
    }

    _flatten(): string[][] {
        let flattened = [];
        for (const pair of this) {
            flattened.push(pair);
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
