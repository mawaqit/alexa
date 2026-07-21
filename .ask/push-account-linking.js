#!/usr/bin/env node
"use strict";

// Pushes account-linking config to the skill's development stage. Reads
// .ask/account-linking.json, injects the real secret from ACCOUNT_LINKING_CLIENT_SECRET,
// and passes the request straight to `ask smapi`.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SKILL_ID = "amzn1.ask.skill.81a30fbf-496f-4aa4-a60b-9e35fb513506";
const PROFILE = process.env.ASK_PROFILE || "MAWAQIT";

const secret = process.env.ACCOUNT_LINKING_CLIENT_SECRET;
if (!secret) {
  throw new Error("ACCOUNT_LINKING_CLIENT_SECRET is not set.");
}

const request = JSON.parse(
  fs.readFileSync(path.join(__dirname, "account-linking.json"), "utf8"),
);
request.accountLinkingRequest.clientSecret = secret;

execFileSync(
  "ask",
  [
    "smapi",
    "update-account-linking-info",
    "--skill-id",
    SKILL_ID,
    "--stage",
    "development",
    "--account-linking-request",
    JSON.stringify(request),
    "--profile",
    PROFILE,
  ],
  { stdio: "inherit" },
);
