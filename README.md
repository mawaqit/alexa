# MAWAQIT - Alexa Skill

Backend for the MAWAQIT Alexa skill: prayer time lookups, routines, widgets,
and the Smart Azan (adhan) notification system.

The project is split into two independently deployed Serverless Framework
services, plus the Alexa skill configuration itself:

| Path                 | Service name         | What it does                                                         |
| -------------------- | -------------------- | -------------------------------------------------------------------- |
| `lambda/`            | `alexa`              | Main skill backend: intent handling, prayer times, routines, widgets |
| `azan-lambda/`       | `mawaqit-alexa-azan` | Smart Azan: scheduled adhan playback dispatch                        |
| `interactionModels/` | -                    | Alexa interaction models (voice model) per locale                    |
| `skill-package/`     | -                    | Skill package assets (tasks, routine triggers)                       |
| `skillManifest/`     | -                    | Skill manifest (`skill.json`) used by the ASK CLI                    |
| `utils/`             | -                    | One-off Python script for generating locale files                    |

## Prerequisites

- [Node.js](https://nodejs.org/) 22.x (matches the Lambda runtime — `nodejs22.x`)
- [AWS CLI](https://aws.amazon.com/cli/) — `brew install awscli`
- [AWS Vault](https://github.com/99designs/aws-vault#installing) — `brew install --cask aws-vault` (see [Getting AWS access](#getting-aws-access) and [Configuring AWS Vault](#configuring-aws-vault) below)
- [Serverless Framework](https://www.serverless.com/framework/docs/getting-started) v4 — `npm install -g serverless`
- [ASK CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/ask-cli-command-reference.html) — `npm install -g ask-cli`, configured with a profile that has access to the MAWAQIT skill (see [Configuring the ASK CLI](#configuring-the-ask-cli) below)

> **First time setting this up?** You need credentials to two separate systems:
> an **AWS account** (to deploy the Lambda backend) and an **Amazon Developer
> account** (to manage the Alexa skill). Neither is created by this repo — both
> are granted by whoever administers the MAWAQIT infrastructure. Start with
> [Getting AWS access](#getting-aws-access).

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

## Installing dependencies

Each Lambda service has its own dependencies and must be installed separately:

```bash
cd lambda && npm install
cd ../azan-lambda && npm install
```

The repo root is a tooling workspace (eslint, prettier, jest). Install it too:

```bash
npm install
```

## Testing

Tests run with [Jest](https://jestjs.io/) from the repo root and live next to the
code they cover, in `lambda/tests/` and `azan-lambda/tests/`. Each
`serverless.yml` excludes them from its deploy artifact via `package.patterns`.

```bash
npm test            # run the whole suite
npm run test:watch  # re-run on change
```

The suite needs each service's own dependencies installed as well, because a test
resolves the modules under test from that service's `node_modules`.

### From your editor

VS Code and Cursor: install the recommended [Jest extension](https://marketplace.visualstudio.com/items?itemName=Orta.vscode-jest),
then reload the window — it only activates on a workspace that already contains
`jest.config.js`, so a window opened before Jest was set up will not show the
Testing panel. Tests then run and debug from that panel. JetBrains IDEs need no
setup.

### Pre-push hook

`npm install` at the root also installs a [husky](https://typicode.github.io/husky/)
pre-push hook that runs lint then the test suite, and blocks the push if either
fails. There is nothing else to configure. If it ever stops firing, re-register
it with:

```bash
npm run prepare
```

The hook checks your working tree rather than the commits being pushed, and
`git push --no-verify` bypasses it — it is a convenience, not a guarantee. The
real gate is CI: `.github/workflows/checks.yml` runs lint, format check, and
tests on pull requests and ahead of every deploy.

## Configuring secrets (SSM Parameter Store)

Both services read secrets from AWS Systems Manager Parameter Store at
runtime (not from `env.json`, which only holds non-secret config). Before
the first deploy to a given AWS account, create these `SecureString`
parameters. This requires AWS access — set up
[AWS Vault](#configuring-aws-vault) first, then run the commands **inside** an
`aws-vault` session so they land in the MAWAQIT account (not your personal
`default` profile), in the `eu-west-3` region both services read from:

```bash
aws-vault exec mawaqit-external -- bash   # then, inside the subshell:

aws ssm put-parameter --region eu-west-3 --name /alexa/api/key/mawaqit --type SecureString --value "<mawaqit-api-key>"
aws ssm put-parameter --region eu-west-3 --name /alexa/api/key/google --type SecureString --value "<google-api-key>"
aws ssm put-parameter --region eu-west-3 --name /alexa/clientId --type SecureString --value "<amazon-oauth-client-id>"
aws ssm put-parameter --region eu-west-3 --name /alexa/clientSecret --type SecureString --value "<amazon-oauth-client-secret>"
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

## Getting AWS access

Deploying requires credentials to the **MAWAQIT AWS account**. This repo does
**not** contain those credentials and they cannot be self-served — request them
from the MAWAQIT AWS administrator. When you ask, you need to find out:

1. **Which AWS account(s) are used.** Both `dev` and `prod` deploy to the same
   region (`eu-west-3`, Paris) using the same Alexa skill ID, and stages are
   separated by resource-name suffix (`...-dev` / `...-prod` — see `env.json`).
   Confirm with the admin whether that means **one account** (dev/prod side by
   side, one profile) or **two separate accounts** (one profile each). This
   determines how many `aws-vault` profiles you set up below.
2. **How you authenticate.** Ask which of these the account uses, and get the
   corresponding values:
   - **IAM user access keys** → an Access Key ID + Secret Access Key (and the
     MFA device ARN, if MFA is enforced).
   - **Assume-role** → the `role_arn` to assume plus which base profile /
     credentials to assume it from.
   - **AWS SSO / IAM Identity Center** → the SSO start URL and region.
3. **The IAM permissions** attached must allow deploying CloudFormation,
   Lambda, SQS, DynamoDB, IAM roles, EventBridge Scheduler, S3, and reading SSM
   parameters — i.e. the resources declared in each `serverless.yml`.

You **also** need an **Amazon Developer account** with access to the MAWAQIT
skill — that is separate from AWS and is covered in
[Configuring the ASK CLI](#configuring-the-ask-cli).

## Configuring AWS Vault

`aws-vault` stores the AWS credentials in your OS keychain and injects them as
temporary environment variables into a subshell, so nothing sensitive lands in
plaintext. The profile name used throughout this README is `mawaqit-external` —
if the admin gave you a different name, substitute it everywhere.

Pick the setup matching the authentication method from step 2 above.

**IAM user access keys** — store the key pair once; aws-vault prompts for the
values:

```bash
aws-vault add mawaqit-external
```

If MFA is enforced, add the device ARN to `~/.aws/config`:

```ini
[profile mawaqit-external]
region = eu-west-3
mfa_serial = arn:aws:iam::<ACCOUNT_ID>:mfa/<your-device>
```

**Assume-role** — store your base credentials, then point a profile at the
role to assume in `~/.aws/config`:

```bash
aws-vault add mawaqit-base            # your personal/base access keys
```

```ini
[profile mawaqit-external]
region = eu-west-3
source_profile = mawaqit-base
role_arn = arn:aws:iam::<ACCOUNT_ID>:role/<role-name>
# mfa_serial = arn:aws:iam::<ACCOUNT_ID>:mfa/<your-device>   # if MFA required
```

**AWS SSO** — configure the profile in `~/.aws/config`, then log in:

```ini
[profile mawaqit-external]
sso_start_url = https://<your-org>.awsapps.com/start
sso_region = eu-west-3
sso_account_id = <ACCOUNT_ID>
sso_role_name = <PermissionSetName>
region = eu-west-3
```

```bash
aws sso login --profile mawaqit-external
```

Verify the profile works before deploying — this should print the MAWAQIT
account ID and your identity, not your personal `default` account:

```bash
aws-vault exec mawaqit-external -- aws sts get-caller-identity
```

> If you use two separate accounts for dev and prod, repeat the setup for a
> second profile (e.g. `mawaqit-external-prod`) and use it when deploying the
> `prod` stage.

## Deploying

Both services are deployed independently, each from within an AWS Vault session
so the deploy runs against the MAWAQIT account. `--stage` selects the
environment; it suffixes all resource names (`...-dev` / `...-prod`), so dev and
prod never collide.

Open a shell with the credentials loaded:

```bash
aws-vault exec mawaqit-external -- bash
```

Everything below runs inside that subshell.

### Main skill backend (`lambda/`)

```bash
cd lambda
serverless deploy --stage dev      # deploy to the dev environment
serverless deploy --stage prod     # deploy to the prod environment
```

This deploys all three functions (`indexHandler`, `triggerHandler`,
`workerHandler`) plus the associated SQS queues, DynamoDB tables, and IAM
role. To redeploy a single function after the stack already exists (faster
for iterating on a single handler):

```bash
serverless deploy --stage dev -f indexHandler
```

### Smart Azan dispatcher (`azan-lambda/`)

```bash
cd azan-lambda
serverless deploy --stage dev      # or --stage prod
```

> **Regions:** the main `alexa` service deploys entirely to `eu-west-3` (Paris).
> The `mawaqit-alexa-azan` service runs its compute in `eu-west-1` (Ireland)
> while reading its DynamoDB tables and SSM parameters from `eu-west-3` (Paris)
> — this split is defined in `azan-lambda/serverless.yml`, you don't configure
> it per deploy.

If you omit `--stage`, both services default to `dev`.

## Configuring the ASK CLI

You only need **one** ASK CLI profile — one that is logged in to the Amazon
developer account with access to the MAWAQIT skill.

1. Install the "Alexa Skills Kit" extension in VS Code (optional, only
   needed if you want the graphical skill/model editor).
2. Create the profile:
   ```bash
   ask configure --profile MAWAQIT
   ```
   - Follow the prompts to log in with the Amazon developer account that has
     access to the MAWAQIT skill.
   - When asked _"Do you want to link your AWS account in order to host your
     Alexa skills?"_, answer **No** — this repo deploys its Lambda separately
     via Serverless Framework (see [Deploying](#deploying)), so the ASK CLI does
     not need an AWS link.

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
