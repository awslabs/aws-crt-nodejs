#!/bin/bash

set -e
set -x

# build nodejs package
cd $CODEBUILD_SRC_DIR

git submodule update --init

CFLAGS="-Werror" npm install

node -p "require('./dist/lib/index')"

