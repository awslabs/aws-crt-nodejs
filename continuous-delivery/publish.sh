npm_pack_file=$(ls | grep -E 'aws-crt-[0-9.]*.tgz')
npm --userconfig ./.npmrc publish $npm_pack_file
