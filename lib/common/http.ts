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

export type HttpHeader = [string, string];

export interface HttpHeaders {
    readonly length: number;

    /**
     * Add a name/value pair
     * @param name - The header name
     * @param value - The header value
    */
    add(name: string, value: string): void;

    /**
     * Set a name/value pair, replacing any existing values for the name
     * @param name - The header name
     * @param value - The header value
    */
    set(name: string, value: string): void;

    /**
     * Get the list of values for the given name
     * @param name - The header name to look for
     * @return List of values, or empty list if none exist
     */
    get_values(name: string): string[];

    /**
     * Gets the first value for the given name, ignoring any additional values
     * @param name - The header name to look for
     * @param default_value - Value returned if no values are found for the given name
     * @return The first header value, or default if no values exist
     */
    get(name: string, default_value?: string): string;

    /**
     * Removes all values for the given name
     * @param name - The header to remove all values for
     */
    remove(name: string): void;

    /**
     * Removes a specific name/value pair
     * @param name - The header name to remove
     * @param value - The header value to remove
     */
    remove_value(name: string, value: string): void;

    /** Clears the entire header set */
    clear(): void;

    /**
     * Iterator. Allows for:
     * let headers = new HttpHeaders();
     * ...
     * for (const header of headers) { }
    */
    [Symbol.iterator](): Iterator<HttpHeader>;

    _flatten(): HttpHeader[];
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
