#!/usr/bin/env bash

set -ex

IMAGE_NAME=$1
shift

# Pry the builder version this CRT is using out of ci.yml
BUILDER_VERSION=$(cat .github/workflows/ci.yml | grep 'BUILDER_VERSION:' | sed 's/\s*BUILDER_VERSION:\s*\(.*\)/\1/')
echo "Using builder version ${BUILDER_VERSION}"

aws ecr get-login-password | docker login 123124136734.dkr.ecr.us-east-1.amazonaws.com -u AWS --password-stdin
export DOCKER_IMAGE=123124136734.dkr.ecr.us-east-1.amazonaws.com/${IMAGE_NAME}:${BUILDER_VERSION}

export BRANCH_TAG=$(git describe --tags)
docker run --mount type=bind,src=$(pwd),dst=/root/aws-crt-nodejs --env CXXFLAGS $DOCKER_IMAGE --version=${BUILDER_VERSION} build -p aws-crt-nodejs --branch ${BRANCH_TAG} run_tests=false
docker container prune -f
