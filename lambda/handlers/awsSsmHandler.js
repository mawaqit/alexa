const AWS = require("aws-sdk");

// Create an AWS SSM client
const ssm = new AWS.SSM();

exports.handler = async () => {
  try {
    // Define the parameter names or paths
    const parameterNames = [
      "/alexa/api/key/mawaqit",
      "/alexa/api/key/google",
      // Add more parameter names or paths as needed
    ];

    // Fetch parameters from Parameter Store
    const data = await ssm
      .getParameters({
        Names: parameterNames,
        WithDecryption: true, // Set to true if you have secure strings
      })
      .promise();

    console.log("Parameters retrieved from AWS SSM");

    // Extract parameter values
    const parameterValues = data.Parameters.reduce((acc, param) => {
      const parameterName = param.Name.replace(/^\/alexa\/api\/key\//, "");
      acc[parameterName] = param.Value;
      return acc;
    }, {});

    // Set parameter values as environment variables
    process.env.mawaqitApiKey = parameterValues.mawaqit;
    process.env.googleApiKey = parameterValues.google;
    
  } catch (err) {
    console.error("Error retrieving parameters:", err);
  }
};
