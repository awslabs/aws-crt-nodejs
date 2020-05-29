
module.exports = {
    testEnvironment: "node",
    rootDir: '../../',
    testMatch: [
        '<rootDir>/lib/common/*.spec.ts',
        '<rootDir>/lib/native/*.spec.ts',
    ],
    preset: 'ts-jest',
    globals: {
        'ts-jest': {
            tsConfig: '<rootDir>/test/tsconfig.json'
        }
    },
    transform: {
        "binding.js$": ['ts-jest'],
        "^.+\\.ts?$": ['ts-jest'],
    },
    testPathIgnorePatterns: [
        '/node_modules/'
    ],
    modulePathIgnorePatterns: [
        '/cmake-js/'
    ],
}