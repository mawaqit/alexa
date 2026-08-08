/**
 * The dispatcher is the Smart Home entry point: Amazon sends it AcceptGrant and
 * Discover directives, and every reply must be a well-formed Smart Home v3
 * envelope — including the failures. A thrown exception here reaches Alexa as a
 * generic timeout, so the contract under test is "never throw, always answer".
 */

import type { AlexaResponse } from "../src/alexa/AlexaResponse";
import type { AmazonUserProfile, LwaTokenResponse } from "../src/types/amazon";
import type {
  DirectiveHeader,
  DirectivePayload,
  SmartHomeRequest,
} from "../src/types/smartHomeRequest";
import type {
  ErrorResponseType,
  PayloadEndpoint,
} from "../src/types/smartHomeResponse";

import { handler } from "../src/handlers/dispatcher";
import { getLwaTokenResponse, getUserInfo } from "../src/services/amazonAuth";
import { updateAzanUserInfo } from "../src/services/azanUsers";
import { loadSecrets } from "../src/services/secrets";

jest.mock("../src/services/secrets");
jest.mock("../src/services/amazonAuth");
jest.mock("../src/services/azanUsers");

// `jest.mocked` re-types the auto-mocked functions without changing them, so
// each one keeps its real signature in the assertions below.
const mockLoadSecrets = jest.mocked(loadSecrets);
const mockGetLwaTokenResponse = jest.mocked(getLwaTokenResponse);
const mockGetUserInfo = jest.mocked(getUserInfo);
const mockUpdateAzanUserInfo = jest.mocked(updateAzanUserInfo);

const USER_ID = "amzn1.account.ABCDEF";

const directive = (
  header: DirectiveHeader = {},
  payload: DirectivePayload = {},
): SmartHomeRequest => ({
  directive: {
    header: { namespace: "Alexa.Discovery", payloadVersion: "3", ...header },
    payload,
  },
});

const acceptGrant = (payload?: DirectivePayload): SmartHomeRequest =>
  directive(
    { namespace: "Alexa.Authorization", name: "AcceptGrant" },
    {
      grant: { type: "OAuth2.AuthorizationCode", code: "auth-code" },
      grantee: { type: "BearerToken", token: "grantee-token" },
      ...payload,
    },
  );

const discover = (token = "access-token"): SmartHomeRequest =>
  directive(
    { namespace: "Alexa.Discovery", name: "Discover" },
    { scope: { type: "BearerToken", token } },
  );

/** Asserts the reply is an ErrorResponse of the given type. */
const expectError = (
  response: AlexaResponse,
  type: ErrorResponseType,
  message?: string,
) => {
  expect(response.event.header.name).toBe("ErrorResponse");
  expect(response.event.payload.type).toBe(type);
  if (message !== undefined) {
    expect(response.event.payload.message).toBe(message);
  }
};

/** The single endpoint a Discover.Response is expected to carry. */
const discoveredEndpoint = (response: AlexaResponse): PayloadEndpoint => {
  const endpoints = response.event.payload.endpoints;
  expect(endpoints).toHaveLength(1);
  return endpoints![0]!;
};

const profile = (
  overrides: Partial<AmazonUserProfile> = {},
): AmazonUserProfile => ({ user_id: USER_ID, ...overrides });

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadSecrets.mockResolvedValue(undefined);
  mockGetUserInfo.mockResolvedValue(profile());
  mockGetLwaTokenResponse.mockResolvedValue({
    refresh_token: "refresh-token",
  } as LwaTokenResponse);
  mockUpdateAzanUserInfo.mockResolvedValue({ id: USER_ID });
});

describe("dispatcher — request validation", () => {
  it("fails closed when SSM configuration cannot be loaded", async () => {
    // Without the SSM secrets every downstream call would fail with a confusing
    // auth error, so the handler must bail out up front.
    mockLoadSecrets.mockRejectedValue(new Error("ssm down"));

    const response = await handler(discover());

    expectError(
      response,
      "INTERNAL_ERROR",
      "Configuration initialization failed",
    );
  });

  it.each([
    ["an empty object", {}],
    ["null", null],
    ["undefined", undefined],
    ["a string", "not a directive"],
    ["an unrelated payload", { foo: "bar" }],
  ])("rejects %s as a non-directive", async (_label, event) => {
    const response = await handler(event);

    expectError(
      response,
      "INVALID_DIRECTIVE",
      "Missing key: directive, Is request a valid Alexa directive?",
    );
  });

  it("rejects a payload version other than 3", async () => {
    const response = await handler(directive({ payloadVersion: "2" }));

    expectError(
      response,
      "INTERNAL_ERROR",
      "This skill only supports Smart Home API version 3",
    );
  });

  it("rejects a directive with no namespace", async () => {
    const response = await handler(directive({ namespace: undefined }));

    expectError(
      response,
      "INVALID_DIRECTIVE",
      "No namespace found in directive",
    );
  });

  it("rejects an unknown namespace and echoes it back", async () => {
    const response = await handler(
      directive({ namespace: "Alexa.PowerLevel" }),
    );

    expectError(
      response,
      "INVALID_DIRECTIVE",
      "Unknown namespace: Alexa.PowerLevel",
    );
  });

  it("matches the namespace case-insensitively", async () => {
    const response = await handler(directive({ namespace: "ALEXA.DISCOVERY" }));

    expect(response.event.header.name).toBe("Discover.Response");
  });

  it("tolerates a missing context argument", async () => {
    await expect(handler(discover(), undefined)).resolves.toBeDefined();
  });
});

describe("dispatcher — Alexa.Authorization", () => {
  it("exchanges the grant code and stores the refresh token", async () => {
    const response = await handler(acceptGrant());

    expect(mockGetLwaTokenResponse).toHaveBeenCalledWith("auth-code");
    expect(mockGetUserInfo).toHaveBeenCalledWith("grantee-token");
    expect(mockUpdateAzanUserInfo).toHaveBeenCalledWith(USER_ID, {
      refreshToken: "refresh-token",
    });

    expect(response.event.header.namespace).toBe("Alexa.Authorization");
    expect(response.event.header.name).toBe("AcceptGrant.Response");
    // Amazon rejects an AcceptGrant reply that carries an endpoint.
    expect(response.event.endpoint).toBeUndefined();
  });

  it("reports ACCEPT_GRANT_FAILED when the grant code is missing", async () => {
    const response = await handler(acceptGrant({ grant: undefined }));

    expectError(response, "ACCEPT_GRANT_FAILED", "Missing authorization code");
    expect(mockGetLwaTokenResponse).not.toHaveBeenCalled();
  });

  it("reports ACCEPT_GRANT_FAILED when the grantee token is missing", async () => {
    const response = await handler(acceptGrant({ grantee: undefined }));

    expectError(response, "ACCEPT_GRANT_FAILED", "Missing grantee token");
    expect(mockUpdateAzanUserInfo).not.toHaveBeenCalled();
  });

  it("reports ACCEPT_GRANT_FAILED when the user profile comes back empty", async () => {
    // Simulates a malformed body from Amazon — the cast is the point: the
    // handler's defensive `!userInfo` check is what this covers.
    mockGetUserInfo.mockResolvedValue(
      undefined as unknown as AmazonUserProfile,
    );

    const response = await handler(acceptGrant());

    expectError(response, "ACCEPT_GRANT_FAILED", "Failed to get user info");
    expect(mockUpdateAzanUserInfo).not.toHaveBeenCalled();
  });

  it.each([
    ["the token exchange", () => mockGetLwaTokenResponse],
    ["the profile lookup", () => mockGetUserInfo],
    ["the DynamoDB write", () => mockUpdateAzanUserInfo],
  ])("swallows a failure in %s and answers with an error", async (_l, pick) => {
    pick().mockRejectedValue(new Error("boom"));

    const response = await handler(acceptGrant());

    expectError(
      response,
      "ACCEPT_GRANT_FAILED",
      "Failed to handle the authorization request",
    );
  });
});

describe("dispatcher — Alexa.Discovery", () => {
  it("announces a doorbell endpoint scoped to the user", async () => {
    const response = await handler(discover());

    expect(response.event.header.namespace).toBe("Alexa.Discovery");
    expect(response.event.header.name).toBe("Discover.Response");
    expect(response.event.endpoint).toBeUndefined();

    const endpoint = discoveredEndpoint(response);
    expect(endpoint).toMatchObject({
      friendlyName: "MAWAQIT Azan",
      manufacturerName: "MAWAQIT",
      model: "v2",
      displayCategories: ["DOORBELL"],
    });
  });

  it("keeps the description within Amazon's 128-character limit", async () => {
    // Amazon rejects a longer description, and the failure surfaces as a
    // discovery that simply returns no device — with nothing in the logs to
    // say why. Cheaper to catch here.
    const response = await handler(discover());

    expect(discoveredEndpoint(response).description.length).toBeLessThanOrEqual(
      128,
    );
  });

  it("tells the user to turn off Alexa's own doorbell notifications", async () => {
    // Left on, that setting fires a notification chime alongside every adhan.
    const response = await handler(discover());

    expect(discoveredEndpoint(response).description).toContain(
      "Doorbell Press Notifications",
    );
  });

  it("announces the doorbell capability that carries the azan", async () => {
    const response = await handler(discover());
    const endpoint = discoveredEndpoint(response);
    // Alexa only fires proactive doorbell events for an endpoint that declares
    // Alexa.DoorbellEventSource as proactively reported.
    expect(endpoint.capabilities).toEqual([
      {
        type: "AlexaInterface",
        interface: "Alexa",
        version: "3",
        proactivelyReported: false,
      },
      {
        type: "AlexaInterface",
        interface: "Alexa.DoorbellEventSource",
        version: "3",
        proactivelyReported: true,
      },
    ]);
  });

  it("derives the endpointId from the third segment of the user id", async () => {
    const response = await handler(discover());

    expect(discoveredEndpoint(response).endpointId).toBe(
      "mawaqit-azan-trigger-ABCDEF",
    );
    expect(mockUpdateAzanUserInfo).toHaveBeenCalledWith(USER_ID, {
      endpointId: "mawaqit-azan-trigger-ABCDEF",
    });
  });

  it("falls back to the bare endpointId when the user id has no third segment", async () => {
    mockGetUserInfo.mockResolvedValue(profile({ user_id: "amzn1.account" }));

    const response = await handler(discover());

    expect(discoveredEndpoint(response).endpointId).toBe(
      "mawaqit-azan-trigger",
    );
  });

  it("still discovers an endpoint when the profile carries no user id", async () => {
    // No user id means nothing to persist, but Alexa must still get an
    // endpoint back or the skill looks broken in the app.
    mockGetUserInfo.mockResolvedValue({} as AmazonUserProfile);

    const response = await handler(discover());

    expect(discoveredEndpoint(response).endpointId).toBe(
      "mawaqit-azan-trigger",
    );
    expect(mockUpdateAzanUserInfo).not.toHaveBeenCalled();
  });

  it("reports INTERNAL_ERROR when the profile lookup fails", async () => {
    mockGetUserInfo.mockRejectedValue(new Error("401"));

    const response = await handler(discover());

    expectError(
      response,
      "INTERNAL_ERROR",
      "Failed to handle the discovery request",
    );
  });

  it("reports INTERNAL_ERROR when persisting the endpointId fails", async () => {
    mockUpdateAzanUserInfo.mockRejectedValue(new Error("throttled"));

    const response = await handler(discover());

    expectError(
      response,
      "INTERNAL_ERROR",
      "Failed to handle the discovery request",
    );
  });
});
