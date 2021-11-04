import Builder
import os


class CrtSizeCheck(Builder.Action):

    def run(self, env):
        print("CrtSizeCheck running")
        # Code to search dist folder for aws-crt-nodejs.node file location
        dist_folder_path = '../../dist'
        file_folder_path = dist_folder_path + '/bin/darwin-x64/'

        file_path = file_folder_path + 'aws-crt-nodejs.node'

        if os.path.isfile(file_path):
            print(file_path + " found")
            if os.stat(file_path).st_size <= 12000:
                print(file_path + " is <= 12000 bytes")
            else:
                print(file_path + " is > than 12000 bytes")
                raise Exception('Exceeds file size limit')
        else:
            print(file_path + " does not exist")
            raise Exception('File not found')
