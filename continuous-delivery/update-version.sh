#!/usr/bin/env bash
set -ex

# note: test-version-exists.sh checked that we were ready for release in an earlier pipeline stage
CURRENT_TAG=$(git describe --tags | cut -f2 -dv)

sed --in-place -E "s/\"version\": \".+\"/\"version\": \"${CURRENT_TAG}\"/" package.json

exit 0
