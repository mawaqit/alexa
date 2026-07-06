# MAWAQIT - Alexa Skill

Backend for the MAWAQIT Alexa skill: prayer time lookups, routines, widgets,
and the Smart Azan (adhan) notification system.

The project is split into two independently deployed Serverless Framework
services, plus the Alexa skill configuration itself:

| Path                | Service name          | What it does                                                              |
| ------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `lambda/`           | `alexa`                | Main skill backend: intent handling, prayer times, routines, widgets       |
| `azan-lambda/`       | `mawaqit-alexa-azan`   | Smart Azan: scheduled adhan playback dispatch                             |
| `interactionModels/` | -                       | Alexa interaction models (voice model) per locale                         |
| `skill-package/`     | -                       | Skill package assets (tasks, routine triggers)                            |
| `skillManifest/`     | -                       | Skill manifest (`skill.json`) used by the ASK CLI                          |
| `utils/`             | -                       | One-off Python script for generating locale files                         |

## Prerequisites

- [Node.js](https://nodejs.org/) 22.x (matches the Lambda runtime — `nodejs22.x`)
- [AWS CLI](https://aws.amazon.com/cli/), configured with access to the MAWAQIT AWS account
- [AWS Vault](https://github.com/99designs/aws-vault#installing) with a `mawaqit-external` profile
- [Serverless Framework](https://www.serverless.com/framework/docs/getting-started) v4 (`npm install -g serverless`)
- [ASK CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/ask-cli-command-reference.html), configured with a profile that has access to the MAWAQIT skill (see [Configuring the ASK CLI](#configuring-the-ask-cli) below)

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
│   ├── env.json              # Non-secret per-stage config, read by serverless.yml
│   └── serverless.yml
├── azan-lambda/             # Smart Azan dispatcher (service: mawaqit-alexa-azan)
│   ├── src/handlers/          # dispatcherHandler entry point
│   ├── src/dbHandler/          # DynamoDB access
│   ├── src/authHandler/        # Amazon OAuth2 handling
│   ├── src/ssmHandler/         # SSM parameter loading
│   ├── env.json
│   └── serverless.yml
├── interactionModels/         # One JSON file per supported locale
├── skill-package/             # Routines/tasks skill package assets
├── skillManifest/             # skill.json manifest for the ASK CLI
└── utils/                     # create_locale_files.py (locale scaffolding script)
```

## Installing dependencies

Each Lambda service has its own dependencies and must be installed separately:

```bash
cd lambda && npm install
cd ../azan-lambda && npm install
```

## Configuring secrets (SSM Parameter Store)

Both services read secrets from AWS Systems Manager Parameter Store at
runtime (not from `env.json`, which only holds non-secret config). Before
the first deploy to a given AWS account, create these `SecureString`
parameters:

```bash
aws ssm put-parameter --name /alexa/api/key/mawaqit --type SecureString --value "<mawaqit-api-key>"
aws ssm put-parameter --name /alexa/api/key/google --type SecureString --value "<google-api-key>"
aws ssm put-parameter --name /alexa/clientId --type SecureString --value "<amazon-oauth-client-id>"
aws ssm put-parameter --name /alexa/clientSecret --type SecureString --value "<amazon-oauth-client-secret>"
```

- `mawaqit` key: used to call the [mawaqit.net](https://mawaqit.net) API.
- `google` key: used for Google Geocoding/Translate.
- `clientId` / `clientSecret`: Amazon OAuth2 credentials used to authenticate
  against the Mawaqit API on the user's behalf.

`lambda/` reads these from `eu-west-3` (default region); `azan-lambda/`
reads them from the region set by `TARGET_SSM_REGION` in `azan-lambda/env.json`
(currently `eu-west-3`).

## Non-secret configuration (env.json)

Each service has an `env.json` with per-stage (`dev` / `prod`) values that
are not secret: base API URL, DynamoDB table names, skill ID, polling
intervals, etc. These files are committed and can be edited directly when
adding a new stage or changing a non-secret value — no need to touch
`serverless.yml` itself.

## Deploying

Both services are deployed independently, from within an AWS Vault session:

```bash
aws-vault exec mawaqit-external -- bash
```

### Main skill backend (`lambda/`)

```bash
cd lambda
serverless deploy --stage ${stage}
```

This deploys all three functions (`indexHandler`, `triggerHandler`,
`workerHandler`) plus the associated SQS queues, DynamoDB tables, and IAM
role. To redeploy a single function after the stack already exists (faster
for iterating on a single handler):

```bash
serverless deploy --stage ${stage} -f indexHandler
```

### Smart Azan dispatcher (`azan-lambda/`)

```bash
cd azan-lambda
serverless deploy --stage ${stage}
```

`${stage}` is one of:

- `dev`
- `prod`

## Configuring the ASK CLI

1. Install the "Alexa Skills Kit" extension in VS Code (optional, only
   needed if you want the graphical skill/model editor).
2. Configure the default ASK CLI profile:
   ```bash
   ask configure
   ```
3. Configure a named profile for this skill:
   ```bash
   ask configure --profile MAWAQIT
   ```
   Follow the prompts to log in with the Amazon developer account that has
   access to the MAWAQIT skill.
4. Verify the profile was created:
   ```bash
   ask configure list-profiles
   ```

## Updating the interaction model

1. Edit the relevant locale file in `/interactionModels`, e.g.
   `interactionModels/en-US.json`.
2. From the `interactionModels` directory, push the change to the
   development stage of the skill:
   ```bash
   cd interactionModels
   ask smapi set-interaction-model \
     --skill-id amzn1.ask.skill.81a30fbf-496f-4aa4-a60b-9e35fb513506 \
     --stage development \
     --locale ${locale} \
     --interaction-model "file:${locale}.json" \
     -p ${profile} \
     --debug
   ```
   - Replace `${locale}` with the locale name, e.g. `en-US` or `fr-FR`.
   - Replace `${profile}` with the ASK CLI profile name, e.g. `MAWAQIT`.
3. Once verified in development, promote the skill to certification/live
   through the Alexa Developer Console or `ask smapi` as usual.

