#!/usr/bin/env bash
set -ex

chmod -R a+w .
# allow npm to install to access /root/
chmod -R a+w /root/
npm install --unsafe-perm --allow-root=true .
