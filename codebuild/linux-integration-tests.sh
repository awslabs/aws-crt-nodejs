#!/bin/bash

set -ex

if test -f "/tmp/setup_integration_test_env.sh"; then
    source /tmp/setup_integration_test_env.sh
fi

env

git submodule update --init

# build package
cd $CODEBUILD_SRC_DIR

export AWS_CRT_MEMORY_TRACING=2

npm install
npm run install
npm test

