#!/usr/bin/env bash

set -ex

# build x64 (assumes we're running on Intel)
npm install --unsafe-perm

# build arm64
# NOTE: This is the only build job that compiles for two different architectures.
# Our release pipeline doesn't currently have an arm64 OSX machine,
# so we use the x64 OSX machine create both types of binaries.
node ./scripts/build --force-arch arm64
