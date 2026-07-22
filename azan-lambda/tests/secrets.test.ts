/**
 * Secrets are fetched once per Lambda container and cached on process.env, so
 * the memoisation is load-bearing: losing it means an SSM round-trip on every
 * azan dispatch, and caching a *failure* means a container that can never
 * recover. Both are pinned here.
 *
 * The cache lives in a module-scoped promise, so each test needs a pristine
 * copy of the module — hence the dynamic `import()` inside
 * `jest.isolateModulesAsync` rather than a top-level import, which would be
 * hoisted and hand back the same cached instance every time.
 */

import type { loadSecrets as LoadSecrets } from "../src/services/secrets";

/** The subset of GetParametersCommandOutput the service reads. */
interface GetParametersOutput {
  Parameters?: { Name: string; Value: string }[];
  InvalidParameters?: string[];
}

const mockSend = jest.fn() as jest.MockedFunction<
  (command: { input: unknown }) => Promise<GetParametersOutput>
>;
const mockClientConstructed = jest.fn();

jest.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class SSMClient {
    send = mockSend;
    constructor(config: unknown) {
      mockClientConstructed(config);
    }
  },
  GetParametersCommand: class GetParametersCommand {
    constructor(public input: unknown) {}
  },
}));

const SSM_PARAMETERS = [
  { Name: "/alexa/api/key/mawaqit", Value: "mawaqit-key" },
  { Name: "/alexa/api/key/google", Value: "google-key" },
  { Name: "/alexa/clientId", Value: "client-id" },
  { Name: "/alexa/clientSecret", Value: "client-secret" },
];

const SECRET_ENV_KEYS = [
  "mawaqitApiKey",
  "googleApiKey",
  "clientId",
  "clientSecret",
];

/**
 * Runs `assertions` against a freshly loaded copy of the module, cache and all.
 */
const withFreshModule = (
  assertions: (loadSecrets: typeof LoadSecrets) => Promise<void> | void,
): Promise<void> =>
  jest.isolateModulesAsync(async () => {
    const { loadSecrets } = await import("../src/services/secrets");
    await assertions(loadSecrets);
  });

/** The params handed to the GetParametersCommand on the nth call. */
const sentInput = (call = 0): unknown => mockSend.mock.calls[call]?.[0].input;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TARGET_SSM_REGION = "eu-west-3";
  SECRET_ENV_KEYS.forEach((key) => delete process.env[key]);
  mockSend.mockResolvedValue({ Parameters: SSM_PARAMETERS });
});

describe("secrets", () => {
  it("pins the SSM client to the Paris region", async () => {
    await withFreshModule(() => {
      expect(mockClientConstructed).toHaveBeenCalledWith({
        region: "eu-west-3",
      });
    });
  });

  it("requests the four secrets in one decrypted batch", async () => {
    await withFreshModule(async (loadSecrets) => {
      await loadSecrets();

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(sentInput()).toEqual({
        Names: [
          "/alexa/api/key/mawaqit",
          "/alexa/api/key/google",
          "/alexa/clientId",
          "/alexa/clientSecret",
        ],
        WithDecryption: true,
      });
    });
  });

  it("maps each parameter onto the env var its consumer reads", async () => {
    await withFreshModule(async (loadSecrets) => {
      await loadSecrets();

      expect(process.env.mawaqitApiKey).toBe("mawaqit-key");
      expect(process.env.googleApiKey).toBe("google-key");
      expect(process.env.clientId).toBe("client-id");
      expect(process.env.clientSecret).toBe("client-secret");
    });
  });

  it("ignores parameters it was not asked for", async () => {
    mockSend.mockResolvedValue({
      Parameters: [...SSM_PARAMETERS, { Name: "/alexa/unknown", Value: "x" }],
    });

    await withFreshModule(async (loadSecrets) => {
      await expect(loadSecrets()).resolves.toBeUndefined();
    });
  });

  it('never writes the string "undefined" for a valueless parameter', async () => {
    // process.env coerces: assigning `undefined` stores "undefined", which
    // would fail later as a baffling 401 rather than a missing-secret error.
    mockSend.mockResolvedValue({
      Parameters: [
        { Name: "/alexa/clientId" } as { Name: string; Value: string },
      ],
    });

    await withFreshModule(async (loadSecrets) => {
      await loadSecrets();

      expect(process.env.clientId).toBeUndefined();
    });
  });

  it("fetches once and reuses the result for later invocations", async () => {
    await withFreshModule(async (loadSecrets) => {
      await loadSecrets();
      await loadSecrets();
      await loadSecrets();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  it("fetches once even when invocations overlap", async () => {
    await withFreshModule(async (loadSecrets) => {
      await Promise.all([loadSecrets(), loadSecrets(), loadSecrets()]);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  it("throws when SSM reports a parameter it could not resolve", async () => {
    // A missing parameter would otherwise leave the env var undefined and
    // surface much later as an opaque 401 from Amazon.
    mockSend.mockResolvedValue({
      Parameters: [],
      InvalidParameters: ["/alexa/clientSecret"],
    });

    await withFreshModule(async (loadSecrets) => {
      await expect(loadSecrets()).rejects.toThrow(
        "Failed to retrieve SSM parameters: /alexa/clientSecret",
      );
    });
  });

  it("does not cache a failure — the next invocation retries", async () => {
    // Caching the rejected promise would poison the whole container: every
    // later azan dispatch on that instance would fail without ever retrying.
    mockSend.mockRejectedValueOnce(new Error("AccessDenied"));

    await withFreshModule(async (loadSecrets) => {
      await expect(loadSecrets()).rejects.toThrow("AccessDenied");

      mockSend.mockResolvedValue({ Parameters: SSM_PARAMETERS });
      await expect(loadSecrets()).resolves.toBeUndefined();

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(process.env.clientId).toBe("client-id");
    });
  });
});
