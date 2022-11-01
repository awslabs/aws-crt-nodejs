#!/bin/bash
#run build script in manylinux2014 docker image
set -ex

DOCKER_IMAGE=123124136734.dkr.ecr.us-east-1.amazonaws.com/aws-crt-manylinux2014-aarch64:latest

$(aws --region us-east-1 ecr get-login --no-include-email)

docker pull $DOCKER_IMAGE

# NOTE: set --user to avoid "dubious ownership" errors from git in the bind mounted directory
docker run --rm \
    --mount type=bind,source=`pwd`,target=/aws-crt-nodejs \
    --user "$(id -u):$(id -g)" \
    --workdir /aws-crt-nodejs \
    --entrypoint /bin/bash \
    $DOCKER_IMAGE \
    continuous-delivery/build-manylinux2014-aarch64.sh
