#!/bin/bash

set -e

if test -f "/tmp/setup_proxy_test_env.sh"; then
    source /tmp/setup_proxy_test_env.sh
fi

env

git submodule update --init

# build package
pwd
cd $CODEBUILD_SRC_DIR

export AWS_CRT_MEMORY_TRACING=2
pwd
npm --version
node --version
npm install
ls -las
npm run install
ls -las
npm test

