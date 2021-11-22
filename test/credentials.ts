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

import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';

export class Config {
    static readonly region = 'us-east-1';

    public endpoint = "";
    public certificate = "";
    public private_key = "";

    public access_key = "";
    public secret_key = "";
    public session_token = "";

    static _cached: Config;
};

export async function fetch_credentials(): Promise<Config> {
    if (Config._cached) {
        return Config._cached;
    }

    const client = new SecretsManagerClient({ region: Config.region });

    const config = new Config();
    const getSecret = (field: keyof Config, key: string = field) => {
        return client.send(new GetSecretValueCommand({ SecretId: `unit-test/${key}` }))
        .then(data => { config[field] = data.SecretString! })
    }

    const promises = [
        getSecret('endpoint'),
        getSecret('certificate'),
        getSecret('private_key', 'privatekey'),
        client.send(new GetSecretValueCommand({ SecretId: 'unit-test/cognitopool' }))
        .then((data) => fromCognitoIdentityPool({
                identityPoolId: data.SecretString!,
                clientConfig: { region: "us-east-1" }
            })()
        )
        .then((credentials) => {
            config.access_key = credentials.accessKeyId;
            config.secret_key = credentials.secretAccessKey;
            config.session_token = credentials.sessionToken;
        })
    ];
    await Promise.all(promises);
    Config._cached = config;
}
