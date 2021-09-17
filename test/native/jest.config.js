
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
            tsconfig: '<rootDir>/tsconfig.json'
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
    setupFilesAfterEnv: ['<rootDir>/test/native/jest.setup.ts'],
    moduleNameMapper: {
        '@common/(.+)': '<rootDir>/lib/common/$1',
        '@awscrt/(.+)': '<rootDir>/lib/native/$1',
        '@awscrt': '<rootDir>/lib/index.ts',
        '@test/(.+)': '<rootDir>/test/$1'
    }
}
