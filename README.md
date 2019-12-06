## AWS CRT Node.js

Node.js bindings for the AWS Common Runtime.
This package also includes a pure JS implementation useable from browsers and old versions of Node.

## License

This library is licensed under the Apache 2.0 License.

## Building the project

### Native Dependencies

Requirements:
* Node.js including support for N-API 4 or higher (see [here](https://nodejs.org/api/n-api.html#n_api_n_api_version_matrix) for minimum versions)

### Build Dependencies

If you'd like to run a custom build, you'll need the following:
* Clang 3.9+ or GCC 4.4+
* libssl-dev (on Linux/Unix POSIX platforms)
* cmake 3.1+

#### Linux/Unix
```bash
$ apt-get install cmake3 libssl-dev -y
```

#### OSX
```bash
$ brew install cmake
```

### Running the build

```bash
# If you have the aws-c-* libraries installed already, set AWS_C_INSTALL to the install prefix
$ export AWS_C_INSTALL=/path/to/install/root/
# If you don't have them installed, run this instead to fetch them locally
$ git submodule update --init
# Build the package
$ npm install
# Rebuild with your changes
$ node ./scripts/build.js
```
