#!/usr/bin/env node
"use strict";

// Builds web/ against the right backend for a stage, syncs it to that
// stage's S3 bucket, and invalidates CloudFront so viewers see it
// immediately instead of waiting out the cache TTL.
//
// Deliberately does NOT look up the API URL via `aws cloudformation
// describe-stacks` against the lambda/ stack: that would mean guessing the
// exact CloudFormation logical id Serverless Framework gives the HTTP API
// resource, and getting it wrong risks nothing here — but the same instinct
// applied to the *existing*, already-deployed lambda/ stack elsewhere would
// risk breaking a real deploy over a guess. web/.env.<stage> instead holds
// that URL as a one-time, human-verified value (see the TODO in those
// files) — it's a stable API Gateway endpoint that doesn't change between
// deploys once created.
//
// The bucket/distribution lookup below is different: web-infra/serverless.yml
// is a stack this script's own author controls, so its Outputs are a source
// of truth we can trust, not a guess.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..");
const WEB_DIR = path.join(REPO_ROOT, "web");

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { stdio: "inherit", cwd: REPO_ROOT, ...options });
}

function runCapture(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function main() {
  const stage = process.argv[2];
  if (stage !== "dev" && stage !== "prod") {
    console.error("Usage: node scripts/deploy-web.js <dev|prod>");
    process.exit(1);
  }

  const region = process.env.AWS_REGION || "eu-west-3";

  const envFile = path.join(WEB_DIR, `.env.${stage}`);
  const apiBaseUrl = readViteApiBaseUrl(envFile);
  if (!apiBaseUrl) {
    console.error(
      `${envFile} has no VITE_API_BASE_URL set — fill it in with the deployed lambda/ API URL for "${stage}" first (see the TODO comment in that file).`,
    );
    process.exit(1);
  }

  console.log(`Building web/ for stage "${stage}" against ${apiBaseUrl} ...`);
  run("pnpm", ["--filter", "./web", "exec", "vite", "build", "--mode", stage]);

  const stackName = `mawaqit-alexa-web-infra-${stage}`;
  console.log(`Looking up ${stackName} outputs...`);
  const outputsJson = runCapture("aws", [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stackName,
    "--region",
    region,
    "--query",
    "Stacks[0].Outputs",
    "--output",
    "json",
  ]);
  const outputs = Object.fromEntries(
    JSON.parse(outputsJson).map((entry) => [
      entry.OutputKey,
      entry.OutputValue,
    ]),
  );
  const bucketName = outputs.BucketName;
  const distributionId = outputs.DistributionId;
  if (!bucketName || !distributionId) {
    console.error(
      `Stack ${stackName} has no BucketName/DistributionId output — has web-infra been deployed for "${stage}" yet? (pnpm --filter ./web-infra run deploy:${stage})`,
    );
    process.exit(1);
  }

  run("aws", [
    "s3",
    "sync",
    path.join(WEB_DIR, "dist"),
    `s3://${bucketName}`,
    "--delete",
    "--region",
    region,
  ]);
  run("aws", [
    "cloudfront",
    "create-invalidation",
    "--distribution-id",
    distributionId,
    "--paths",
    "/*",
  ]);

  console.log(`\nDeployed: https://${outputs.DistributionDomainName}`);
}

function readViteApiBaseUrl(envFilePath) {
  if (!fs.existsSync(envFilePath)) return null;
  const match = fs
    .readFileSync(envFilePath, "utf8")
    .match(/^VITE_API_BASE_URL=(.*)$/m);
  return match?.[1]?.trim() || null;
}

main();
