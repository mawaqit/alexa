/**
 * Outgoing Alexa Smart Home responses — the messages we send back.
 *
 * The mirror image of {@link ./smartHomeRequest}: fields here are **required**.
 * We build these ourselves, so an incomplete one is our bug, and Amazon
 * rejects a malformed response with no useful diagnostic. Keep that asymmetry
 * when extending either file.
 *
 * @see https://developer.amazon.com/en-US/docs/alexa/device-apis/message-guide.html
 */

/**
 * The error types this Lambda can report. Amazon defines many more; narrowing
 * to the ones we actually emit turns a typo into a compile error.
 *
 * @see https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-errorresponse.html
 */
export type ErrorResponseType =
  "ACCEPT_GRANT_FAILED" | "INTERNAL_ERROR" | "INVALID_DIRECTIVE";

export interface ResponseHeader {
  namespace: string;
  name: string;
  messageId: string;
  /**
   * Written as an explicit `undefined` on responses with no token to echo
   * back. The `| undefined` is deliberate under `exactOptionalPropertyTypes`:
   * the key exists, and `JSON.stringify` is what drops it from the wire.
   */
  correlationToken?: string | undefined;
  payloadVersion: string;
}

export interface EndpointScope {
  type: "BearerToken";
  token: string;
}

export interface ResponseEndpoint {
  scope: EndpointScope;
  endpointId: string;
}

/** A property name advertised inside a capability's `properties.supported`. */
export interface CapabilityProperty {
  name: string;
}

export interface EndpointCapability {
  type: string;
  interface: string;
  version: string;
  proactivelyReported: boolean;
  properties?: {
    supported: CapabilityProperty[];
    retrievable: boolean;
  };
}

export interface PayloadEndpoint {
  capabilities: EndpointCapability[];
  description: string;
  displayCategories: string[];
  endpointId: string;
  friendlyName: string;
  manufacturerName: string;
  model: string;
  cookie?: Record<string, string>;
}

/**
 * Every payload we send: empty for AcceptGrant, `endpoints` for Discover,
 * `type` + `message` for an ErrorResponse.
 */
export interface ResponsePayload {
  endpoints?: PayloadEndpoint[];
  type?: ErrorResponseType;
  message?: string;
}

export interface ContextProperty {
  namespace: string;
  name: string;
  value: unknown;
  timeOfSample: string;
  uncertaintyInMilliseconds: number;
}

export interface ResponseContext {
  properties: ContextProperty[];
}

export interface SmartHomeResponseEvent {
  header: ResponseHeader;
  /** Absent on AcceptGrant.Response and Discover.Response — Amazon rejects it. */
  endpoint?: ResponseEndpoint;
  payload: ResponsePayload;
}
