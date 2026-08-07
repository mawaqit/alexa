# MAWAQIT - Alexa Skill

Backend for the MAWAQIT Alexa skill: prayer time lookups, routines, widgets, and the Smart Azan (adhan) notification system.

The project is split into two independently deployed Serverless Framework services, plus the Alexa skill configuration itself:

| Path                 | Service name         | Language   | What it does                                                         |
| -------------------- | -------------------- | ---------- | -------------------------------------------------------------------- |
| `lambda/`            | `alexa`              | JavaScript | Main skill backend: intent handling, prayer times, routines, widgets |
| `azan-lambda/`       | `mawaqit-alexa-azan` | TypeScript | Smart Azan: scheduled adhan playback dispatch                        |
| `skill-package/`     | -                    | -          | Alexa skill package: manifest (`skill.json`), interaction models, tasks, routine triggers — deployed via `ask deploy` |
| `utils/`             | -                    | -          | One-off Python script for generating locale files                    |

The codebase is migrating to TypeScript one service at a time — see
[TypeScript](#typescript).

## Repository structure

```
alexa/
├── lambda/                 # Main skill backend (service: alexa)
│   ├── index.js             # indexHandler - handles Alexa skill requests
│   ├── trigger.js           # triggerHandler - triggers the worker via EventBridge
│   ├── worker.js            # workerHandler - processes queued Alexa events from SQS
│   ├── handlers/            # Intent handlers, DynamoDB, Alexa APIs, etc.
│   ├── prompts/              # Locale-specific prompt strings (en, fr, de)
│   ├── aplDocuments/         # Alexa Presentation Language (APL) templates
│   ├── tests/                # Jest tests for this service
│   ├── env.json              # Non-secret per-stage config, read by serverless.yml
│   └── serverless.yml
├── azan-lambda/             # Smart Azan dispatcher (TypeScript, service: mawaqit-alexa-azan)
│   ├── src/handlers/          # Lambda entry point + one file per Alexa directive
│   ├── src/alexa/             # Smart Home response builder, error envelope, constants
│   ├── src/services/          # I/O: Amazon OAuth2, DynamoDB, SSM secrets
│   ├── src/types/             # Interfaces only — one file per domain
│   ├── src/logging/           # The Powertools logger instance
│   ├── tests/                 # Jest tests for this service
│   ├── env.json
│   └── serverless.yml
├── skill-package/             # Alexa skill package, deployed via `ask deploy`
│   ├── skill.json             # Skill manifest (endpoints, publishing info)
│   ├── interactionModels/     # custom/<locale>.json — one voice model per locale
│   ├── tasks/                 # Custom task definitions (PlayAdhaan)
│   └── routines/              # Ready-made routine triggers
├── ask-resources.json         # ASK CLI deploy config (points at skill-package/)
├── tsconfig.json              # TypeScript config for the whole workspace
└── utils/                     # create_locale_files.py (locale scaffolding script)
```

## Prerequisites

- [Node.js](https://nodejs.org/) 22.x (matches the Lambda runtime — `nodejs22.x`)
- [pnpm](https://pnpm.io/) 9+ — `corepack enable` (or `npm install -g pnpm`); the repo is a pnpm workspace

That is all you need to install dependencies and run the test suite. Deploying the services and managing the live skill require additional tooling and MAWAQIT infrastructure access — see [Deployment](#deployment).

## Installing dependencies

The repo is a [pnpm workspace](https://pnpm.io/workspaces): the root holds the shared tooling (eslint, prettier, jest) and the `lambda` and `azan-lambda` services are workspace packages. A single install at the root sets up all three:

```bash
pnpm install
```

## TypeScript

`azan-lambda` is TypeScript; `lambda` is still JavaScript. Both build and test
from the same root tooling, so the two can coexist indefinitely and the rest of
the codebase can be migrated service by service.

```bash
pnpm typecheck       # tsc --noEmit over every TypeScript file
```

Things worth knowing before you touch the TypeScript:

- **Nothing compiles to disk.** `tsc` only ever type-checks. Serverless v4
  bundles the `.ts` handlers with esbuild at deploy time, and ts-jest compiles
  them for the test run — there is no build step and no `dist/`.
- **esbuild strips types without checking them**, so a type error will bundle
  and deploy happily. `pnpm typecheck` is the only thing that catches it, which
  is why it runs in CI and in the pre-push hook.
- **The settings are strict**, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. `any` is banned by lint rather than by
  convention (`@typescript-eslint/no-explicit-any`), and linting is type-aware,
  so it also catches unsafe values and floating promises.
- **Interfaces live in `src/types/`, one file per domain**, and hold no logic.
  `smartHomeRequest.ts` and `smartHomeResponse.ts` split the Alexa wire format
  in two on purpose: incoming fields are optional (untrusted input — a handler
  proves a field is there before reading it), outgoing fields are required (we
  build those, so they must be complete). Keep that asymmetry.
- **Modules use `import` / `export` only.** There is no `require` anywhere in
  `azan-lambda`, and the root configs (`eslint.config.mjs`, `jest.config.mjs`)
  are ESM too. CommonJS is only the *output* format esbuild emits for the
  Lambda runtime — an artifact detail, never something you write.
- **Logging goes through `src/logging/logger`** (AWS Lambda Powertools), never
  `console` — a lint rule enforces it. Every line then carries the Lambda
  request id, which is the only way to follow one invocation through a log
  stream shared with every concurrent one. Verbosity is set by `LOG_LEVEL`.
  Secrets are never logged: only whether a token was present.

### Layout

| Directory       | Holds                                                              |
| --------------- | ------------------------------------------------------------------ |
| `src/handlers/` | `dispatcher.ts` (entry: validate + route), one file per directive  |
| `src/alexa/`    | Response builder, error envelope, and the Alexa string constants   |
| `src/services/` | Everything that does I/O: `amazonAuth`, `azanUsers`, `secrets`     |
| `src/types/`    | Interfaces and type aliases only                                   |
| `src/logging/`  | The configured logger — the only place `console` is allowed        |

Migrating another service means adding its directories to `include` in
`tsconfig.json` and renaming its files; the jest, eslint, and CI wiring already
handles both languages.

## Testing

Tests run with [Jest](https://jestjs.io/) from the repo root and live next to the
code they cover, in `lambda/tests/` (`.test.js`) and `azan-lambda/tests/`
(`.test.ts`). A single run covers both.

```bash
pnpm test            # run the whole suite
pnpm test:watch      # re-run on change
```

Both services log verbosely on every code path, so the suite silences them.
`VERBOSE_LOGS=1 pnpm test` restores the output when you are debugging a failure.

### From your editor

VS Code/Cursor: install the recommended [Jest extension](https://marketplace.visualstudio.com/items?itemName=Orta.vscode-jest), then reload the window if the _Tests_ icon doesn't appear.

JetBrains IDEs need no additional setup.

### Pre-push hook

`pnpm install` at the root also installs a [husky](https://typicode.github.io/husky/) pre-push hook that runs lint, then the typecheck, then the test suite, and blocks the push if any of them fails. There is nothing else to configure. Register it with:

```bash
pnpm run prepare
```

## Contributing

Contributions are welcome. To propose a change:

1. Fork the repo and create a branch.
2. Make your change with tests covering it, and keep the existing suite green
   (`pnpm test`, plus `pnpm typecheck` if you touched TypeScript). Lint,
   typecheck, and tests also run automatically on push via the
   [pre-push hook](#pre-push-hook) and in CI.
3. Open a pull request describing what you changed and why.

You can work on the entire codebase — handlers, prayer-time logic, routines, prompts, interaction models, and tests — with only Node.js installed. Deploying to live infrastructure is handled by the MAWAQIT team.

## Deployment

Deploying the Lambda services, configuring AWS / Alexa credentials, managing secrets, and updating the live interaction model are handled internally by the MAWAQIT team and are **not** required to contribute code or tests.

➡️ **MAWAQIT team:** see the [internal deployment and infrastructure runbook](https://app.notion.com/p/mawaqit/Alexa-Devs-How-to-deploy-3a331aaf3291809f965ceda28dd76c7c)
