/**
 * Login with Amazon is picky about how the token calls are made: the two token
 * endpoints only accept form-urlencoded bodies, and the profile endpoint only a
 * bearer header. These tests pin the request shape, and pin that credentials
 * are read from process.env at *call* time — they are populated by the SSM
 * handler after module load, so reading them at import time would send blanks.
 *
 * They also pin that a failure never carries those credentials out: callers
 * log the error, and an AxiosError holds the whole request.
 */

import { LogFormatter, LogItem } from "@aws-lambda-powertools/logger";
import axiosModule, {
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

import { getLwaTokenResponse, getUserInfo } from "../src/services/amazonAuth";

jest.mock("axios");

const axios = jest.mocked(axiosModule);
// The automock stubs AxiosError and isAxiosError; a failure needs the real
// ones to carry its request config the way axios does.
const actualAxios = jest.requireActual<{ default: typeof axiosModule }>(
  "axios",
).default;

const TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const PROFILE_URL = "https://api.amazon.com/user/profile";

/** Wraps a body in just enough of an AxiosResponse for the code under test. */
const respondWith = <T>(data: T) => axios.request.mockResolvedValue({ data });

/** Reads back the urlencoded body axios was called with. */
const sentForm = (): Record<string, string> => {
  const config = axios.request.mock.calls[0]?.[0];
  const body = config?.data as URLSearchParams;
  return Object.fromEntries(body.entries());
};

/**
 * A non-2xx failure as axios reports it: the request config (headers and the
 * serialized body) rides along on the error.
 */
const httpError = (
  status: number,
  request: { headers?: Record<string, string>; data?: string },
) => {
  const config: InternalAxiosRequestConfig = {
    headers: new actualAxios.AxiosHeaders(request.headers),
    data: request.data,
  };
  return new actualAxios.AxiosError(
    "Request failed",
    "ERR_BAD_REQUEST",
    config,
    undefined,
    { status, config } as AxiosResponse,
  );
};

/** Powertools' own serialization of a logged error, as CloudWatch gets it. */
class ErrorOnlyFormatter extends LogFormatter {
  formatAttributes(): LogItem {
    return new LogItem({ attributes: {} });
  }
}
const asLogged = (error: Error): string =>
  JSON.stringify(new ErrorOnlyFormatter().formatError(error));

/** The value a promise rejects with, which must be an Error. */
const rejectionOf = async (promise: Promise<unknown>): Promise<Error> => {
  const reason: unknown = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(reason instanceof Error))
    throw new Error("Expected an Error rejection");
  return reason;
};

beforeEach(() => {
  jest.clearAllMocks();
  axios.isAxiosError.mockImplementation(actualAxios.isAxiosError);
  process.env.clientId = "client-id";
  process.env.clientSecret = "client-secret";
});

describe("getLwaTokenResponse", () => {
  it("posts the authorization_code grant as a urlencoded form", async () => {
    respondWith({ refresh_token: "rt" });

    const data = await getLwaTokenResponse("auth-code");

    expect(data).toEqual({ refresh_token: "rt" });
    expect(axios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "post",
        url: TOKEN_URL,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
      }),
    );
    expect(sentForm()).toEqual({
      client_id: "client-id",
      client_secret: "client-secret",
      grant_type: "authorization_code",
      code: "auth-code",
    });
  });

  it("reads the credentials at call time, not at import time", async () => {
    // SSM populates these after the module has already been imported.
    process.env.clientId = "rotated-id";
    respondWith({});

    await getLwaTokenResponse("auth-code");

    expect(sentForm().client_id).toBe("rotated-id");
  });

  it("rejects a missing auth code without calling Amazon", async () => {
    await expect(getLwaTokenResponse(undefined)).rejects.toThrow(
      "Auth code is required",
    );
    expect(axios.request).not.toHaveBeenCalled();
  });

  it("fails with the HTTP status, without the client secret or auth code", async () => {
    // The caller logs this error. Rethrowing the AxiosError put the request
    // body, client secret and live auth code included, into CloudWatch.
    axios.request.mockRejectedValue(
      httpError(400, {
        data: "client_secret=client-secret&grant_type=authorization_code&code=live-auth-code",
      }),
    );

    const error = await rejectionOf(getLwaTokenResponse("live-auth-code"));

    expect(error.message).toBe("Token exchange failed: 400");
    expect(asLogged(error)).not.toContain("client-secret");
    expect(asLogged(error)).not.toContain("live-auth-code");
  });
});

describe("getUserInfo", () => {
  it("fetches the profile with a bearer token", async () => {
    respondWith({ user_id: "amzn1.account.X" });

    const data = await getUserInfo("access-token");

    expect(data).toEqual({ user_id: "amzn1.account.X" });
    expect(axios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "get",
        url: PROFILE_URL,
        headers: { Authorization: "Bearer access-token" },
      }),
    );
  });

  it("rejects a missing access token without calling Amazon", async () => {
    await expect(getUserInfo(undefined)).rejects.toThrow(
      "Access token is required",
    );
    expect(axios.request).not.toHaveBeenCalled();
  });

  it("fails with the HTTP status, without the bearer token", async () => {
    // The caller logs this error. Rethrowing the AxiosError put the request's
    // Authorization header, live access token included, into CloudWatch.
    axios.request.mockRejectedValue(
      httpError(401, {
        headers: { Authorization: "Bearer live-access-token" },
      }),
    );

    const error = await rejectionOf(getUserInfo("live-access-token"));

    expect(error.message).toBe("Amazon user profile fetch failed: 401");
    expect(asLogged(error)).not.toContain("live-access-token");
  });
});
