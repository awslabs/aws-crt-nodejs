#!/usr/bin/env python3
import argparse
import fnmatch
from genericpath import isfile
import os
import subprocess
import sys
import json

LOCK_FILE_NAME = "package-lock.json"
LOCKFILE_VERSION_NAME = "lockfileVersion"
LOCKFILE_VALID_VERSION = 1

ERROR_MSG = """
ERROR: You have have changed the version for package files.

As the library supports npm 6, please make sure we use version {LOCKFILE_VALID_VERSION}
for {LOCK_FILE_NAME}
"""

def get_packagelock_version():
    try:
        with open(LOCK_FILE_NAME) as f:
            text = f.read()
            lockfile_json = json.loads(text)
            return lockfile_json[LOCKFILE_VERSION_NAME]
    except ValueError as e:
        print('invalid json: %s' % e)
        return None # or: raise

def main():
    any_invalid = False
    parser = argparse.ArgumentParser(
        description="Detect edits to code-generated files")
    parser.add_argument('--diff-branch', default='main',
                        help="Branch/commit to diff against")
    parser.add_argument('--diff-repo', default='origin',
                        help="Repository to diff against")
    args = parser.parse_args()

    # chdir to project root
    os.chdir(os.path.join(os.path.dirname(__file__), '..'))

    # get all files with diffs
    git_cmd = ['git', 'diff', '--name-only',
               f"{args.diff_repo}/{args.diff_branch}"]
    git_result = subprocess.run(git_cmd, check=True, stdout=subprocess.PIPE)
    diff_files = git_result.stdout.decode().splitlines()

    # figure out which files were code-generated
    print('Checking files with diffs...')
    if LOCK_FILE_NAME in diff_files:
        version = get_packagelock_version()
        if version is None:
            print("ERROR: Failed to process the {LOCK_FILE_NAME}. The file is invalid.")
            sys.exit(-1)
        else:
            print(f"Detected {LOCK_FILE_NAME} version: {version}")
            if version != LOCKFILE_VALID_VERSION:
                print(ERROR_MSG)
                sys.exit(-1)
    else:
        print("No target files were changed.")

if __name__ == '__main__':
    main()
