# MAWAQIT - Alexa Skill

Backend for the MAWAQIT Alexa skill: prayer time lookups, routines, widgets, and the Smart Azan (adhan) notification system.

The project is split into two independently deployed Serverless Framework services, plus the Alexa skill configuration itself:

| Path                 | Service name         | What it does                                                         |
| -------------------- | -------------------- | -------------------------------------------------------------------- |
| `lambda/`            | `alexa`              | Main skill backend: intent handling, prayer times, routines, widgets |
| `azan-lambda/`       | `mawaqit-alexa-azan` | Smart Azan: scheduled adhan playback dispatch                        |
| `interactionModels/` | -                    | Alexa interaction models (voice model) per locale                    |
| `skill-package/`     | -                    | Skill package assets (tasks, routine triggers)                       |
| `skillManifest/`     | -                    | Skill manifest (`skill.json`) used by the ASK CLI                    |
| `utils/`             | -                    | One-off Python script for generating locale files                    |

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
├── azan-lambda/             # Smart Azan dispatcher (service: mawaqit-alexa-azan)
│   ├── src/handlers/          # dispatcherHandler entry point
│   ├── src/dbHandler/          # DynamoDB access
│   ├── src/authHandler/        # Amazon OAuth2 handling
│   ├── src/ssmHandler/         # SSM parameter loading
│   ├── tests/                 # Jest tests for this service
│   ├── env.json
│   └── serverless.yml
├── interactionModels/         # One JSON file per supported locale
├── skill-package/             # Routines/tasks skill package assets
├── skillManifest/             # skill.json manifest for the ASK CLI
└── utils/                     # create_locale_files.py (locale scaffolding script)
```

## Prerequisites

- [Node.js](https://nodejs.org/) 22.x (matches the Lambda runtime — `nodejs22.x`)

That is all you need to install dependencies and run the test suite. Deploying the services and managing the live skill require additional tooling and MAWAQIT infrastructure access — see [Deployment](#deployment).

## Installing dependencies

The repo root is a tooling workspace (eslint, prettier, jest) and each Lambda service has its own dependencies and must be installed separately:

```bash
npm install
cd lambda && npm install
cd ../azan-lambda && npm install
```

## Testing

Tests run with [Jest](https://jestjs.io/) from the repo root and live next to the
code they cover, in `lambda/tests/` and `azan-lambda/tests/`.

```bash
npm test            # run the whole suite
npm run test:watch  # re-run on change
```

### From your editor

VS Code/Cursor: install the recommended [Jest extension](https://marketplace.visualstudio.com/items?itemName=Orta.vscode-jest), then reload the window if the _Tests_ icon doesn't appear.

JetBrains IDEs need no additional setup.

### Pre-push hook

`npm install` at the root also installs a [husky](https://typicode.github.io/husky/) pre-push hook that runs lint then the test suite, and blocks the push if either fails. There is nothing else to configure. Register it with:

```bash
npm run prepare
```

## Contributing

Contributions are welcome. To propose a change:

1. Fork the repo and create a branch.
2. Make your change with tests covering it, and keep the existing suite green
   (`npm test`). Lint and tests also run automatically on push via the
   [pre-push hook](#pre-push-hook) and in CI.
3. Open a pull request describing what you changed and why.

You can work on the entire codebase — handlers, prayer-time logic, routines, prompts, interaction models, and tests — with only Node.js installed. Deploying to live infrastructure is handled by the MAWAQIT team.

## Deployment

Deploying the Lambda services, configuring AWS / Alexa credentials, managing secrets, and updating the live interaction model are handled internally by the MAWAQIT team and are **not** required to contribute code or tests.

➡️ **MAWAQIT team:** the full deployment and infrastructure runbook lives in our internal Notion — [Click here](https://app.notion.com/p/mawaqit/Alexa-Devs-How-to-deploy-3a331aaf3291809f965ceda28dd76c7c)
