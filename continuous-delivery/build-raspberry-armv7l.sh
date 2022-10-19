#!/usr/bin/env bash
set -ex

chmod a+x builder
./builder build --project=aws-crt-nodejs --skip-install run_tests=false
