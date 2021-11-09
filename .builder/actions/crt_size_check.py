"""
Test to insure package size does not exceed limits
"""

import Builder
import os


class CrtSizeCheck(Builder.Action):
    def run(self, env):
        # Maximum package size in bytes
        max_size = 5_000_000
        # Maximum dist folder size in bytes
        total_size = 0

        for root, dirs, files in os.walk(os.path.join(env.project.path, 'dist/native/')):

            for f in files:
                fp = os.path.join(root, f)
                total_size += os.path.getsize(fp)

        print(f"/native files total size: {total_size} bytes")

        for root, dirs, files in os.walk(os.path.join(env.project.path, 'dist/')):
            for f in files:
                if 'aws-crt-nodejs.node' == f:
                    fp = os.path.join(root, f)
                    print(
                        f"{fp} file size: {str(os.stat(fp).st_size)}")
                    if os.stat(fp).st_size <= max_size:
                        total_size += os.path.getsize(fp)
                    else:
                        raise Exception(f"{fp} exceeds file size limit")

        print(f"Total NPM package file size: {str(total_size)} bytes")
        if total_size > max_size:
            raise Exception('NPM package exceeds size limit')
