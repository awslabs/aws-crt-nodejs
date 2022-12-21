#!/usr/bin/env bash
set -ex

pushd `dirname $0` > /dev/null

# clean
rm -rf docs/

# build
npx typedoc --options ./docsrc/typedoc-node.json --sort enum-value-ascending
npx typedoc --options ./docsrc/typedoc-browser.json --sort enum-value-ascending
cp docsrc/index.html docs/index.html

popd > /dev/null
