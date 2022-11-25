/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { SecretsManager, CognitoIdentityCredentials } from 'aws-sdk';

export class Config {
    static readonly region = 'us-east-1';

    public endpoint = "";
    public certificate = "";
    public private_key = "";

    public ecc_certificate = "";
    public ecc_private_key = "";

    public access_key = "";
    public secret_key = "";
    public session_token = "";

    configured() {
        return this.certificate
            && this.private_key
            && this.endpoint
            && this.access_key
            && this.secret_key
            && this.session_token
            && this.ecc_certificate
            && this.ecc_private_key;
    }

    static _cached: Config;
};

export async function fetch_credentials(): Promise<Config> {
    if (Config._cached) {
        return Config._cached;
    }

    return new Promise((resolve, reject) => {
        try {
            const timeout = setTimeout(reject, 5000);
            const client = new SecretsManager({
                region: Config.region,
                httpOptions: {
                    connectTimeout: 3000,
                    timeout: 5000
                }
            });

            const config = new Config();
            const resolve_if_done = () => {
                if (config.configured()) {
                    clearTimeout(timeout);
                    Config._cached = config;
                    resolve(config);
                }
            }

            client.getSecretValue({ SecretId: 'unit-test/endpoint' }, (error, data) => {
                if (error) {
                    reject(error);
                }

                try {
                    config.endpoint = data.SecretString as string;
                } catch (err) {
                    reject(err);
                }

                resolve_if_done();
            });
            client.getSecretValue({ SecretId: 'unit-test/certificate' }, (error, data) => {
                if (error) {
                    reject(error);
                }

                try {
                    config.certificate = data.SecretString as string;
                } catch (err) {
                    reject(err);
                }

                resolve_if_done();
            });
            client.getSecretValue({ SecretId: 'unit-test/privatekey' }, (error, data) => {
                if (error) {
                    reject(error);
                }

                try {
                    config.private_key = data.SecretString as string;
                } catch (err) {
                    reject(err);
                }

                resolve_if_done();
            });

            client.getSecretValue({ SecretId: 'ecc-test/certificate' }, (error, data) => {
                if (error) {
                    reject(error);
                }

                try {
                    config.ecc_certificate = data.SecretString as string;
                } catch (err) {
                    reject(err);
                }

                resolve_if_done();
            });

            client.getSecretValue({ SecretId: 'ecc-test/privatekey' }, (error, data) => {
                if (error) {
                    reject(error);
                }

                try {
                    config.ecc_private_key = data.SecretString as string;
                } catch (err) {
                    reject(err);
                }

                resolve_if_done();
            });

            client.getSecretValue({ SecretId: 'unit-test/cognitopool' }, (error, data) => {
                if (error) {
                    return reject(error);
                }

                const credentials = new CognitoIdentityCredentials({
                    IdentityPoolId: data.SecretString as string,
                }, {
                    region: "us-east-1",
                });
                credentials.refresh((err) => {
                    if (err) {
                        return reject(`Error fetching cognito credentials: ${err.message}`);
                    }
                    config.access_key = credentials.accessKeyId;
                    config.secret_key = credentials.secretAccessKey;
                    config.session_token = credentials.sessionToken;

                    resolve_if_done();
                });
            });
        } catch (err) {
            reject(err);
        }
    });
}
