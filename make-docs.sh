#!/usr/bin/env bash

pushd `dirname $0` > /dev/null

npx typedoc --options ./typedoc-node.json
npx typedoc --options ./typedoc-browser.json

popd > /dev/null
