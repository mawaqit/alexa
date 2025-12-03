const AWS = require("aws-sdk");
const ssm = new AWS.SSM();

let initPromise;

async function initApiKeysOnce() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const parameterNames = [
      "/alexa/api/key/mawaqit",
      "/alexa/api/key/google",
      "/alexa/clientId",
      "/alexa/clientSecret"
    ];

    const data = await ssm
      .getParameters({
        Names: parameterNames,
        WithDecryption: true,
      })
      .promise();

    console.log("Parameters retrieved from AWS SSM");

    const parameterValues = data.Parameters.reduce((acc, param) => {
      const key = ( param.Name.startsWith("/alexa/api/key") ) ? param.Name.replace(/^\/alexa\/api\/key\//, "") : param.Name.replace(/^\/alexa\//, "");
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
