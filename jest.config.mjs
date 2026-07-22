/** @type {import("jest").Config} */
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/lambda", "<rootDir>/azan-lambda"],
  modulePathIgnorePatterns: ["/\\.serverless/"],
  // `lambda` is JavaScript, `azan-lambda` is TypeScript — both run here so a
  // single `pnpm test` still gates everything.
  testMatch: ["**/tests/**/*.test.js", "**/tests/**/*.test.ts"],
  // Lets a test import a module without naming its extension, so the same
  // specifier resolves whether or not the module has been migrated yet.
  moduleFileExtensions: ["ts", "js", "json", "node"],
  // Declaring `transform` replaces Jest's default, so the .js entry has to be
  // spelled out: babel-jest is what hoists `jest.mock()` above the requires in
  // the JavaScript tests. ts-jest does its own hoisting for .ts.
  //
  // tsconfig.json sets `module: "Preserve"` for esbuild's benefit; ts-jest
  // compiles to CommonJS regardless, which is what Jest needs. That override is
  // load-bearing for `secrets.test.ts`: its dynamic `import()` has to become a
  // require so Jest's module registry can intercept it.
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
    "^.+\\.js$": "babel-jest",
  },
  globalSetup: "<rootDir>/lambda/tests/support/globalSetup.js",
  setupFilesAfterEnv: ["<rootDir>/lambda/tests/support/setupTests.js"],
};
