## AWS CRT Node.js

Node.js bindings for the AWS Common Runtime.

> Note that this module currently only supports Linux and macOS.

## License

This library is licensed under the Apache 2.0 License.

## Building the project

### Dependencies

Requirements:
* Clang 3.9+ or GCC 4.4+
* libssl-dev (on Linux/Unix POSIX platforms)
* cmake 3.1+
* Node.js 10.x or newer

#### Linux/Unix
```bash
$ apt-get install cmake3 libssl-dev -y
```

#### OSX
```bash
$ brew install cmake3
```

### Running the build

```bash
# If you have the aws-c-* libraries installed already, set AWS_C_INSTALL to the install prefix
$ export AWS_C_INSTALL=/path/to/install/root/
# If you don't have them installed, run this instead to fetch them locally
$ git submodule update --init
# Build the package
$ npm install
```
