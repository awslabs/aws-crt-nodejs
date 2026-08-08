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

# NPM does not have an hard limit for the package size, however, the Node.js CLI memory limits 
# create an effective maximum threshold. Reference to https://github.com/npm/npm/issues/12750. 
# The thread is old, while I did not find any update regards to the size limit. For now, using 
# 100 MB size limit as a safe threadhold.
NPM_FILE_SIZE_LIMIT_KB=$((100*1024))

mkdir $UNZIP
tar -xf aws-crt-$CURRENT_TAG.tgz -C $UNZIP
PACK_FILE_SIZE_KB=$(du -sk $UNZIP | awk '{print $1}')
echo "Current package size: ${PACK_FILE_SIZE_KB}"
if expr $PACK_FILE_SIZE_KB \> $NPM_FILE_SIZE_LIMIT_KB ; then
    # the package size is too large
    echo "Package size is too large!"
    exit 1
fi
exit 0
