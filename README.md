## AWS CRT JS

NodeJS/Browser bindings for the AWS Common Runtime

## License

This library is licensed under the Apache 2.0 License. 

[API Docs](https://awslabs.github.io/aws-crt-nodejs/)


## Building the package

### Prereqs:
* Node 10.x+
* npm
* CMake 3.1+
* Linux: gcc 5+ or clang 3.6+
    * If your compiler can compile node, it can compile this library
* Windows: Visual Studio 2015+
* OSX: XCode or brew-installed llvm

To build the package locally
````bash
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
