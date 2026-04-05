const Alexa = require("ask-sdk-core");
const axios = require("axios");
const AMAZON_BASE_URL = "https://api.amazon.com";
const dbHandler = require("./dynamoDbHandler");

const AuthHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "Alexa.Authorization.Grant"
    );
  },
  async handle(handlerInput) {
    const { attributesManager } = handlerInput;
    const code = handlerInput.requestEnvelope.request?.body?.grant?.code;
    if (!code) {
      console.error("No authorization code found in the request");
      return handlerInput.responseBuilder.getResponse();
    }
    try {
      const attributes =
        (await attributesManager.getPersistentAttributes()) || {};
      attributes.code = code;
      attributesManager.setPersistentAttributes(attributes);
      await attributesManager.savePersistentAttributes();
      const accessToken = await getRefreshToken(code);
      const userInfo = await getUserInfo(accessToken.access_token);

      await dbHandler.UpdateAzanUserInfo(userInfo.user_id, {
        refreshToken: accessToken.refresh_token,
        emailId: userInfo.email,
      });
    } catch (error) {
      console.error("Failed to save authorization code:", error);
    }
    return handlerInput.responseBuilder.getResponse();
  },
};

async function getRefreshToken(authCode) {
  console.log("Exchanging auth code for tokens");
  if (!authCode) {
    throw new Error("Auth code is required");
  }
  const data = new URLSearchParams({
    client_id: process.env.clientId,
    client_secret: process.env.clientSecret,
    grant_type: "authorization_code",
    code: authCode,
  });

  const config = {
    method: "post",
    maxBodyLength: Infinity,
    url: AMAZON_BASE_URL + "/auth/o2/token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    data: data,
  };

  try {
    const response = await axios.request(config);
    console.log("GetRefreshToken: token exchange successful");
    return response.data;
  } catch (error) {
    console.log("Error in GetRefreshToken: ", error?.response?.data);
    throw error;
  }
}

async function getUserInfo(accessToken) {
  console.log("Access Token: ", accessToken);
  if (!accessToken) {
    throw new Error("Access token is required");
  }
  let config = {
    method: "get",
    maxBodyLength: Infinity,
    url: AMAZON_BASE_URL + "/user/profile",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  try {
    const response = await axios.request(config);
    console.log("GetUserInfo: profile fetched successfully");
    return response.data;
  } catch (error) {
    console.error("Error in GetUserInfo: ", error?.response?.data);
    throw error;
  }
}

async function getAccessTokenFromRefreshToken(refreshToken) {
  console.log("Getting access token from refresh token");
  if (!refreshToken) {
    throw new Error("Refresh token is required");
  }

  let data = new URLSearchParams({
    client_id: process.env.clientId,
    client_secret: process.env.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: AMAZON_BASE_URL + "/auth/o2/token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    data: data,
  };

  try {
    const response = await axios.request(config);
    console.log("GetAccessTokenFromRefreshToken: token refreshed successfully");
    return response.data;
  } catch (error) {
    console.error(
      "Error in GetAccessTokenFromRefreshToken: ",
      error?.response?.data || error.message,
    );
    throw error;
  }
}

module.exports = {
  AuthHandler,
  getUserInfo,
  getRefreshToken,
  getAccessTokenFromRefreshToken,
};
