"""
Test to insure package size does not exceed limits
"""

import Builder
import os


class CrtSizeCheck(Builder.Action):
    def run(self, env):
        # Maximum package size (for current platform) in bytes
        # NOTE: if you increase this, you might also need to increase the
        # limit in continuous-delivery/pack.sh
        max_size = 6_000_000
        # size of current folder
        folder_size = 0
        # total size in bytes
        total_size = 0

        for root, dirs, files in os.walk(os.path.join(env.project.path, 'dist/bin')):
            for f in files:

                if 'aws-crt-nodejs.node' == f:
                    fp = os.path.join(root, f)
                    print(
                        f"{fp} file size: {os.stat(fp).st_size}")

                fp = os.path.join(root, f)
                folder_size += os.path.getsize(fp)

        print(f"dist/bin files size: {folder_size} bytes")
        total_size += folder_size
        folder_size = 0

        for root, dirs, files in os.walk(os.path.join(env.project.path, 'dist/browser')):

            for f in files:
                fp = os.path.join(root, f)
                folder_size += os.path.getsize(fp)

        print(f"dist/browser files size: {folder_size} bytes")
        total_size += folder_size
        folder_size = 0

        for root, dirs, files in os.walk(os.path.join(env.project.path, 'dist/common')):

            for f in files:
                fp = os.path.join(root, f)
                folder_size += os.path.getsize(fp)

        print(f"dist/common files size: {folder_size} bytes")
        total_size += folder_size
        folder_size = 0

        for root, dirs, files in os.walk(os.path.join(env.project.path, 'dist/native')):

            for f in files:
                fp = os.path.join(root, f)
                folder_size += os.path.getsize(fp)

        print(f"dist/native files size: {folder_size} bytes")
        total_size += folder_size
        folder_size = 0

        # source too
        for root, dirs, files in os.walk(os.path.join(env.project.path, 'lib')):

            for f in files:
                fp = os.path.join(root, f)
                folder_size += os.path.getsize(fp)

        print(f"lib files size: {folder_size} bytes")
        total_size += folder_size

        print(f"Total NPM package file size: {total_size} bytes")
        if total_size > max_size:
            raise Exception(f'NPM package exceeds size limit of {max_size} bytes.')
