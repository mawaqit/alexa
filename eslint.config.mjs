import path from "node:path";

import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  // Reuse .gitignore so build artifacts are ignored in one place and stay in sync automatically.
  includeIgnoreFile(path.resolve(import.meta.dirname, ".gitignore")),
  // web/ (React + Vite) is deliberately its own toolchain, not folded into
  // this one: its .tsx files need a DOM lib and JSX parsing that would
  // conflict with the Lambda-oriented TS config below (and no block here
  // matches *.tsx at all, so without this exclusion those files would be
  // silently unlinted rather than cleanly out of scope). Give it its own
  // eslint config when it grows enough to need one.
  { ignores: ["web/**"] },
  js.configs.recommended,
  {
    // The JavaScript half of the workspace (`lambda/`). Scoped to .js so these
    // rules don't fight the TypeScript ones below.
    files: ["**/*.js"],
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
  // The TypeScript half (`azan-lambda/`). Type-aware linting is what catches
  // the things `tsc` allows but we don't want — floating promises, unsafe `any`
  // flowing out of untyped SDK calls, needless assertions.
  ...tseslint.config({
    files: ["**/*.ts"],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // An unhandled rejection in a Lambda is an invocation that silently
      // returns before its work is done.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
      // CommonJS `require` has no place in the TypeScript half.
      "@typescript-eslint/no-require-imports": "error",
    },
  }),
  {
    files: ["**/*.test.js", "**/tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  // Production TypeScript logs through `src/logging/logger`, never console:
  // console output carries no request id, so concurrent invocations become
  // indistinguishable in CloudWatch.
  {
    files: ["azan-lambda/src/**/*.ts"],
    ignores: ["azan-lambda/src/logging/*.ts"],
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["**/*.test.ts", "**/tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      // `expect(someModule.method)` is the normal way to assert on a jest mock,
      // and the rule cannot tell it apart from an accidentally unbound method.
      "@typescript-eslint/unbound-method": "off",
    },
  },
  // ESM config files at the repo root — not CommonJS like the `lambda/` code.
  {
    files: ["*.config.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  prettierRecommended,
];
