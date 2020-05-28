#!/usr/bin/env bash

pushd `dirname $0` > /dev/null

npx typedoc

popd > /dev/null
