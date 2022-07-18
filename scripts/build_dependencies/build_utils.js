/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */
const fs = require("fs");
const child_process = require("child_process");
const process = require("process");

module.exports = {

    npmCheckIfPackageExists: function (package_name, package_version) {

        // TODO - check the version as well!
        // TODO - look at using require.resolve instead of fs.existsSync

        // Do we have it in our node dependencies?
        try {
            console.log("Looking for " + package_name + " in node_modules in root and scripts/build_dependencies...");
            if (fs.existsSync(process.cwd() + "/node_modules/" + package_name)) {
                console.log("Found " + package_name + " in node_dependencies!");
                return true;
            }
            if (fs.existsSync(__dirname + "/node_modules/" + package_name)) {
                console.log("Found " + package_name + " in scripts/build_dependencies/node_dependencies!");
                return true;
            }
        } catch (error) {}

        // Do we have it in our node list? If so, then use that!
        try {
            var list_output = child_process.execSync("npm list --depth 0 " + package_name, {encoding: "utf8"});
            if (list_output.indexOf(package_name) !== -1) {
                console.log("Found " + package_name + " in npm list!");
                return true;
            }
        } catch (error) {}

        // Do we have it in our global list?
        try {
            var list_output = child_process.execSync("npm list -g --depth 0 " + package_name, {encoding: "utf8"});
            if (list_output.indexOf(package_name) !== -1) {
                console.log("Found " + package_name + " in npm list!");
                return true;
            }
        } catch (error) {}

        console.log("Could not find " + package_name);
        return false;
    },

    /**
     * Downloads an NPM package for use dynamically - so it will only be loaded and used for this single script.
     * What it does under the hood is check for the npm package in the node modules, then in the npm list, and if
     * it does not find it in either location, it will download the package at that point, adding it as a dev-dependency.
     *
     * It it downloads it dynamically, then it will return true. This is so you can delete the package once you are done,
     * so it doesn't leave a zombie package in your node_modules. To remove the package, call npmDeleteRuntimePackage
     *
     * @param {*} package_name The name of the package you want to download (example: 'cmake-js')
     * @param {*} package_version The version of the package to download - leave blank for latest. (example: '6.3.2')
     * @returns True if the package was downloaded dynamically, otherwise false.
     */
    npmDownloadAndInstallRuntimePackage : function(package_name, package_version) {
        console.log("Looking for " + package_name + " as a dependency...");

        if (this.npmCheckIfPackageExists(package_name, package_version) == true) {
            return false;
        }

        // If it is not found, then download it into our node_modules
        try {
            console.log("Could not find " + package_name);
            console.log("Downloading " + package_name + " from npm for build...");
            // Try to intall the given package and ONLY the given package. Will throw an exception if there is an error.
            if (package_version != null) {
                child_process.execSync("npm install --no-package-lock --ignore-scripts " + package_name + "@" + package_version);
            } else {
                child_process.execSync("npm install --no-package-lock --ignore-scripts " + package_name);
            }
            return true;

        } catch (err) {
            console.log("ERROR - npm could not download " + package_name + "! " + package_name + " is required to build the CRT");
            throw err;
        }
    },

    /**
     * Tells NPM to uninstall a package. This should only be used to clean up a dynamic package downloaded with the
     * npmDownloadAndInstallRuntimePackage function, as otherwise it could remove a non-dynamic package.
     * @param {*} package_name The name of the package you want to delete (example 'cmake-js')
     */
    npmDeleteRuntimePackage : function (package_name) {
        console.log("Removing " + package_name + "...");
        try {
            child_process.execSync("npm uninstall " + package_name);
        } catch (err) {
            console.log("ERROR - npm could not remove " + package_name + "!");
            throw err;
        }
    }

};
