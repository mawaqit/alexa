#!/usr/bin/env node
"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const askStatesPath = path.join(__dirname, "ask-states.json");
const askStatesExamplePath = path.join(__dirname, "ask-states.json.example");

if (!fs.existsSync(askStatesPath) && fs.existsSync(askStatesExamplePath)) {
  fs.copyFileSync(askStatesExamplePath, askStatesPath);
}

const profile = process.env.ASK_PROFILE || "MAWAQIT";

try {
  execSync(`ask deploy --target skill-metadata --profile ${profile}`, {
    stdio: "inherit",
    shell: true,
  });
} catch (error) {
  process.exit(error.status || 1);
}
