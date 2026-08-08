/**
 * Option bags for the {@link ../alexa/AlexaResponse} builder.
 *
 * Separate from the wire types in `smartHomeResponse.ts` on purpose: those
 * describe what Amazon receives, these describe what a caller may supply. Every
 * field is optional because the builder fills in a Smart Home v3 default for
 * each one.
 */

import type {
  CapabilityProperty,
  EndpointCapability,
  ResponseContext,
  ResponsePayload,
  SmartHomeResponseEvent,
} from "./smartHomeResponse";

/** Options accepted by the `AlexaResponse` constructor. */
export interface AlexaResponseOptions {
  context?: ResponseContext;
  /** A fully-formed event, bypassing every field below. */
  event?: SmartHomeResponseEvent;
  namespace?: string;
  name?: string;
  messageId?: string;
  correlationToken?: string;
  payloadVersion?: string;
  /** Bearer token echoed back in the endpoint scope. */
  token?: string;
  endpointId?: string;
  payload?: ResponsePayload;
}

export interface ContextPropertyOptions {
  namespace?: string;
  name?: string;
  value?: unknown;
  uncertaintyInMilliseconds?: number;
}

export interface PayloadEndpointOptions {
  capabilities?: EndpointCapability[];
  description?: string;
  displayCategories?: string[];
  endpointId?: string;
  friendlyName?: string;
  manufacturerName?: string;
  model?: string;
  cookie?: Record<string, string>;
}

export interface EndpointCapabilityOptions {
  type?: string;
  interface?: string;
  version?: string;
  proactivelyReported?: boolean;
  /** Supplying this is what makes the `properties` block appear. */
  supported?: CapabilityProperty[];
  retrievable?: boolean;
}
