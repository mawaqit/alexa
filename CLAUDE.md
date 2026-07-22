# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Backend for the MAWAQIT Alexa skill. Two independently deployed Serverless
Framework services plus the Alexa skill package itself. See the
[README](README.md) for the full layout and [INTERNAL.md](INTERNAL.md) for
deployment.

| Path             | Language   | Role                                                       |
| ---------------- | ---------- | ---------------------------------------------------------- |
| `lambda/`        | JavaScript | Main skill backend (intents, prayer times, routines, APL)  |
| `azan-lambda/`   | TypeScript | Smart Home dispatcher for the Azan (adhan) trigger         |
| `skill-package/` | JSON       | Manifest, interaction models, tasks, widgets               |

pnpm workspace. All tooling (jest, eslint, prettier, tsconfig) lives at the
root and covers both services — run every command from the repo root.

## Commands

```bash
pnpm test            # whole suite, both services
pnpm typecheck       # tsc --noEmit
pnpm lint            # eslint (type-aware on .ts)
pnpm lint:fix        # eslint --fix, also applies prettier
```

The pre-push hook runs lint → typecheck → tests. CI runs the same gate before
any deploy.

## The JS/TS split

The codebase is migrating to TypeScript service by service. `azan-lambda` is
done; `lambda` is not. Do not convert files opportunistically — a migration is
its own change, done with a test safety net in place first.

To migrate another service: add its directories to `include` in
`tsconfig.json`, rename the files, and fix the fallout. The jest transform,
eslint config, and CI already handle both languages.

### Rules for TypeScript here

- **Strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.**
  Do not loosen `tsconfig.json` to make an error go away.
- **No `any`** — enforced by `@typescript-eslint/no-explicit-any`. Prefer
  `unknown` plus a type predicate at the boundary. There are no `@ts-ignore` or
  `eslint-disable` comments in `azan-lambda/src`; keep it that way.
- **Type assertions only at real boundaries.** The DynamoDB reads are the only
  ones (a schemaless table cannot be typed any other way).
- **Untrusted input is `unknown`.** `dispatcher.handler` takes `unknown` and
  narrows with type predicates. Do not type an incoming Alexa event as its
  happy-path shape.
- **`import` / `export` only — never `require`, never `module.exports`.**
  Enforced by `@typescript-eslint/no-require-imports`. The root configs are
  `.mjs` for the same reason. CommonJS is only what esbuild *emits* for the
  Lambda runtime; it is never something you write.
- **Interfaces belong in `src/types/`**, one file per domain, holding no logic.
  Implementation files import them with `import type`.
- **Nothing compiles to disk.** esbuild bundles at deploy time and ts-jest at
  test time. `tsc` is a checker only — do not add a build step or a `dist/`.

### Layout of `azan-lambda/src`

| Directory   | Holds                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| `handlers/` | `dispatcher.ts` is the Lambda entry (validate + route); one file per Alexa directive beside it |
| `alexa/`    | `AlexaResponse` builder, `errorResponse`, and `constants` (Amazon's string literals) |
| `services/` | Everything that does I/O: `amazonAuth`, `azanUsers`, `secrets`           |
| `types/`    | Interfaces and type aliases only                                        |

`src/types/smartHomeRequest.ts` and `src/types/smartHomeResponse.ts` are split
deliberately: incoming fields are `?: T | undefined` (absent and undefined both
mean "Amazon did not send it"), outgoing fields are required (we build those, so
they must be complete). Preserve that asymmetry.

`serverless.yml` points at `src/handlers/dispatcher.handler` — that path is
load-bearing, do not move the file without updating it.

## Testing

Jest, from the root. Tests live in `<service>/tests/` next to the code they
cover. `lambda` tests are `.test.js`, `azan-lambda` tests are `.test.ts`.

Conventions worth matching:

- Each file opens with a comment explaining **why** the behaviour matters, not
  what the file does.
- Test names state the behaviour ("drops the endpoint from Discover.Response"),
  not the mechanism.
- Comment the non-obvious assertions with the failure they prevent.

Two things bite in the TypeScript tests specifically:

- **Statement order matters.** TypeScript keeps top-level statements in source
  order, so anything a module reads at load time (`process.env`, mock state
  used by a `jest.mock` factory) must be set up *above* the import of the
  module under test. `azanUsers.test.ts` imports last for this reason.
- **`jest.isolateModulesAsync` + dynamic `import()`** is how a test gets a
  fresh copy of module-level state (see `secrets.test.ts`); a top-level
  `import` is hoisted and would hand back the cached module.

## Logging (azan-lambda)

- **Use `src/logging/logger`, never `console`** — enforced by `no-console:
  error` on `azan-lambda/src`. Console output carries no request id, so
  concurrent invocations are indistinguishable in a shared CloudWatch stream.
- **Structured data goes in the second argument**, not interpolated into the
  message — that is what makes a field filterable in Logs Insights:
  `logger.info("User updated", { userId })`, not `` logger.info(`User ${userId}…`) ``.
- **Never log a raw directive, event, or error response body.** An AcceptGrant
  payload carries a live OAuth code and a bearer token; a Discover payload
  carries an access token. Log their *presence*
  (`hasGrantCode: Boolean(...)`), never their value. `describeDirective()` in
  `dispatcher.ts` is the pattern to follow.
- Levels: `logger.debug` for per-step tracing, `info` for state changes worth
  keeping, `error` for a failed path. `LOG_LEVEL` controls verbosity
  (`DEBUG` | `INFO` | `WARN` | `ERROR` | `SILENT`), default `INFO`.
- The test suite sets `LOG_LEVEL=SILENT`; `VERBOSE_LOGS=1` restores output for
  both services.

## Conventions

- Comments explain *why*, and are used where the reasoning is not obvious from
  the code. Match the surrounding density — this codebase comments the
  non-obvious and stays quiet elsewhere.
- Prettier settings are in `.prettierrc.json` and enforced through eslint; run
  `pnpm lint:fix` rather than formatting by hand.
- Never commit or push unless asked.
- The Amazon copyright headers at the top of `AlexaResponse.ts` and
  `dispatcher.ts` are a license requirement — leave them in place.

## Gotchas

- **Regions are split.** `azan-lambda` runs its compute in `eu-west-1`
  (Ireland) but reads DynamoDB and SSM from `eu-west-3` (Paris). The clients
  set the region explicitly; without it the SDK silently uses the compute
  region and every call fails.
- **The dispatcher must never throw.** A thrown exception reaches Alexa as an
  opaque timeout, so every path returns a Smart Home error envelope instead.
- **Secrets arrive after module load.** `services/secrets.ts` writes them onto
  `process.env` on first invocation, so read `process.env.clientId` at call
  time, never at import time.
- **`AcceptGrant.Response` and `Discover.Response` must not carry an
  `endpoint`** — Amazon rejects the message. `AlexaResponse` strips it.
