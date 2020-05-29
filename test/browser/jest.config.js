
module.exports = {
    rootDir: '../../',
    testMatch: [
        '<rootDir>/lib/common/*.spec.ts',
        '<rootDir>/lib/browser/*.spec.ts',
    ],
    preset: 'jest-puppeteer',
    globals: {
        'ts-jest': {
            tsConfig: '<rootDir>/test/tsconfig.json'
        }
    },
    transform: {
        "^.+\\.ts?$": ['ts-jest'],
    },
    testPathIgnorePatterns: [
        '/node_modules/'
    ],
    modulePathIgnorePatterns: [
        '/cmake-js/',
        '/scripts/'
    ],
    globalSetup: '<rootDir>/test/browser/jest.setup.js',
    globalTeardown: '<rootDir>/test/browser/jest.teardown.js',
    setupFilesAfterEnv: ['<rootDir>/test/browser/jest.setup.ts'],
}