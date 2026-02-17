const { SSMClient, GetParametersCommand } = require("@aws-sdk/client-ssm");
// Region and credentials are automatically loaded from the Lambda environment
const client = new SSMClient();

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

    let data;
    try {
      const command = new GetParametersCommand({
        Names: parameterNames,
        WithDecryption: true,
      });
      data = await client.send(command);
    } catch (error) {
      console.error("Error retrieving parameters from SSM:", error);
      throw error;
    }

    if (data.InvalidParameters && data.InvalidParameters.length > 0) {
      const errorMsg = `Invalid/Missing SSM Parameters: ${data.InvalidParameters.join(", ")}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
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
  })();

  return initPromise;
}

exports.handler = async () => {
  await initApiKeysOnce();
};
