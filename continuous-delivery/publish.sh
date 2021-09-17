#!/usr/bin/env bash
set -ex

# now get the tag
CURRENT_TAG=$(git describe --tags | cut -f2 -dv)

cd $CODEBUILD_SRC_DIR_aws_crt_nodejs_packed
aws secretsmanager get-secret-value --secret-id prod/npm-registry/.npmrc --region us-east-1 | jq -r .SecretString > .npmrc

npm --userconfig ./.npmrc publish aws-crt-$CURRENT_TAG.tgz
