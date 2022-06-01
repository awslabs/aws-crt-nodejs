#!/usr/bin/env bash
set -ex

# note: test-version-exists.sh checked that we were ready for release in an earlier pipeline stage
CURRENT_TAG=$(git describe --tags | cut -f2 -dv)

# go to previous directory
cd ..

# native source code
tar -cvzf aws-crt-$CURRENT_TAG-source.tgz aws-crt-nodejs/crt
# sha256 checksum
SOURCE_SHA256=$(sha256sum aws-crt-$CURRENT_TAG-source.tgz | awk '{print $1}')
echo -n $SOURCE_SHA256 > aws-crt-$CURRENT_TAG-source.sha256

# omnibus package
tar -cvzf aws-crt-$CURRENT_TAG-all.tgz aws-crt-nodejs/
# sha256 checksum
SOURCE_SHA256=$(sha256sum aws-crt-$CURRENT_TAG-all.tgz | awk '{print $1}')
echo -n $SOURCE_SHA256 > aws-crt-$CURRENT_TAG-all.sha256

# binaries
tar -cvzf aws-crt-$CURRENT_TAG-binary.tgz aws-crt-nodejs/dist/bin
# sha256 checksum
SOURCE_SHA256=$(sha256sum aws-crt-$CURRENT_TAG-binary.tgz | awk '{print $1}')
echo -n $SOURCE_SHA256 > aws-crt-$CURRENT_TAG-binary.sha256


# npm pack
cd aws-crt-nodejs
npm install --unsafe-perm
npm pack --unsafe-perm
cp aws-crt-*.tgz ..

# Check unzip npm package size
cd ..
UNZIP="unzip_pack"
mkdir $UNZIP
tar -xf aws-crt-$CURRENT_TAG.tgz -C $UNZIP
PACK_FILE_SIZE_KB=$(du -sk $UNZIP | awk '{print $1}')
if expr $PACK_FILE_SIZE_KB \> "$((14 * 1024))" ; then
    # the package size is larger than 14 MB, return -1
    echo "Package size is too large"
    exit -1
fi
exit 0
