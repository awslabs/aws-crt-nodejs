module.exports = {
    entry: "./index.ts",
    devtool: "source-map",
    target: "web",
    output: {
        filename: "index.js"
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js", ".json"],
        fallback: {
            util$: './util.js',
        }
    },
    module: {
        rules: [
            // all files with a '.ts' or '.tsx' extension will be handled by 'ts-loader'
            { test: /\.tsx?$/, use: ["ts-loader"], exclude: /node_modules/ }
        ]
    }
}
