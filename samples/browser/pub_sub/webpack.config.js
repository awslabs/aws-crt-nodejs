module.exports = {
    entry: "./index.ts",
    devtool: "source-map",
    target: "web",
    output: {
        filename: "index.js"
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js", ".json"],
        // webpack 4 used to have this as a dependency but now webpack 5 (which has to be used from a security
        // standpoint) does not.  This in turn breaks the aws-sdk dependency's 'util' resolution, as 'util' was
        // an implicit dependency of the SDK via the webpack (4) dependency.
        // To fix it, we add a technically unnecessary dependency on 'util' in this project and then update the
        // webpack resolution fallback rules to map aws-sdk's 'util' imports to the installed version of 'util'
        fallback: {
            "util": require.resolve("util/")
        }
    },
    module: {
        rules: [
            // all files with a '.ts' or '.tsx' extension will be handled by 'ts-loader'
            { test: /\.tsx?$/, use: ["ts-loader"], exclude: /node_modules/ }
        ]
    }
}
