import Builder
import os


class CrtSizeCheck(Builder.Action):

    def run(self, env):

        print('Searching for aws-crt-nodejs.node')

        for root, dirs, files in os.walk(os.getcwd() + '/dist'):
            if 'aws-crt-nodejs.node' in files:
                file_path = os.path.join(
                    root, 'aws-crt-nodejs.node')
                print(file_path + ' found')

        if os.path.isfile(file_path):
            print(file_path + ' file size: ' + str(os.stat(file_path).st_size))
            if os.stat(file_path).st_size <= 10000000:
                print(file_path + " is <= 10000000 bytes")
            else:
                print(file_path + " is > than 10000000 bytes")
                raise Exception('Exceeds file size limit')
        else:
            raise Exception('aws-crt-nodejs.node not found')
