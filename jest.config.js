
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
    testPathIgnorePatterns: [
        '/node_modules/',
        'test-load.ts'
    ]
}