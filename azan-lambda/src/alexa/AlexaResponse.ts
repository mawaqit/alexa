// -*- coding: utf-8 -*-

// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.

// Licensed under the Amazon Software License (the "License"). You may not use this file except in
// compliance with the License. A copy of the License is located at

//    http://aws.amazon.com/asl/

// or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific
// language governing permissions and limitations under the License.

import { randomUUID as uuid } from "node:crypto";

import { ENDPOINTLESS_RESPONSES, PAYLOAD_VERSION } from "./constants";
import type {
  AlexaResponseOptions,
  ContextPropertyOptions,
  EndpointCapabilityOptions,
  PayloadEndpointOptions,
} from "../types/alexaResponse";
import type {
  ContextProperty,
  EndpointCapability,
  PayloadEndpoint,
  ResponseContext,
  SmartHomeResponseEvent,
} from "../types/smartHomeResponse";

/**
 * Builder for a Smart Home v3 response envelope.
 *
 * Amazon dictates this shape, and rejects anything that deviates from it, so
 * the class exists to make the correct envelope the easy one to produce: every
 * field has a spec-compliant default, and the two responses that must not carry
 * an endpoint have it stripped automatically.
 */
export class AlexaResponse {
  context?: ResponseContext;
  event: SmartHomeResponseEvent;

  constructor(opts: AlexaResponseOptions = {}) {
    // Taken as-is for the same reason as `event` below: `checkValue` could only
    // ever hand back the object it was given.
    if (opts.context !== undefined) this.context = opts.context;

    if (opts.event !== undefined) this.event = opts.event;
    else
      this.event = {
        header: {
          namespace: this.checkValue(opts.namespace, "Alexa"),
          name: this.checkValue(opts.name, "Response"),
          messageId: this.checkValue(opts.messageId, uuid()),
          correlationToken: this.checkValue(opts.correlationToken, undefined),
          payloadVersion: this.checkValue(opts.payloadVersion, PAYLOAD_VERSION),
        },
        endpoint: {
          scope: {
            type: "BearerToken",
            token: this.checkValue(opts.token, "INVALID"),
          },
          endpointId: this.checkValue(opts.endpointId, "INVALID"),
        },
        payload: this.checkValue(opts.payload, {}),
      };

    // No endpoint in an AcceptGrant or Discover response.
    if (ENDPOINTLESS_RESPONSES.includes(this.event.header.name))
      delete this.event.endpoint;
  }

  /**
   * Returns `value`, or `defaultValue` when `value` is absent.
   *
   * The empty-string case is the reason this exists: callers routinely pass
   * `""` for a missing token or namespace, and that must fall back too.
   */
  checkValue<T>(value: T | undefined, defaultValue: T): T {
    if (value === undefined || (value as unknown) === "") return defaultValue;

    return value;
  }

  /** Appends a property to the response context, creating it on first use. */
  addContextProperty(opts: ContextPropertyOptions): void {
    this.context ??= { properties: [] };

    this.context.properties.push(this.createContextProperty(opts));
  }

  /** Appends an endpoint to the payload, creating the array on first use. */
  addPayloadEndpoint(opts: PayloadEndpointOptions): void {
    this.event.payload.endpoints ??= [];

    this.event.payload.endpoints.push(this.createPayloadEndpoint(opts));
  }

  createContextProperty(opts: ContextPropertyOptions): ContextProperty {
    return {
      namespace: this.checkValue(opts.namespace, "Alexa.EndpointHealth"),
      name: this.checkValue(opts.name, "connectivity"),
      value: this.checkValue(opts.value, { value: "OK" }),
      timeOfSample: new Date().toISOString(),
      uncertaintyInMilliseconds: this.checkValue(
        opts.uncertaintyInMilliseconds,
        0,
      ),
    };
  }

  createPayloadEndpoint(opts: PayloadEndpointOptions = {}): PayloadEndpoint {
    const endpoint: PayloadEndpoint = {
      capabilities: this.checkValue(opts.capabilities, []),
      description: this.checkValue(
        opts.description,
        "Sample Endpoint Description",
      ),
      displayCategories: this.checkValue(opts.displayCategories, ["OTHER"]),
      endpointId: this.checkValue(opts.endpointId, "endpoint-001"),
      friendlyName: this.checkValue(opts.friendlyName, "Sample Endpoint"),
      manufacturerName: this.checkValue(
        opts.manufacturerName,
        "Sample Manufacturer",
      ),
      model: this.checkValue(opts.model, "Sample Model"),
    };

    // Only emitted when the caller asked for it: to Alexa, an empty cookie and
    // no cookie are different things.
    if (Object.hasOwn(opts, "cookie"))
      endpoint.cookie = this.checkValue(opts.cookie, {});

    return endpoint;
  }

  createPayloadEndpointCapability(
    opts: EndpointCapabilityOptions = {},
  ): EndpointCapability {
    const capability: EndpointCapability = {
      type: this.checkValue(opts.type, "AlexaInterface"),
      interface: this.checkValue(opts.interface, "Alexa"),
      version: this.checkValue(opts.version, PAYLOAD_VERSION),
      proactivelyReported: this.checkValue(opts.proactivelyReported, false),
    };

    const supported = this.checkValue(opts.supported, undefined);
    if (supported) {
      capability.properties = {
        supported,
        retrievable: this.checkValue(opts.retrievable, false),
      };
    }
    return capability;
  }

  /** Returns the composed response. */
  get(): this {
    return this;
  }
}
