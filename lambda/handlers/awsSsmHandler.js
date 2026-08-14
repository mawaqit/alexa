const { SSMClient, GetParametersCommand } = require("@aws-sdk/client-ssm");
// Region and credentials are automatically loaded from the Lambda environment
const client = new SSMClient();

let initPromise;

const REQUIRED_PARAMETER_NAMES = [
  "/alexa/api/key/mawaqit",
  "/alexa/api/key/google",
  "/alexa/clientId",
  "/alexa/clientSecret",
];

// The companion website logs in against its own LWA Security Profile — a
// different app from the skill's own account-linking client above — so it
// gets its own client id/secret plus a session-signing secret. These are
// intentionally optional at this layer: until the user has created them in
// SSM, the website's routes simply won't have credentials to work with, but
// the skill's own SSM bootstrap (shared by every Lambda in this service)
// must not fail over a feature that hasn't been provisioned yet.
const OPTIONAL_PARAMETER_NAMES = [
  "/alexa/webClientId",
  "/alexa/webClientSecret",
  "/alexa/webSessionSecret",
];

async function initApiKeysOnce() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const parameterNames = [
      ...REQUIRED_PARAMETER_NAMES,
      ...OPTIONAL_PARAMETER_NAMES,
    ];

    let data;
    try {
      const command = new GetParametersCommand({
        Names: parameterNames,
        WithDecryption: true,
      });
      data = await client.send(command);
    } catch (error) {
      console.error("Error retrieving parameters from SSM:", error);
      initPromise = null;
      throw error;
    }

    const invalidParameters = data.InvalidParameters || [];
    const missingRequired = invalidParameters.filter((name) =>
      REQUIRED_PARAMETER_NAMES.includes(name),
    );
    if (missingRequired.length > 0) {
      const errorMsg = `Invalid/Missing SSM Parameters: ${missingRequired.join(", ")}`;
      console.error(errorMsg);
      initPromise = null;
      throw new Error(errorMsg);
    }
    const missingOptional = invalidParameters.filter((name) =>
      OPTIONAL_PARAMETER_NAMES.includes(name),
    );
    if (missingOptional.length > 0) {
      console.warn(
        `Optional SSM Parameters not yet created (companion website will not work until they are): ${missingOptional.join(", ")}`,
      );
    }
    console.log("Parameters retrieved from AWS SSM");

    const parameterValues = data.Parameters.reduce((acc, param) => {
      const key = param.Name.startsWith("/alexa/api/key")
        ? param.Name.replace(/^\/alexa\/api\/key\//, "")
        : param.Name.replace(/^\/alexa\//, "");
      acc[key] = param.Value;
      return acc;
    }, {});

    process.env.mawaqitApiKey = parameterValues.mawaqit;
    process.env.googleApiKey = parameterValues.google;
    process.env.clientId = parameterValues.clientId;
    process.env.clientSecret = parameterValues.clientSecret;
    // The optional web params may be genuinely absent (not yet created in
    // SSM) — assigning `undefined` to a process.env property coerces it to
    // the *string* "undefined", which is truthy and would defeat every
    // `if (!process.env.webClientId)` guard downstream. Only assign when the
    // value actually came back.
    if (parameterValues.webClientId)
      process.env.webClientId = parameterValues.webClientId;
    if (parameterValues.webClientSecret)
      process.env.webClientSecret = parameterValues.webClientSecret;
    if (parameterValues.webSessionSecret)
      process.env.webSessionSecret = parameterValues.webSessionSecret;
  })();

  return initPromise;
}

exports.handler = async () => {
  await initApiKeysOnce();
};
