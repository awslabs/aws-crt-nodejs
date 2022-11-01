#!/usr/bin/env bash
set -e
set -x

# force a failure if there's no tag
git describe --tags
# now get the tag
CURRENT_TAG=$(git describe --tags | cut -f2 -dv)
# convert v0.2.12-2-g50254a9 to 0.2.12
CURRENT_TAG_VERSION=$(git describe --tags | cut -f1 -d'-' | cut -f2 -dv)
# if there's a hash on the tag, then this is not a release tagged commit
if [ "$CURRENT_TAG" != "$CURRENT_TAG_VERSION" ]; then
    echo "Current tag version is not a release tag, cut a new release if you want to publish."
    exit 1
fi

PUBLISHED_TAG_VERSION=`npm show aws-crt version`
# split the version by "."
PUBLISHED_NUMS=(${PUBLISHED_TAG_VERSION//./ })
TAG_NUMS=(${CURRENT_TAG_VERSION//./ })

check_version_num(){
   TAG_NUMS=$1
   PUBLISHED_NUMS=$2
   if [ $TAG_NUMS -gt $PUBLISHED_NUMS ] ;
    then
        # The first larger number means it's not published before
        echo "$CURRENT_TAG_VERSION currently does not exist in npm, allowing pipeline to continue."
        exit 0
    elif [ $TAG_NUMS -lt $PUBLISHED_NUMS ] ;
        then
            # Don't accept smaller number
            echo "Tag version $CURRENT_TAG_VERSION is wrong. The published version is $PUBLISHED_TAG_VERSION, cut a new tag if you want to upload another version."
            exit 1
    fi
}

check_version_num ${TAG_NUMS[0]} ${PUBLISHED_NUMS[0]}
# If not exit yet, means the previous number is equal, check the next number
check_version_num ${TAG_NUMS[1]} ${PUBLISHED_NUMS[1]}
check_version_num ${TAG_NUMS[2]} ${PUBLISHED_NUMS[2]}

# all three number are equal
echo "Tag version $CURRENT_TAG_VERSION is wrong. The published version is $PUBLISHED_TAG_VERSION, cut a new tag if you want to upload another version."
exit 1
