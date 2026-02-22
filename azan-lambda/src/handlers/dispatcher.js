// -*- coding: utf-8 -*-

// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.

// Licensed under the Amazon Software License (the "License"). You may not use this file except in
// compliance with the License. A copy of the License is located at

//    http://aws.amazon.com/asl/

// or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific
// language governing permissions and limitations under the License.

"use strict";

const AlexaResponse = require("./AlexaResponse");
const ssmHandler = require("../ssmHandler/awsSsmHandler");
const authHandler = require("../authHandler/authHandler");
const dbHandler = require("../dbHandler/dynamoDbHandler");

/**
 * Initializes the SSM handler to load configuration.
 */
async function initializeConfiguration() {
  try {
    await ssmHandler.handler();
  } catch (error) {
    console.error("index.handler ssmHandler error  -----", error);
    throw error;
  }
}

/**
 * Validates if the event contains a directive.
 * @param {Object} event
 * @returns {boolean}
 */
function isValidDirective(event) {
  return event && "directive" in event;
}

/**
 * Validates the payload version of the directive.
 * @param {Object} event
 * @returns {boolean}
 */
function isValidPayloadVersion(event) {
  return event?.directive?.header?.payloadVersion === "3";
}

/**
 * Helper to log and return the response.
 * @param {Object} response
 * @returns {Object}
 */
function sendResponse(response) {
  console.log("index.handler response -----");
  console.log(JSON.stringify(response));
  return response;
}

/**
 * Creates an error response object.
 * @param {string} type
 * @param {string} message
 * @returns {Object}
 */
function createErrorResponse(type, message) {
  const response = new AlexaResponse({
    name: "ErrorResponse",
    payload: {
      type: type,
      message: message,
    },
  });
  return response.get();
}

/**
 * Handles Alexa.Authorization directives.
 * @param {Object} event
 * @returns {Promise<Object>} Alexa response
 */
async function handleAuthorization(event) {
  try {
    const authCode = event?.directive?.payload?.grant?.code;
    if (!authCode) {
      return createErrorResponse(
        "ACCEPT_GRANT_FAILED",
        "Missing authorization code",
      );
    }
    const accessToken = await authHandler.getRefreshToken(authCode);
    const tokenFromRequest = event?.directive?.payload?.grantee?.token;
    if (!tokenFromRequest) {
      return createErrorResponse("ACCEPT_GRANT_FAILED", "Missing grantee token");
    }
    const userInfo = await authHandler.getUserInfo(tokenFromRequest);
    if (!userInfo) {
      return createErrorResponse("ACCEPT_GRANT_FAILED", "Failed to get user info");
    }
    await dbHandler.UpdateAzanUserInfo(userInfo.user_id, {
      refreshToken: accessToken.refresh_token,
      emailId: userInfo.email,
    });
  } catch (error) {
    console.log("Error in Authorization Event: ", error);
    return createErrorResponse(
      "ACCEPT_GRANT_FAILED",
      "Failed to handle the authorization request",
    );
  }

  const response = new AlexaResponse({
    namespace: "Alexa.Authorization",
    name: "AcceptGrant.Response",
  });
  return response.get();
}

/**
 * Handles Alexa.Discovery directives.
 * @param {Object} event
 * @returns {Promise<Object>} Alexa response
 */
async function handleDiscovery(event) {
  let endpointId = "mawaqit-azan-trigger";

  try {
    const accessTokenFromDirective = event?.directive?.payload?.scope?.token;
    console.log(
      "AccessTokenFromDirective received: ",
      accessTokenFromDirective ? "[REDACTED]" : "missing",
    );
    const userInfo = await authHandler.getUserInfo(accessTokenFromDirective);

    // Append user-specific part to endpointId if available
    // Original logic: endpointId += "-" + userInfo.user_id.split(".")[2];
    if (userInfo?.user_id) {
      const userIdParts = userInfo.user_id.split(".");
      if (userIdParts.length > 2) {
        endpointId += "-" + userIdParts[2];
      }

      await dbHandler.UpdateAzanUserInfo(userInfo.user_id, {
        endpointId: endpointId,
      });
    }
  } catch (error) {
    console.error("Error in Alexa Discovery: ", error);
    return createErrorResponse(
      "INTERNAL_ERROR",
      "Failed to handle the discovery request",
    );
  }

  const response = new AlexaResponse({
    namespace: "Alexa.Discovery",
    name: "Discover.Response",
  });

  const capabilityAlexa = response.createPayloadEndpointCapability();
  const capabilityDoorbell = response.createPayloadEndpointCapability({
    interface: "Alexa.DoorbellEventSource",
    proactivelyReported: true,
  });

  response.addPayloadEndpoint({
    friendlyName: "MAWAQIT Azan",
    endpointId: endpointId,
    capabilities: [capabilityAlexa, capabilityDoorbell],
    manufacturerName: "MAWAQIT",
    model: "MAWAQIT Azan",
    description: "MAWAQIT Azan",
    displayCategories: ["DOORBELL"],
  });

  return response.get();
}

/**
 * Helper to log requests and context.
 * @param {Object} event
 * @param {Object} context
 */
function logRequest(event, context) {
  console.log("index.handler request  -----");
  console.log(JSON.stringify(event));
  if (context !== undefined) {
    console.log("index.handler context  -----");
    console.log(JSON.stringify(context));
  }
}

/**
 * Main Lambda Handler
 */
exports.handler = async function (event, context) {
  logRequest(event, context);

  try {
    await initializeConfiguration();
  } catch (error) {
    return sendResponse(
      createErrorResponse(
        "INTERNAL_ERROR",
        "Configuration initialization failed",
      ),
    );
  }

  if (!isValidDirective(event)) {
    return sendResponse(
      createErrorResponse(
        "INVALID_DIRECTIVE",
        "Missing key: directive, Is request a valid Alexa directive?",
      ),
    );
  }

  if (!isValidPayloadVersion(event)) {
    return sendResponse(
      createErrorResponse(
        "INTERNAL_ERROR",
        "This skill only supports Smart Home API version 3",
      ),
    );
  }

  const namespace = event?.directive?.header?.namespace;

  if (!namespace) {
    console.error("No namespace found in directive");
    return sendResponse(
      createErrorResponse(
        "INVALID_DIRECTIVE",
        "No namespace found in directive",
      ),
    );
  }

  switch (namespace.toLowerCase()) {
    case "alexa.authorization":
      return sendResponse(await handleAuthorization(event));

    case "alexa.discovery":
      return sendResponse(await handleDiscovery(event));

    default:
      console.error(`Unknown namespace: ${namespace}`);
      return sendResponse(
        createErrorResponse(
          "INVALID_DIRECTIVE",
          `Unknown namespace: ${namespace}`,
        ),
      );
  }
};
