#!/usr/bin/env bash

set -ex

# build x64 (assumes we're running on Intel)
npm install --unsafe-perm

# build arm64
node ./scripts/build --force-arch arm64
