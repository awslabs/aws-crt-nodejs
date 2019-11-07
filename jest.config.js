
module.exports = {
    testEnvironment: "node",
    rootDir: '.',
    testMatch: ['<rootDir>/test/*.ts'],
    preset: 'ts-jest',
    globals: {
        'ts-jest': {
            tsConfig: '<rootDir>/test/tsconfig.json'
        }
    },
    transform: {
        "binding.js$": ['ts-jest'],
    },
    testPathIgnorePatterns: [
        '/node_modules/'
    ],
    modulePathIgnorePatterns: [
        '/cmake-js/'
    ],
    testRunner: "jest-circus/runner"
}