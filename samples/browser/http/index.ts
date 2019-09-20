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
    // This will fail unless you disable CORS
    const url = new URL('https://aws-crt-test-stuff.s3.amazonaws.com/random_32_byte.data');
    let connection = new http.HttpClientConnection(
        url.host,
        443
    );
    connection.on('connect', () => {
        log('Ready');
        let request = new http.HttpRequest(
            'GET',
            url.pathname);
        log(`Requesting ${url}`);
        let stream = connection.request(request);
        stream.on('response', (status_code, headers) => {
            log(`Status Code: ${status_code}`);
            log('HEADERS:');
            for (let header of headers) {
                log(`${header[0]}: ${header[1]}`);
            }
        });
        stream.on('data', (body_data) => {
            log('BODY BEGIN');
            let body = new TextDecoder('utf8').decode(body_data);
            log(body);
            log('BODY END');
        });
        stream.on('end', () => {
            log('Stream Done');
        });
        stream.on('error', (error) => {
            log(`STREAM ERROR: ${error}`);
        });
    });
    connection.on('close', () => {
        log('Connection Done.');
    });
    connection.on('error', (error) => {
        log(`CONNECTION ERROR: ${error}`);
    });
}

$(document).ready(() => {
    main();
});

