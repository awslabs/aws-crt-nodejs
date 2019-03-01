## AWS Crt Node.js

NodeJS bindings for the AWS Common Runtime.

> Note that this module currently only supports Linux and macOS. Windows support is coming soon.

## License

This library is licensed under the Apache 2.0 License.

## Building the project

````bash
# If you have the aws-c-* libraries installed already, set AWS_C_INSTALL to the install prefix
export AWS_C_INSTALL=/path/to/install/root/
# If you don't have them installed, run this instead to fetch them locally
git submodule update --init
# Build the package
npm install
````
