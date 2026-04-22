// global-teardown.js
const teardownPuppeteer = require('jest-environment-puppeteer/teardown')

module.exports = async function globalTeardown(globalConfig) {
    await teardownPuppeteer(globalConfig)
}