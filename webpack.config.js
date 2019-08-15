const path = require('path');

module.exports = {
    entry: "./lib/browser.ts",
    devtool: "source-map",
    mode: "production",
    output: {
        path: path.resolve(__dirname, "dist.browser"),
        filename: "browser.js"
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js", ".json"]
    },
    module: {
        rules: [
            // all files with a '.ts' or '.tsx' extension will be handled by 'ts-loader'
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            configFile: 'tsconfig.browser.json'
                        }
                    }
                ]
            }
        ]
    }
}
