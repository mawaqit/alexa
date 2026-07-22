/**
 * Incoming Alexa Smart Home directives — the messages Amazon sends us.
 *
 * Every field is optional, and optional here means `?: T | undefined`. That is
 * deliberate: this is untrusted input. `exactOptionalPropertyTypes` is on, so
 * elsewhere "key absent" and "key present but undefined" are different things —
 * but on input they both mean the same thing, "Amazon did not send this", and
 * both must be unreadable until proven otherwise.
 *
 * The practical effect: nothing can read `directive.header.namespace` without
 * first narrowing it.
 *
 * @see https://developer.amazon.com/en-US/docs/alexa/device-apis/message-guide.html
 */

export interface DirectiveHeader {
  namespace?: string | undefined;
  name?: string | undefined;
  messageId?: string | undefined;
  correlationToken?: string | undefined;
  payloadVersion?: string | undefined;
}

/** The authorization code to exchange, on an AcceptGrant directive. */
export interface OAuth2Grant {
  type?: string;
  code?: string;
}

/** Identifies the user the grant belongs to, on an AcceptGrant directive. */
export interface Grantee {
  type?: string;
  token?: string;
}

/** Carries the user's access token, on a Discover directive. */
export interface DirectiveScope {
  type?: string;
  token?: string;
}

/**
 * The payloads this Lambda accepts, merged into one shape. A given directive
 * only ever carries one of them, hence every branch being optional.
 */
export interface DirectivePayload {
  grant?: OAuth2Grant | undefined;
  grantee?: Grantee | undefined;
  scope?: DirectiveScope | undefined;
}

/**
 * An event that has been proven to carry a `directive` key.
 *
 * Produced only by the `isValidDirective` type predicate — an unvalidated
 * event is typed `unknown`.
 */
export interface SmartHomeRequest {
  directive: {
    header?: DirectiveHeader;
    payload?: DirectivePayload;
  };
}
