// -*- coding: utf-8 -*-

// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.

// Licensed under the Amazon Software License (the "License"). You may not use this file except in
// compliance with the License. A copy of the License is located at

//    http://aws.amazon.com/asl/

// or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific
// language governing permissions and limitations under the License.

import type { Context } from "aws-lambda";

import type { AlexaResponse } from "../alexa/AlexaResponse";
import { PAYLOAD_VERSION, SUPPORTED_NAMESPACES } from "../alexa/constants";
import { createErrorResponse } from "../alexa/errorResponse";
import { logger, withLambdaContext } from "../logging/logger";
import { redact } from "../logging/redact";
import { loadSecrets } from "../services/secrets";
import type { SmartHomeRequest } from "../types/smartHomeRequest";
import { handleAuthorization } from "./authorization";
import { handleDiscovery } from "./discovery";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Narrows an unvalidated event to one that carries a `directive`.
 *
 * A type predicate, and that is the point: `event.directive` is unreadable
 * anywhere in this service until this has been called.
 */
function isValidDirective(event: unknown): event is SmartHomeRequest {
  return typeof event === "object" && event !== null && "directive" in event;
}

/** This skill implements Smart Home v3 only. */
function isValidPayloadVersion(event: SmartHomeRequest): boolean {
  return event.directive.header?.payloadVersion === PAYLOAD_VERSION;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/**
 * Logs the outgoing response and hands it back unchanged. Redacted like the
 * request: a response that echoes an endpoint carries its scope token.
 */
function sendResponse(response: AlexaResponse): AlexaResponse {
  logger.info("==== RESPONSE ====", { response: redact(response) });
  return response;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Lambda entry point for the Smart Home skill. Wired up in serverless.yml as
 * `src/handlers/dispatcher.handler`.
 *
 * `event` is typed `unknown` on purpose: it arrives from Alexa unvalidated, and
 * the guards below are what make it safe to read.
 *
 * Every path returns a response — a throw escaping this function reaches Alexa
 * as an opaque timeout, so failures are answered, never raised.
 */
export const handler = async function (
  event: unknown,
  context?: Context,
): Promise<AlexaResponse> {
  // Stamps every later line with this invocation's request id.
  withLambdaContext(context);

  // Logged before any validation, so a malformed event is visible too. Never
  // the raw event: an AcceptGrant carries a live OAuth code and bearer tokens.
  logger.info("==== REQUEST ====", { request: redact(event) });

  // Fail closed: without the SSM secrets every downstream call would fail with
  // a confusing auth error instead of a clear one.
  try {
    await loadSecrets();
  } catch (error) {
    logger.error("Configuration initialization failed", { error });
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

  const namespace = event.directive.header?.namespace;

  if (!namespace) {
    logger.error("No namespace found in directive");
    return sendResponse(
      createErrorResponse(
        "INVALID_DIRECTIVE",
        "No namespace found in directive",
      ),
    );
  }

  // Lowercased: Alexa is not consistent about the case it sends.
  switch (namespace.toLowerCase()) {
    case SUPPORTED_NAMESPACES.authorization:
      return sendResponse(await handleAuthorization(event));

    case SUPPORTED_NAMESPACES.discovery:
      return sendResponse(await handleDiscovery(event));

    default:
      logger.error("Unknown namespace", { namespace });
      return sendResponse(
        createErrorResponse(
          "INVALID_DIRECTIVE",
          `Unknown namespace: ${namespace}`,
        ),
      );
  }
};
