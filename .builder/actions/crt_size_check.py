"""
Test to insure package size does not exceed limits
"""

import Builder
import os


class CrtSizeCheck(Builder.Action):
    def run(self, env):
        # Maximum package size in bytes
        max_node_size = 5_000_000
        # Maximum dist folder size in bytes
        max_dist_size = 50_000_000
        # Size of current folder
        current_folder_size = 0
        # Total size of files in dist folder
        total_size = 0

        for root, dirs, files in os.walk(os.path.join(env.project.path, 'dist/')):
            current_folder_size = 0

            for f in files:
                fp = os.path.join(root, f)
                current_folder_size += os.path.getsize(fp)

                if 'aws-crt-nodejs.node' == f:
                    print(
                        f"NODE FOUND: {fp} file size: {str(os.stat(fp).st_size)}")
                    if os.stat(fp).st_size <= max_node_size:
                        print(f"{fp} is <= {str(max_node_size)} bytes")
                    else:
                        raise Exception(f"{fp} exceeds file size limit")

            if current_folder_size > 0:
                print(f"{root} = {str(current_folder_size)} bytes")
                total_size += current_folder_size

        print(f"Total /dist folder file size: {str(total_size)} bytes")
        if total_size > max_dist_size:
            raise Exception('/dist folder exceeds size limit')
