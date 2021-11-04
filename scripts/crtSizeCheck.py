import os

file_path = r"file path"


def check_file_size(file_path):
    print("check_file_size running")

    if os.path.isfile(file_path):
        print(file_path + " found")
        if os.stat(file_path).st_size <= 12000:
            print(file_path + "is <= 12000 bytes")
            return 0
        else:
            print("File is larger than 12000 bytes")
            return 1
    else:
        print("File does not exist")
        return 1


print(check_file_size(r"/Volumes/workplace/ticket/aws-crt-nodejs/scripts/tsc.js"))
