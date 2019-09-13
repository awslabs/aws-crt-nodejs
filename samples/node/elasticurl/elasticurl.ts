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

import { http, io } from "aws-crt";
import { PassThrough } from "stream";
import { TextDecoder } from "util";
const fs = require('fs');

type Args = { [index: string]: any };

const url = process.argv.pop() || "";
const yargs = require('yargs');
yargs.command('*', false, (yargs: any) => {
    yargs.option('url', {
        description: 'URL to make request to. HTTPS is assumed unless port 80 is specified or HTTP is specified in the scheme.',
        type: 'string',
        default: new URL(url)
    })
    .option('cacert', {
        description: 'FILE: path to a CA certficate file.',
        type: 'string'
    })
    .option('capath', {
        description: 'PATH: path to a directory containing CA files.',
        type: 'string'
    })
    .option('cert', {
        description: 'FILE: path to a PEM encoded certificate to use with mTLS',
        type: 'string'
    })
    .option('key', {
        description: 'FILE: Path to a PEM encoded private key that matches cert.',
        type: 'string'
    })
    .option('connect_timeout', {
        description: 'INT: time in milliseconds to wait for a connection.',
        type: 'number',
        default: 3000,
    })
    .option('header', {
        alias: 'H',
        description: 'LINE: line to send as a header in format [header-key]: [header-value]\n',
        type: 'array'
    })
    .option('data', {
        alias: 'd',
        description: 'STRING: Data to POST or PUT.',
        type: 'string',
        default: undefined,
        coerce: (value: string) => {
            if (value) {
                let stream = new PassThrough();
                stream.write(value);
                stream.end();
                return stream;
            }
            return value;
        }
    })
    .option('data_file', {
        description: 'FILE: File to read from file and POST or PUT.',
        type: 'string'
    })
    .option('method', {
        alias: 'M',
        description: 'STRING: Http Method verb to use for the request.',
        choices: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
        default: 'GET'
    })
    .option('get', {
        alias: 'G',
        description: 'uses GET for the verb'
    })
    .option('post', {
        alias: 'P',
        description: 'uses POST for the verb'
    })
    .option('head', {
        alias: 'I',
        description: 'uses HEAD for the verb'
    })
    .option('include', {
        alias: 'i',
        description: 'Includes headers in output',
        type: 'boolean',
        default: false
    })
    .option('insecure', {
        alias: 'k',
        description: 'Turns off X.509 validation',
        type: 'boolean',
        default: false
    })
    .option('output', {
        alias: 'o',
        description: 'FILE: dumps content-body to FILE instead of stdout.',
        type: 'string',
        default: process.stdout,
        coerce: (value: string) => {
            if (value && typeof value === 'string') {
                return fs.createWriteStream(value);
            }
            return value;
        }
    })
    .option('trace', {
        alias: 't',
        description: 'FILE: dumps logs to FILE instead of stderr.',
        type: 'string',
        default: undefined
    })
    .option('alpn_list', {
        alias: 'p',
        description: 'STRING: List of protocols for ALPN, semicolon delimited.'
    })
    .option('verbose', {
        alias: 'v',
        description: 'ERROR|WARN|INFO|DEBUG|TRACE: log level. Default is none.',
        choices: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'],
        default: 'NONE'
    })
    .help()
    .alias('help', 'h')
    .middleware((argv: Args) => {
        if (argv.get) {
            argv.method = 'GET';
        } else if (argv.post) {
            argv.method = 'POST';
        } else if (argv.head) {
            argv.method = 'HEAD';
        }

        if (argv.data_file) {
            argv.data = fs.createReadStream(argv.data_file);
        }
    }, true)
    .showHelpOnFail(false)
}, main).parse();

function init_logging(argv: Args) {
    if (argv.verbose !== 'NONE') {
        let level = io.LogLevel.NONE;
        switch (argv.verbose) {
            case 'ERROR':
                level = io.LogLevel.ERROR;
                break;
            case 'WARN':
                level = io.LogLevel.WARN;
                break;
            case 'INFO':
                level = io.LogLevel.INFO;
                break;
            case 'DEBUG':
                level = io.LogLevel.DEBUG;
                break;
            case 'TRACE':
            default:
                level = io.LogLevel.TRACE;
                break;
        }
        io.enable_logging(level, argv.trace);
    }
}

function init_tls(argv: Args) {
    if (argv.url.protocol !== 'https:') {
        return undefined;
    }

    const tls_options = new io.TlsContextOptions();
    tls_options.alpn_list = argv.alpn_list;
    tls_options.ca_file = argv.ca_file;
    tls_options.ca_path = argv.ca_path;
    tls_options.certificate_path = argv.cert;
    tls_options.verify_peer = !argv.insecure;
    return new io.ClientTlsContext(tls_options);
}

function main(argv: Args) {
    init_logging(argv);

    const client_bootstrap = new io.ClientBootstrap();
    const tls_ctx = init_tls(argv);
    const socket_options = new io.SocketOptions(io.SocketType.STREAM, io.SocketDomain.IPV4, argv.connect_timeout);
    
    // if port is not supplied, derive it from scheme
    let port = Number.parseInt(argv.url.port);
    if (argv.url.protocol === 'http:' && !argv.url.port) {
        port = 80;
    } else if (argv.url.protocol === 'https:' && !argv.url.port) {
        port = 443;
    }

    const decoder = new TextDecoder();

    const make_request = async (connection: http.HttpClientConnection, body?: string) => {
        const on_response = (status_code: Number, headers: http.HttpHeaders) => {
            console.log("Response Code: " + status_code.toString());
            if (argv.include) {
                for (let header of headers) {
                    console.log(`${header[0]}: ${header[1]}`);
                }
            }
        };

        const on_body = (body: ArrayBuffer) => {
            const body_str = decoder.decode(body);
            argv.output.write(body_str);
        }

        let headers = new http.HttpHeaders([
            ["host", argv.url.hostname],
            ["user-agent", "elasticurl.js 1.0, Powered by the AWS Common Runtime."],
        ]);
        let body_stream: io.InputStream | undefined = undefined;
        if (body) {
            headers.add('content-length', body.length.toString());
            let stream = new PassThrough();
            stream.write(body);
            stream.end();
            body_stream = new io.InputStream(stream);
        }
        if (argv.header) {
            for (const header of argv.header) {
                let h = header.split(/:\s*/, 2);
                headers.add(h[0], h[1]);
            }
        }

        return new Promise((resolve, reject) => {
            const request = new http.HttpRequest(argv.method, argv.url.toString(), body_stream, headers);
            const stream = connection.request(request);
            stream.on('response', on_response);
            stream.on('data', on_body);
            stream.on('error', (error: Error) => {
                reject(error);
            })
            stream.on('end', () => {
                connection.close();
                resolve();
            });
        });
    };

    const finish = (error?: Error) => {
        if (error) {
            console.log("EXCEPTION: " + error);
        }
        if (argv.output !== process.stdout) {
            argv.output.close();
        }
    }

    http.HttpClientConnection.create(
        client_bootstrap,
        undefined,
        undefined,
        argv.url.hostname,
        port,
        socket_options,
        tls_ctx)
        .then((connection) => {
            if (argv.data) {
                return new Promise((resolve, reject) => {
                    let data = "";
                    argv.data.on('error', (error: Error) => {
                        reject(error);
                    })
                    argv.data.on('data', (chunk: Buffer | string) => {
                        data += chunk.toString();
                    });
                    argv.data.on('end', () => {
                        resolve(make_request(connection, data));
                    });
                });
            }
            
            return make_request(connection);
        })
        .catch((reason) => {
            finish(reason);
        })
        .then((error_code) => {
            finish();
        })
        .catch((reason) => {
            finish(reason);
        });
}
