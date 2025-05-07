import sys
import subprocess
import os
import re

def main():
    if sys.platform != 'darwin':
        print("WARNING: Not running on macos. Skip the compatibility validation.")
        # Exit quietly if run on a non-darwin machine.
        sys.exit(0)

    # Default target macos version setup in script/build.js, set by CMAKE_OSX_DEPLOYMENT_TARGET
    supported_version = "10.15"
    arch = "x64"

    if len(sys.argv) > 1:
        # Parsing the macos archtecture
        arch = sys.argv[1]
    else:
        # If the archtecture is not set, set from "uname"
        arch = os.uname().machine
        print("uname result {}".format(arch))

    lib_path = "dist/bin/darwin-{}-cruntime/aws-crt-nodejs.node".format(arch)

    otool_cmd = "otool -l {} | grep -A5 -E 'LC_VERSION_MIN_MACOSX|LC_BUILD_VERSION' | grep -E '(version|minos)' | head -1 | tr -s ' ' | cut -f3 -d' ' | tr -d '[:space:]'".format(lib_path)

    print("Start to validate the build binary for MacOS with architecture {}, expected min os version: {}".format(arch,supported_version))
    result = subprocess.check_output(otool_cmd, shell=True).decode("utf-8")

    if result != supported_version:
        # Failed
        print("Failed the compatibility validation on MacOS architecture {}, expected '{}' and built '{}'".format(arch, supported_version, result))
        sys.exit(1)

    print("Pass the compatibility validation on MacOS architecture {} with min supported os version '{}'".format(arch,result))
    sys.exit(0)

if __name__ == "__main__":
    main()
