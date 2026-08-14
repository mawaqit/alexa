/**
 * The website's LWA credentials (/alexa/webClientId etc.) are fetched in the
 * same GetParameters call as the skill's own required secrets, but must not
 * be required: until the user has created them in SSM, AWS reports them in
 * InvalidParameters, and every Lambda in this service (not just the website
 * one) calls this bootstrap on every cold start. Treating them as required
 * would take the whole skill down over a feature that isn't provisioned yet
 * — this file pins that they stay optional.
 *
 * The fetch is cached in a module-scoped promise, so each test needs a
 * pristine copy of the module — hence `jest.resetModules()` + a fresh
 * `require()` per test rather than a top-level require, which would hand
 * back the same cached instance every time.
 */
const mockSend = jest.fn();

jest.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class SSMClient {
    send = mockSend;
  },
  GetParametersCommand: class GetParametersCommand {
    constructor(input) {
      this.input = input;
    }
  },
}));

const REQUIRED_PARAMETERS = [
  { Name: "/alexa/api/key/mawaqit", Value: "mawaqit-key" },
  { Name: "/alexa/api/key/google", Value: "google-key" },
  { Name: "/alexa/clientId", Value: "client-id" },
  { Name: "/alexa/clientSecret", Value: "client-secret" },
];

const WEB_PARAMETERS = [
  { Name: "/alexa/webClientId", Value: "web-client-id" },
  { Name: "/alexa/webClientSecret", Value: "web-client-secret" },
  { Name: "/alexa/webSessionSecret", Value: "web-session-secret" },
];

const freshHandler = () => {
  jest.resetModules();
  return require("../handlers/awsSsmHandler.js");
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.webClientId;
  delete process.env.webClientSecret;
  delete process.env.webSessionSecret;
});

it("populates process.env for both the required and the optional web parameters when all are present", async () => {
  mockSend.mockResolvedValue({
    Parameters: [...REQUIRED_PARAMETERS, ...WEB_PARAMETERS],
    InvalidParameters: [],
  });

  await freshHandler().handler();

  expect(process.env.mawaqitApiKey).toBe("mawaqit-key");
  expect(process.env.clientId).toBe("client-id");
  expect(process.env.webClientId).toBe("web-client-id");
  expect(process.env.webClientSecret).toBe("web-client-secret");
  expect(process.env.webSessionSecret).toBe("web-session-secret");
});

it("does not throw when only the optional web parameters are missing, and leaves the required ones populated", async () => {
  mockSend.mockResolvedValue({
    Parameters: REQUIRED_PARAMETERS,
    InvalidParameters: [
      "/alexa/webClientId",
      "/alexa/webClientSecret",
      "/alexa/webSessionSecret",
    ],
  });

  await expect(freshHandler().handler()).resolves.toBeUndefined();
  expect(process.env.mawaqitApiKey).toBe("mawaqit-key");
  expect(process.env.clientId).toBe("client-id");
  expect(process.env.webClientId).toBeUndefined();
});

it("still throws when a required parameter is missing, regardless of the optional ones", async () => {
  mockSend.mockResolvedValue({
    Parameters: REQUIRED_PARAMETERS.filter(
      (p) => p.Name !== "/alexa/clientSecret",
    ),
    InvalidParameters: ["/alexa/clientSecret"],
  });

  await expect(freshHandler().handler()).rejects.toThrow(/clientSecret/);
});
