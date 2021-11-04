"""
Test to insure package size does not exceed limits
"""

import Builder
import os


class CrtSizeCheck(Builder.Action):
    def run(self, env):
        print('Searching for aws-crt-nodejs.node')
        # Maximum package size in bytes
        max_size = 10000000

        for root, dirs, files in os.walk(os.getcwd() + '/dist'):
            if 'aws-crt-nodejs.node' in files:
                file_path = os.path.join(
                    root, 'aws-crt-nodejs.node')
                print(file_path + ' found')

        if os.path.isfile(file_path):
            print(file_path + ' file size: ' + str(os.stat(file_path).st_size))
            if os.stat(file_path).st_size <= max_size:
                print(file_path + " is <= " + str(max_size) + " bytes")
            else:
                raise Exception('Exceeds file size limit')
        else:
            raise Exception('aws-crt-nodejs.node not found')
