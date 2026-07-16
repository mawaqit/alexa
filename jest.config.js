module.exports = {
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/.serverless/"],
  // Only *.test.js files are suites; tests/support/* holds shared helpers.
  testMatch: ["**/tests/**/*.test.js"],
  // Prayer-time logic reads the wall clock, so the process timezone is pinned
  // to keep results identical on a developer laptop and in CI.
  globalSetup: "<rootDir>/lambda/tests/support/globalSetup.js",
  setupFilesAfterEnv: ["<rootDir>/lambda/tests/support/setupTests.js"],
  // lambda/ and azan-lambda/ each keep their own node_modules, so a test that
  // requires a module under test resolves that module's dependencies from its
  // own directory. Both must have had `npm ci` run before the suite passes.
};
