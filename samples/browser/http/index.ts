/* Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { http } from "aws-crt";
import jquery = require("jquery");
const $: JQueryStatic = jquery;

function log(msg: string) {
    $('#console').append(`<pre>${msg}</pre>`);
}

async function main() {
    const url = new URL('https://aws-crt-test-stuff.s3.amazonaws.com/random_32_byte.data');
    const connection_manager = new http.HttpClientConnectionManager(
        url.host,
        443,
        4
    );
    let promises = [];
    for (let idx = 0; idx < 10; ++idx) {
        log(`Request(${idx}) start`)
        const conn = connection_manager.acquire()
            .then((connection) => {
                log(`Request(${idx}) Ready`);
                let request = new http.HttpRequest(
                    'GET',
                    url.pathname);
                log(`Request(${idx}) Requesting ${url}`);
                let stream = connection.request(request);
                stream.on('response', (status_code, headers) => {
                    log(`Request(${idx}) Status Code: ${status_code}`);
                    log(`Request(${idx}) Headers:`);
                    for (let header of headers) {
                        log(`    ${header[0]}: ${header[1]}`);
                    }
                });
                stream.on('data', (body_data) => {
                    log(`Request(${idx}) BODY BEGIN`);
                    let body = new TextDecoder('utf8').decode(body_data);
                    log(`    ${body}`);
                    log(`Request(${idx}) BODY END`);
                });
                stream.on('end', () => {
                    log(`Request(${idx}) Stream Done`);
                    connection_manager.release(connection);
                });
                stream.on('error', (error) => {
                    log(`Request(${idx}) STREAM ERROR: ${error}`);
                });
                connection.on('error', (error) => {
                    log(`Request(${idx}) CONNECTION ERROR: ${error}`);
                });                    
            });
        promises.push(conn);
    }
    await Promise.all(promises);
    connection_manager.close();
}

$(document).ready(() => {
    main();
});

