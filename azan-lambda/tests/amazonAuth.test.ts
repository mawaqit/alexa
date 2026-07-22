/**
 * Login with Amazon is picky about how the token calls are made: the two token
 * endpoints only accept form-urlencoded bodies, and the profile endpoint only a
 * bearer header. These tests pin the request shape, and pin that credentials
 * are read from process.env at *call* time — they are populated by the SSM
 * handler after module load, so reading them at import time would send blanks.
 */

import axiosModule, { AxiosError, type AxiosResponse } from "axios";

import { getLwaTokenResponse, getUserInfo } from "../src/services/amazonAuth";

jest.mock("axios");

const axios = jest.mocked(axiosModule);

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

/** An error shaped the way axios reports a non-2xx response. */
const httpError = (status: number): AxiosError => {
  const error = new AxiosError("Request failed");
  error.response = { status } as AxiosResponse;
  return error;
};

beforeEach(() => {
  jest.clearAllMocks();
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

  it("propagates a failed token exchange", async () => {
    const error = httpError(400);
    axios.request.mockRejectedValue(error);

    await expect(getLwaTokenResponse("auth-code")).rejects.toBe(error);
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

  it("propagates an expired-token failure", async () => {
    const error = httpError(401);
    axios.request.mockRejectedValue(error);

    await expect(getUserInfo("stale")).rejects.toBe(error);
  });
});
