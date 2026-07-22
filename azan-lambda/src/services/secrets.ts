import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";

import { logger } from "../logging/logger";

/**
 * Loads the skill's secrets from SSM Parameter Store onto `process.env`.
 *
 * Parameters live in Paris (eu-west-3) while this Lambda runs in Ireland
 * (eu-west-1). serverless.yml always injects TARGET_SSM_REGION; the branch
 * exists so an unset value falls back to the SDK's own region resolution
 * rather than being passed through as an explicit `undefined`.
 */
const ssmRegion = process.env.TARGET_SSM_REGION;
const ssmClient = new SSMClient(ssmRegion ? { region: ssmRegion } : {});

/**
 * SSM parameter name -> the environment variable its consumers read.
 *
 * The keys double as the list of parameters to fetch, so adding a secret is a
 * single edit here.
 */
const PARAM_ENV_MAP = {
  "/alexa/api/key/mawaqit": "mawaqitApiKey",
  "/alexa/api/key/google": "googleApiKey",
  "/alexa/clientId": "clientId",
  "/alexa/clientSecret": "clientSecret",
} as const satisfies Record<string, string>;

type ParameterName = keyof typeof PARAM_ENV_MAP;

const isKnownParameter = (name: string | undefined): name is ParameterName =>
  name !== undefined && name in PARAM_ENV_MAP;

/**
 * Cached for the lifetime of a warm container: the secrets do not change while
 * a container lives, and an SSM round-trip per azan dispatch would be both slow
 * and needlessly rate-limited.
 */
let initPromise: Promise<void> | undefined;

async function fetchSecretsOnce(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const command = new GetParametersCommand({
      Names: Object.keys(PARAM_ENV_MAP),
      WithDecryption: true,
    });

    const data = await ssmClient.send(command);

    logger.debug("Parameters retrieved from AWS SSM");
    if (data.InvalidParameters && data.InvalidParameters.length > 0) {
      // Failing loudly is the point: a missing parameter would otherwise leave
      // the env var unset and surface much later as an opaque 401 from Amazon.
      throw new Error(
        `Failed to retrieve SSM parameters: ${data.InvalidParameters.join(", ")}`,
      );
    }

    const loaded: string[] = [];
    for (const param of data.Parameters ?? []) {
      // Assigning `undefined` to process.env would store the *string*
      // "undefined" — a client secret that fails in a very confusing way.
      if (!isKnownParameter(param.Name) || param.Value === undefined) continue;
      const envKey = PARAM_ENV_MAP[param.Name];
      process.env[envKey] = param.Value;
      loaded.push(envKey);
    }
    logger.info("Secrets loaded", { parameters: loaded });
  })().catch((err: unknown) => {
    // Never cache a failure: doing so would poison the container, and every
    // later invocation on that instance would fail without ever retrying.
    initPromise = undefined;
    throw err;
  });

  return initPromise;
}

/**
 * Ensures the secrets are on `process.env`. Safe to call on every invocation —
 * only the first one in a container does any work.
 */
export const loadSecrets = async (): Promise<void> => {
  await fetchSecretsOnce();
};
