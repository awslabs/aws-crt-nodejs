#!/bin/bash

set -e
set -x

# build nodejs package
cd $CODEBUILD_SRC_DIR

git submodule update --init

CFLAGS="-Werror" npm ci

node --diagnostic-report-on-fatal-error -p "require('./build/Release/aws-crt-nodejs')"

