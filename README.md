## AWS CRT JS

NodeJS/Browser bindings for the AWS Common Runtime

[API Docs](https://awslabs.github.io/aws-crt-nodejs/)

## License

This library is licensed under the Apache 2.0 License.

## Building the package

### Prereqs:
* Node 10.16+
* npm
* CMake 3.1+
* Linux: gcc 5+ or clang 3.6+
    * If your compiler can compile node, it can compile this library
* Windows: Visual Studio 2015+
* OSX: XCode or brew-installed llvm

To build the package locally
````bash
git clone https://github.com/awslabs/aws-crt-nodejs.git
cd aws-crt-nodejs
git submodule update --init
npm install
````

## Using From Your NodeJS Application

Normally, you just declare `aws-crt` as a dependency in your package.json file.

## Using From Your Browser Application

You can either add it to package.json (if using a tool like webpack), or just import the ```dist.browser/``` folder into your web project

### Installing from npm
````bash
npm install aws-crt
````

## Mac-Only TLS Behavior

Please note that on Mac, once a private key is used with a certificate, that certificate-key pair is imported into the Mac Keychain.  All subsequent uses of that certificate will use the stored private key and ignore anything passed in programmatically.  Beginning in v1.1.11, when a stored private key from the Keychain is used, the following will be logged at the "info" log level:

```
static: certificate has an existing certificate-key pair that was previously imported into the Keychain.  Using key from Keychain instead of the one provided.
```
