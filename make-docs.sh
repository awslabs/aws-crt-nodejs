#!/usr/bin/env bash
set -e

pushd `dirname $0` > /dev/null

# clean
rm -rf docs/

# build
npx typedoc --options ./docsrc/typedoc-node.json
npx typedoc --options ./docsrc/typedoc-browser.json
cp docsrc/index.html docs/index.html

popd > /dev/null
