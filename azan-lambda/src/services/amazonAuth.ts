import axios, { type AxiosRequestConfig } from "axios";

import { logger } from "../logging/logger";
import type { AmazonUserProfile, LwaTokenResponse } from "../types/amazon";

const AMAZON_BASE_URL = "https://api.amazon.com";
const TOKEN_ENDPOINT = `${AMAZON_BASE_URL}/auth/o2/token`;
const PROFILE_ENDPOINT = `${AMAZON_BASE_URL}/user/profile`;

/**
 * Reads the client credentials that {@link ./secrets} writes to the
 * environment.
 *
 * Read at call time, never at module load: SSM populates them after this
 * module has already been imported, so a module-level read would send blanks.
 */
function clientCredentials(): Record<string, string> {
  return {
    client_id: process.env.clientId ?? "",
    client_secret: process.env.clientSecret ?? "",
  };
}

/** Both token grants are rejected unless the body is form-urlencoded. */
function tokenRequest(
  data: URLSearchParams,
): AxiosRequestConfig<URLSearchParams> {
  return {
    method: "post",
    maxBodyLength: Infinity,
    url: TOKEN_ENDPOINT,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    data,
  };
}

/**
 * Amazon puts the useful part of a failure in the HTTP status, not the body —
 * and the body may echo back the token we just sent, so it is never logged.
 */
function describeError(error: unknown): string | number {
  if (axios.isAxiosError(error)) return error.response?.status ?? error.message;
  return error instanceof Error ? error.message : String(error);
}

/** Exchanges an AcceptGrant authorization code for a long-lived token set. */
export async function getLwaTokenResponse(
  authCode: string | undefined,
): Promise<LwaTokenResponse> {
  logger.debug("Exchanging auth code for tokens");
  if (!authCode) {
    throw new Error("Auth code is required");
  }

  const data = new URLSearchParams({
    ...clientCredentials(),
    grant_type: "authorization_code",
    code: authCode,
  });

  try {
    const response = await axios.request<LwaTokenResponse>(tokenRequest(data));
    logger.info("Token exchange successful");
    return response.data;
  } catch (error) {
    logger.error("Token exchange failed", { reason: describeError(error) });
    throw error;
  }
}

/** Resolves an access token to the Amazon account that issued it. */
export async function getUserInfo(
  accessToken: string | undefined,
): Promise<AmazonUserProfile> {
  logger.debug("Fetching Amazon user profile");
  if (!accessToken) {
    throw new Error("Access token is required");
  }

  const config: AxiosRequestConfig = {
    method: "get",
    maxBodyLength: Infinity,
    url: PROFILE_ENDPOINT,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  try {
    const response = await axios.request<AmazonUserProfile>(config);
    logger.info("Amazon user profile fetched");
    return response.data;
  } catch (error) {
    logger.error("Amazon user profile fetch failed", {
      reason: describeError(error),
    });
    throw error;
  }
}
