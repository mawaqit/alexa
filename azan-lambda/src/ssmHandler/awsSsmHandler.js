const { SSMClient, GetParametersCommand } = require("@aws-sdk/client-ssm");

const ssmRegion = process.env.TARGET_SSM_REGION;
const ssmClient = new SSMClient({ region: ssmRegion });

let initPromise;

async function initApiKeysOnce() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const parameterNames = [
      "/alexa/api/key/mawaqit",
      "/alexa/api/key/google",
      "/alexa/clientId",
      "/alexa/clientSecret",
    ];

    const command = new GetParametersCommand({
      Names: parameterNames,
      WithDecryption: true,
    });

    const data = await ssmClient.send(command);

    console.log("Parameters retrieved from AWS SSM");
    if (data.InvalidParameters && data.InvalidParameters.length > 0) {
      throw new Error(
        `Failed to retrieve SSM parameters: ${data.InvalidParameters.join(", ")}`
      );
    }

    const PARAM_KEY_MAP = {
      "/alexa/api/key/mawaqit": "mawaqit",
      "/alexa/api/key/google": "google",
      "/alexa/clientId": "clientId",
      "/alexa/clientSecret": "clientSecret",
    };

    const parameterValues = data.Parameters.reduce((acc, param) => {
      const key = PARAM_KEY_MAP[param.Name];
      if (key) acc[key] = param.Value;
      return acc;
    }, {});
    console.log("Parameters loaded:", Object.keys(parameterValues).join(", "));
    process.env.mawaqitApiKey = parameterValues.mawaqit;
    process.env.googleApiKey = parameterValues.google;
    process.env.clientId = parameterValues.clientId;
    process.env.clientSecret = parameterValues.clientSecret;
  })().catch((err) => {
    initPromise = undefined; // Allow retry on next invocation
    throw err;
  });

  return initPromise;
}

const handler = async () => {
  await initApiKeysOnce();
};

module.exports = {
  handler,
};
