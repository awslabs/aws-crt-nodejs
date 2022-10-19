#!/bin/bash
#run build script in manylinux2014 docker image
set -ex

DOCKER_IMAGE=123124136734.dkr.ecr.us-east-1.amazonaws.com/raspbian-bullseye-arm7l:latest

$(aws --region us-east-1 ecr get-login --no-include-email)

docker pull $DOCKER_IMAGE

docker run --rm --privileged multiarch/qemu-user-static --reset -p yes

docker run --rm \
    --privileged \
    --mount type=bind,source=`pwd`,target=/aws-crt-nodejs \
    --workdir /aws-crt-nodejs \
    --entrypoint /bin/bash \
    --platform linux/arm/v7 \
    $DOCKER_IMAGE \
    continuous-delivery/build-raspberry-armv7l.sh


# Upload the lib to S3
LIB_PATH=dist/bin
GIT_TAG=$(git describe --tags)
aws s3 cp --recursive $LIB_PATH s3://aws-crt-nodejs-pipeline/${GIT_TAG}/lib/
