#!/usr/bin/env node
"use strict";

// Local dev server for webApi.js's Lambda Function URL.
//
// serverless-offline (this package's former devDependency) has no support
// for emulating Function URLs — only API Gateway REST/HTTP API events
// (confirmed: no reference to Function URLs anywhere in its installed
// source). This is a small http.createServer wrapper instead: it builds
// the same event shape a real Function URL invocation receives (Function
// URLs use the API Gateway v2 payload format), calls webApi.handler
// directly in-process, and translates the response back into a real HTTP
// response — including turning the `cookies` array the handlers return
// into real Set-Cookie headers.
//
// The handful of env vars serverless.yml would inject at deploy time are
// set here by hand instead of replicating its full variable-resolution
// system — they're either static (read straight from env.json) or a
// deterministic, well-known ARN/name shape (Serverless Framework's default
// execution-role naming convention, and this repo's own table-naming
// convention), not values that need a live CloudFormation lookup.
//
// AWS SDK calls inside the handler still go out to real AWS using whatever
// credentials are already active in this shell (e.g. `aws sso login` +
// $env:AWS_PROFILE), same as before.

const http = require("node:http");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PORT = Number(process.env.PORT) || 3000;
const STAGE = process.env.STAGE || "dev";
const REGION = process.env.AWS_REGION || "eu-west-3";

function main() {
  const envConfig = require(path.join(__dirname, "env.json"))[STAGE];
  if (!envConfig) {
    console.error(`No "${STAGE}" entry in lambda/env.json`);
    process.exit(1);
  }

  let accountId;
  try {
    accountId = execFileSync(
      "aws",
      ["sts", "get-caller-identity", "--query", "Account", "--output", "text"],
      { encoding: "utf8" },
    ).trim();
  } catch (error) {
    console.error(
      "Couldn't resolve your AWS account id — is `aws sso login` / $env:AWS_PROFILE set for this shell?",
    );
    console.error(error.message);
    process.exit(1);
  }

  setEnv(envConfig, accountId);

  // Required only after the env vars above are set: apiHandler.js reads
  // process.env.BASE_URL at module load time, so webApi.js (which pulls
  // that in transitively) must not be required any earlier than this.
  const webApi = require("./webApi.js");

  const server = http.createServer((req, res) => {
    // On real AWS, a Function URL's `Cors` config (serverless.yml) is
    // enforced by AWS itself — it adds these headers and answers OPTIONS
    // preflight before webApi.handler ever runs. This shim calls the
    // handler directly, bypassing that layer entirely, so without this the
    // browser silently drops every cross-origin fetch() from the SPA
    // (localhost:5173 → localhost:3000): no error surfaces here, it just
    // looks like every request came back "not authenticated".
    applyCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    handleRequest(webApi, req, res).catch((error) => {
      console.error("[localWebApiServer] Unhandled error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal error" }));
    });
  });

  server.listen(PORT, () => {
    console.log(
      `webApiHandler listening locally on http://localhost:${PORT} (stage=${STAGE}, account=${accountId})`,
    );
  });
}

function setEnv(envConfig, accountId) {
  process.env.STAGE = STAGE;
  process.env.AWS_REGION = REGION;
  process.env.AWS_DEFAULT_REGION = REGION;
  process.env.AWS_ACCOUNT_ID = accountId;
  process.env.BASE_URL = envConfig.baseUrl;
  process.env.PERSISTENCE_ADAPTER_TABLE_NAME = `mawaqit-alexa-user-data-${STAGE}`;
  process.env.AZAN_DYNAMO_DB_TABLE = `mawaqit-alexa-azan-users-data-${STAGE}`;
  process.env.MOSQUE_AZAN_DATA_TABLE = `mawaqit-alexa-mosque-azan-data-${STAGE}`;
  // Matches serverless.yml's SCHEDULER_ROLE_ARN exactly — Serverless
  // Framework's own naming convention for a service's default execution
  // role: ${service}-${stage}-${region}-lambdaRole. Only exercised if a
  // local test actually saves prayers (reconcileRoutinePrayers calls
  // eventBridgeScheduler, which needs this) — everything else (auth,
  // mosque search, reading config) doesn't touch it.
  process.env.SCHEDULER_ROLE_ARN = `arn:aws:iam::${accountId}:role/alexa-${STAGE}-${REGION}-lambdaRole`;
  // Deliberately NOT read from env.json: that file's webOrigin/webRedirectUri
  // describe the *deployed* stage (e.g. the real Function URL, once it's
  // registered with Amazon) — reusing them here would send a local login's
  // OAuth callback to the cloud instead of back to this process. Local dev
  // always targets localhost, overridable via env vars if ever needed
  // (e.g. testing through a tunnel).
  process.env.WEB_ORIGIN =
    process.env.LOCAL_WEB_ORIGIN || "http://localhost:5173";
  process.env.WEB_REDIRECT_URI =
    process.env.LOCAL_WEB_REDIRECT_URI ||
    `http://localhost:${PORT}/auth/callback`;
  // Stand-in until SSM has these (see awsSsmHandler.js's optional
  // parameters) — same values serverless.yml's provider.environment reads
  // for a real deploy. Only set when present so an empty env.json value
  // doesn't shadow a real one SSM already provided.
  if (envConfig.webClientId) process.env.webClientId = envConfig.webClientId;
  if (envConfig.webClientSecret)
    process.env.webClientSecret = envConfig.webClientSecret;
  if (envConfig.webSessionSecret)
    process.env.webSessionSecret = envConfig.webSessionSecret;
}

async function handleRequest(webApi, req, res) {
  const event = await buildEvent(req);
  const result = await webApi.handler(event);
  sendResponse(res, result);
}

function buildEvent(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const queryStringParameters = Object.fromEntries(url.searchParams);
      const rawBody = Buffer.concat(chunks);

      resolve({
        rawPath: url.pathname,
        cookies: splitCookieHeader(req.headers.cookie),
        headers: req.headers,
        queryStringParameters:
          Object.keys(queryStringParameters).length > 0
            ? queryStringParameters
            : undefined,
        requestContext: { http: { method: req.method } },
        body: rawBody.length > 0 ? rawBody.toString("utf8") : undefined,
        isBase64Encoded: false,
      });
    });
    req.on("error", reject);
  });
}

function splitCookieHeader(cookieHeader) {
  if (!cookieHeader) return [];
  return cookieHeader.split(";").map((pair) => pair.trim());
}

// Mirrors the `url.cors` block in serverless.yml. Access-Control-Allow-Origin
// must be the exact origin (not "*") because the frontend sends
// credentials: "include" — a wildcard origin is rejected by browsers when
// combined with Allow-Credentials: true.
function applyCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.WEB_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendResponse(res, result) {
  for (const cookie of result.cookies || []) {
    appendHeader(res, "Set-Cookie", cookie);
  }
  for (const [key, value] of Object.entries(result.headers || {})) {
    res.setHeader(key, value);
  }
  res.writeHead(result.statusCode || 200);
  res.end(result.body || "");
}

function appendHeader(res, name, value) {
  const existing = res.getHeader(name);
  if (!existing) {
    res.setHeader(name, value);
  } else if (Array.isArray(existing)) {
    res.setHeader(name, [...existing, value]);
  } else {
    res.setHeader(name, [existing, value]);
  }
}

main();
