#!/usr/bin/env bash
set -ex

# force a failure if there's no tag
git describe --tags
# now get the tag
CURRENT_TAG=$(git describe --tags | cut -f2 -dv)
# convert v0.2.12-2-g50254a9 to 0.2.12
CURRENT_TAG_VERSION=$(git describe --tags | cut -f1 -d'-' | cut -f2 -dv)

# go to previous directory
cd ..
# native source code
tar -cvzf aws-crt-$CURRENT_TAG_VERSION-source.tgz aws-crt-nodejs/crt
# omnibus package
tar -cvzf aws-crt-$CURRENT_TAG_VERSION-all.tgz aws-crt-nodejs/
# binaries
tar -cvzf aws-crt-$CURRENT_TAG_VERSION-binary.tgz aws-crt-nodejs/dist/bin

exit 0
