#!/usr/bin/env bash
set -ex

npm_pack_file=$(ls | grep -E 'aws-crt-[0-9.]*.tgz')
echo $npm_pack_file
npm --userconfig ./.npmrc publish $npm_pack_file
