module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/lambda", "<rootDir>/azan-lambda"],
  modulePathIgnorePatterns: ["/\\.serverless/"],
  testMatch: ["**/tests/**/*.test.js"],
  globalSetup: "<rootDir>/lambda/tests/support/globalSetup.js",
  setupFilesAfterEnv: ["<rootDir>/lambda/tests/support/setupTests.js"],
};
