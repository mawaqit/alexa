# CI/CD

## Pipeline overview

| Event                         | Workflow          | What runs                                                                             |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| Pull request → `main`         | `ci.yml`          | Lint + format check (quality gate)                                                     |
| Push to `main`                | `deploy-dev.yml`  | Quality gate → deploy **dev** (both Lambdas) + push interaction models (development stage) |
| Publish a **GitHub Release**  | `deploy-prod.yml` | Quality gate → deploy **prod** (both Lambdas) + push interaction models (development stage) |

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
Add the [secrets](#2-secrets-per-environment) below to each. For `prod`, enable **Required
reviewers** so a human approves before a production deploy runs.

### 2. Secrets (per environment)

| Secret                  | Used by            | How to get it                                                                                  |
| ----------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN`   | Serverless deploy  | ARN of the IAM role GitHub assumes via OIDC (see [AWS OIDC](#3-aws-oidc-recommended)).          |
| `SERVERLESS_ACCESS_KEY` | Serverless deploy  | Serverless Framework v4 access key (app.serverless.com → Access Keys). Required by v4.          |
| `ASK_CLI_CONFIG`        | Interaction models | Base64 of your `~/.ask/cli_config` (see [ASK CLI](#4-ask-cli-credentials)).                     |

> **Access-key fallback:** if you are not using OIDC, replace `AWS_DEPLOY_ROLE_ARN`
> with `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` secrets, and in `deploy.yml`
> swap the `role-to-assume` line of each `configure-aws-credentials` step for
> `aws-access-key-id` / `aws-secret-access-key` inputs referencing those secrets.

**Required** repo **variables** (Settings → Variables) — the workflow applies no
fallback, so deploys fail if they are unset:

| Variable      | Value                                                                        |
| ------------- | ---------------------------------------------------------------------------- |
| `SKILL_ID`    | The skill ID from the Alexa Developer Console (also in `lambda/env.json`).   |
| `ASK_PROFILE` | Name of a profile present in `ASK_CLI_CONFIG` (usually `default`).           |

**Optional — Discord notifications.** If you set a **repository-level** secret
`DISCORD_WEBHOOK_URL` (Settings → Secrets and variables → Actions → *Repository
secrets*), each deploy posts a "started" message and a "succeeded"/"failed"
message to that Discord channel. Leave it unset to disable — the notification
steps no-op when it's absent. Create the webhook in Discord under **Server
Settings → Integrations → Webhooks**. Keep it as a repo secret (not an
environment secret): the notification jobs run without an `environment`, so an
environment-scoped secret would be invisible to them and the "started"
notification would otherwise be gated behind the `prod` approval.

### 3. AWS OIDC (recommended)

Ask the MAWAQIT AWS administrator to, in the target account:

1. Add the GitHub OIDC identity provider (`token.actions.githubusercontent.com`).
2. Create an IAM role trusting this repo, e.g. condition
   `token.actions.githubusercontent.com:sub = repo:mawaqit/alexa:*` (or restrict
   to `repo:mawaqit/alexa:environment:prod` for the prod role).
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
contains a profile matching the `ASK_PROFILE` repo variable.

## Appendix: least-privilege IAM policy for the deploy role

Permissions are derived from what the two CloudFormation stacks actually create,
scoped by account, region, and the resource naming conventions
(`alexa-*`, `mawaqit-alexa-azan-*`, `mawaqit-azan-*`). Replace `<ACCOUNT_ID>`.
If dev and prod are separate accounts, attach this to the role in each account
(the resource names are stage-suffixed, so one policy covers both stages).

A few actions (`ValidateTemplate`, `DescribeLogGroups`, `ListEventSourceMappings`,
`sqs:ListQueues`) do not support resource-level scoping and are unavoidably `*`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationStacks",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResource",
        "cloudformation:DescribeStackResources",
        "cloudformation:ListStackResources",
        "cloudformation:GetTemplate",
        "cloudformation:CreateChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ExecuteChangeSet"
      ],
      "Resource": [
        "arn:aws:cloudformation:eu-west-3:<ACCOUNT_ID>:stack/alexa-*/*",
        "arn:aws:cloudformation:eu-west-1:<ACCOUNT_ID>:stack/mawaqit-alexa-azan-*/*"
      ]
    },
    {
      "Sid": "CloudFormationGlobal",
      "Effect": "Allow",
      "Action": [
        "cloudformation:ValidateTemplate",
        "cloudformation:GetTemplateSummary"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ServerlessDeploymentBucket",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:PutEncryptionConfiguration",
        "s3:GetEncryptionConfiguration",
        "s3:PutBucketVersioning",
        "s3:PutBucketTagging",
        "s3:PutBucketPublicAccessBlock",
        "s3:GetBucketPublicAccessBlock",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::*serverlessdeploymentbucket*",
        "arn:aws:s3:::*serverlessdeploymentbucket*/*"
      ]
    },
    {
      "Sid": "Lambda",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:ListVersionsByFunction",
        "lambda:PublishVersion",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:GetPolicy",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:CreateEventSourceMapping",
        "lambda:UpdateEventSourceMapping",
        "lambda:DeleteEventSourceMapping",
        "lambda:GetEventSourceMapping"
      ],
      "Resource": [
        "arn:aws:lambda:eu-west-3:<ACCOUNT_ID>:function:alexa-*",
        "arn:aws:lambda:eu-west-1:<ACCOUNT_ID>:function:mawaqit-azan-*",
        "arn:aws:lambda:eu-west-3:<ACCOUNT_ID>:event-source-mapping:*"
      ]
    },
    {
      "Sid": "LambdaListGlobal",
      "Effect": "Allow",
      "Action": ["lambda:ListEventSourceMappings"],
      "Resource": "*"
    },
    {
      "Sid": "IamExecutionRoles",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:TagRole",
        "iam:UntagRole"
      ],
      "Resource": [
        "arn:aws:iam::<ACCOUNT_ID>:role/alexa-*",
        "arn:aws:iam::<ACCOUNT_ID>:role/mawaqit-alexa-azan-*"
      ]
    },
    {
      "Sid": "Sqs",
      "Effect": "Allow",
      "Action": [
        "sqs:CreateQueue",
        "sqs:DeleteQueue",
        "sqs:GetQueueAttributes",
        "sqs:SetQueueAttributes",
        "sqs:TagQueue",
        "sqs:ListQueueTags"
      ],
      "Resource": [
        "arn:aws:sqs:eu-west-3:<ACCOUNT_ID>:mawaqit-alexa-azan-queue-*",
        "arn:aws:sqs:eu-west-3:<ACCOUNT_ID>:mawaqit-alexa-azan-dlq-*"
      ]
    },
    {
      "Sid": "DynamoDbTables",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "dynamodb:UpdateTable",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:ListTagsOfResource",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:DescribeContinuousBackups"
      ],
      "Resource": [
        "arn:aws:dynamodb:eu-west-3:<ACCOUNT_ID>:table/mawaqit-alexa-azan-users-data-*",
        "arn:aws:dynamodb:eu-west-3:<ACCOUNT_ID>:table/mawaqit-alexa-mosque-azan-data-*"
      ]
    },
    {
      "Sid": "SchedulerGroup",
      "Effect": "Allow",
      "Action": [
        "scheduler:CreateScheduleGroup",
        "scheduler:DeleteScheduleGroup",
        "scheduler:GetScheduleGroup",
        "scheduler:TagResource",
        "scheduler:UntagResource",
        "scheduler:ListTagsForResource"
      ],
      "Resource": "arn:aws:scheduler:eu-west-3:<ACCOUNT_ID>:schedule-group/mawaqit-azan-schedule-*"
    },
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:PutRetentionPolicy",
        "logs:DeleteRetentionPolicy",
        "logs:TagResource",
        "logs:ListTagsForResource"
      ],
      "Resource": [
        "arn:aws:logs:eu-west-3:<ACCOUNT_ID>:log-group:/aws/lambda/alexa-*",
        "arn:aws:logs:eu-west-1:<ACCOUNT_ID>:log-group:/aws/lambda/mawaqit-azan-*"
      ]
    },
    {
      "Sid": "LogsAndSqsDescribeGlobal",
      "Effect": "Allow",
      "Action": ["logs:DescribeLogGroups", "sqs:ListQueues"],
      "Resource": "*"
    }
  ]
}
```

> **Note on `iam:PassRole`:** it is scoped to the two execution-role name
> patterns, so the deploy role can only hand those roles to Lambda/Scheduler —
> not arbitrary roles. This is the main lever that keeps a Serverless deploy
> role from becoming an admin role.
>
> Serverless deploys are broad by nature (CloudFormation creates many resource
> types). If you need to tighten further, use a **CloudFormation service role**:
> give the GitHub role only `cloudformation:*` + `iam:PassRole` on a dedicated
> CFN role, and put the resource permissions above on that CFN role instead.
