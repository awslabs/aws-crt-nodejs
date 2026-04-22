const setupPuppeteer = require("jest-environment-puppeteer/setup");

/**
 * Sets up the environment for running tests with Jest + Puppeteer
 */
module.exports = async function globalSetup(globalConfig) {
    process.env.CI = true
    await setupPuppeteer(globalConfig);
};