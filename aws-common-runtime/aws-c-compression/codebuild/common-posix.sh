#!/bin/bash

set -e

CMAKE_ARGS="$@"
BUILD_PATH="/tmp/builds"
mkdir -p $BUILD_PATH
INSTALL_PATH="$BUILD_PATH/install"
mkdir -p $INSTALL_PATH

function install_library {
    pushd $BUILD_PATH
    git clone https://github.com/awslabs/$1.git
    cd $1

    if [ -n "$2" ]; then
        git checkout $2
    fi

    cmake -DCMAKE_INSTALL_PREFIX=$INSTALL_PATH -DCMAKE_PREFIX_PATH=$INSTALL_PATH -DENABLE_SANITIZERS=ON $CMAKE_ARGS ./
    make install

    popd
}

install_library aws-c-common

if [ "$CODEBUILD_SRC_DIR" ]; then
    cd $CODEBUILD_SRC_DIR
fi

mkdir build
cd build
cmake -DCMAKE_INSTALL_PREFIX=$INSTALL_PATH -DCMAKE_PREFIX_PATH=$INSTALL_PATH -DENABLE_SANITIZERS=ON $CMAKE_ARGS ../
make

LSAN_OPTIONS=verbosity=1:log_threads=1 ctest --output-on-failure
