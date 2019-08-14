const TsConfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const path = require('path');

module.exports = {
    entry: "./lib/index.ts",
    devtool: "source-map",
    mode: "production",
    output: {
        path: path.resolve(__dirname, "dist.browser"),
        filename: "bundle.js"
    },
    optimization: {
        nodeEnv: "webpack"
    },
    resolve: {
        plugins: [
            new TsConfigPathsPlugin({configFile: "./tsconfig.browser.json"})
        ],
        extensions: [".tsx", ".ts", ".js", ".json"]
    },
    externals: /module\-alias.+/,
    module: {
        rules: [
            // all files with a '.ts' or '.tsx' extension will be handled by 'ts-loader'
            {
                test: /\.tsx?$/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            configFile: 'tsconfig.browser.json'
                        }
                    }
                ],
                include: [
                    path.resolve(__dirname, "lib")
                ],
                exclude: [
                    path.resolve(__dirname, "lib/native"),
                ]
            }
        ]
    }
}
