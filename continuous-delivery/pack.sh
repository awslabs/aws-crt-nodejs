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
# sha256 checksum
SOURCE_SHA256=$(sha256sum aws-crt-$CURRENT_TAG_VERSION-source.tgz | awk '{print $1}')
echo -n $SOURCE_SHA256 > aws-crt-$CURRENT_TAG_VERSION-source.sha256

# omnibus package
tar -cvzf aws-crt-$CURRENT_TAG_VERSION-all.tgz aws-crt-nodejs/
# sha256 checksum
SOURCE_SHA256=$(sha256sum aws-crt-$CURRENT_TAG_VERSION-all.tgz | awk '{print $1}')
echo -n $SOURCE_SHA256 > aws-crt-$CURRENT_TAG_VERSION-all.sha256

# binaries
tar -cvzf aws-crt-$CURRENT_TAG_VERSION-binary.tgz aws-crt-nodejs/dist/bin
# sha256 checksum
SOURCE_SHA256=$(sha256sum aws-crt-$CURRENT_TAG_VERSION-binary.tgz | awk '{print $1}')
echo -n $SOURCE_SHA256 > aws-crt-$CURRENT_TAG_VERSION-binary.sha256


# npm pack
cd aws-crt-nodejs
npm install --unsafe-perm
npm pack --unsafe-perm
cp aws-crt-*.tgz ..

# Check unzip npm package size
cd ..
UNZIP="unzip_pack"
mkdir $UNZIP
tar -xf aws-crt-$CURRENT_TAG_VERSION.tgz -C $UNZIP
PACK_FILE_SIZE_KB=$(du -sk $UNZIP | awk '{print $1}')
if expr $PACK_FILE_SIZE_KB \< 12000 ; then
    # True, the package size is smaller than 12 MB, return 0
    exit 0
fi
# False
echo "Package size is too large"
exit -1
