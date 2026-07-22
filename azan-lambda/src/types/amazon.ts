/**
 * Login with Amazon (LWA) payloads — the account-linking side of the skill.
 *
 * @see https://developer.amazon.com/docs/login-with-amazon/authorization-code-grant.html
 */

/** A token set returned by either of the two LWA token grants. */
export interface LwaTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  /** Lifetime of `access_token`, in seconds. */
  expires_in: number;
}

/**
 * A user profile from LWA. Only `user_id` is guaranteed — the rest depend on
 * the scopes granted at account-linking time.
 */
export interface AmazonUserProfile {
  /** Looks like `amzn1.account.XXXX`; the third segment is our endpoint suffix. */
  user_id: string;
  name?: string;
  email?: string;
  postal_code?: string;
}
