"""
Test to insure package size does not exceed limits
"""

import Builder
import os


class CrtSizeCheck(Builder.Action):
    def run(self, env):
        print('Searching for aws-crt-nodejs.node')
        # Maximum package size in bytes
        max_node_size = 5_000_000
        # Maximum dist folder size in bytes
        max_dist_size = 10_000_000
        # Total size of files in dist folder
        total_size = 0
        # full path of aws-crt-nodejs.node
        file_path = None

        for root, dirs, files in os.walk(os.path.join(env.project.path, '/dist')):
            for f in files:
                fp = os.path.join(root, f)
                total_size += os.path.getsize(fp)

            if 'aws-crt-nodejs.node' in files:
                file_path = os.path.join(
                    root, 'aws-crt-nodejs.node')
                print(f"{file_path} found")

        print(f"Total dist folder file size: {str(total_size)} bytes")
        if total_size > max_dist_size:
            raise Exception('dist folder exceeds size limit')

        if file_path is not None:
            print(f"{file_path} file size: {str(os.stat(file_path).st_size)}")
            if os.stat(file_path).st_size <= max_node_size:
                print(f"{file_path} is <= {str(max_node_size)} bytes")
            else:
                raise Exception('Exceeds file size limit')
        else:
            raise Exception('aws-crt-nodejs.node not found')
