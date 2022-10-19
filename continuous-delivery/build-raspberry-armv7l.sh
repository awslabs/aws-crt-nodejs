#!/usr/bin/env bash
set -ex

sudo chmod -R 777 .
# allow npm to install to access /root/
sudo chmod -R 777 /root/
sudo npm install --unsafe-perm --allow-root=true .