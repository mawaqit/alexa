# CI/CD

## Pipeline overview

| Event                         | Workflow          | What runs                                                                             |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| Pull request → `main`         | `ci.yml`          | Lint + format check (quality gate)                                                     |
| Push to `main`                | `deploy-dev.yml`  | Quality gate → deploy **dev** (both Lambdas) + push interaction models (dev stage)     |
| Publish a **GitHub Release**  | `deploy-prod.yml` | Quality gate → deploy **prod** (both Lambdas) + push interaction models (dev stage)    |

`checks.yml` and `deploy.yml` are reusable workflows called by the above; you
don't trigger them directly.

### The one manual step (going live)

An Alexa skill has two stages: `development` and `live`. CI can only push the
voice model to the **development** stage — moving it to **live** requires
**Amazon certification**, a manual review. So a prod release deploys the prod
backend and updates the development stage, then **you** submit the skill for
certification from the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask)
(or `ask smapi submit-skill-for-certification`). The workflow prints a reminder.

## One-time setup

### 1. GitHub Environments

Create two environments (repo **Settings → Environments**): `dev` and `prod`.
Add the [secrets](#secrets) below to each. For `prod`, enable **Required
reviewers** so a human approves before a production deploy runs.

### 2. Secrets (per environment)

| Secret                  | Used by            | How to get it                                                                                  |
| ----------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN`   | Serverless deploy  | ARN of the IAM role GitHub assumes via OIDC (see [AWS OIDC](#3-aws-oidc-recommended)).          |
| `SERVERLESS_ACCESS_KEY` | Serverless deploy  | Serverless Framework v4 access key (app.serverless.com → Access Keys). Required by v4.          |
| `ASK_CLI_CONFIG`        | Interaction models | Base64 of your `~/.ask/cli_config` (see [ASK CLI](#4-ask-cli-credentials)).                     |

> **Access-key fallback:** if you are not using OIDC, replace `AWS_DEPLOY_ROLE_ARN`
> with `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` and uncomment the matching
> lines in `deploy.yml`.

Optional repo **variables** (Settings → Variables): `SKILL_ID` (defaults to the
skill ID in `lambda/env.json`) and `ASK_PROFILE` (defaults to `default`).

### 3. AWS OIDC (recommended)

Ask the MAWAQIT AWS administrator to, in the target account:

1. Add the GitHub OIDC identity provider (`token.actions.githubusercontent.com`).
2. Create an IAM role trusting this repo, e.g. condition
   `token.actions.githubusercontent.com:sub = repo:mawaqit/alexa:*` (or restrict
   to `environment:prod` for the prod role).
3. Attach a policy allowing the resources in each `serverless.yml`
   (CloudFormation, Lambda, SQS, DynamoDB, IAM role create/pass, EventBridge
   Scheduler, S3, SSM read).
4. Give you the role ARN → store it as `AWS_DEPLOY_ROLE_ARN`.

If dev and prod live in **separate AWS accounts**, create one role per account
and store the respective ARN in each environment's secret.

### 4. ASK CLI credentials

On a machine where `ask configure` is logged in to the developer account with
access to the MAWAQIT skill:

```bash
base64 -i ~/.ask/cli_config | pbcopy   # macOS; use `base64 -w0` on Linux
```

Paste the result into the `ASK_CLI_CONFIG` secret. Make sure the config
contains a profile matching `ASK_PROFILE` (default `default`).
