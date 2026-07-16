module.exports = {
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/.serverless/"],
  // lambda/ and azan-lambda/ each keep their own node_modules, so a test that
  // requires a module under test resolves that module's dependencies from its
  // own directory. Both must have had `npm ci` run before the suite passes.
};
