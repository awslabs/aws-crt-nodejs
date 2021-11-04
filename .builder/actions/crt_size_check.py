import Builder
import os


class CrtSizeCheck(Builder.Action):

    def run(self, env):
        print("CrtSizeCheck running")
        file_path = r"/Volumes/workplace/ticket/aws-crt-nodejs/scripts/tsc.js"

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
