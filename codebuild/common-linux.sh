#!/bin/bash

set -e
set -x

# build java package
cd $CODEBUILD_SRC_DIR
CFLAGS="-Werror" npm install
