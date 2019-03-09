#!/bin/bash

set -e
set -x

# build nodejs package
cd $CODEBUILD_SRC_DIR

git submodule update --init

CFLAGS="-Werror" npm ci

strace -fv node --trace-warnings -p "try { require('./build/Release/aws-crt-nodejs') } catch (e) { console.log('ERROR: ', e); }"

