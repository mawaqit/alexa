const path = require("node:path");
const { includeIgnoreFile } = require("@eslint/compat");
const js = require("@eslint/js");
const globals = require("globals");
const prettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = [
  // Reuse .gitignore so build artifacts (node_modules, .serverless, coverage…)
  // are ignored in one place and stay in sync automatically.
  includeIgnoreFile(path.resolve(__dirname, ".gitignore")),
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.test.js", "**/tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  prettierRecommended,
];
