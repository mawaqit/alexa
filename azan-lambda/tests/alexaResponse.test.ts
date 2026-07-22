/**
 * AlexaResponse is the only thing that decides whether Amazon accepts or
 * rejects a directive reply, and its shape is dictated by the Smart Home API —
 * not by us. These tests pin the wire format: the defaults, and the two
 * response names that must NOT carry an `endpoint` block.
 */

import { AlexaResponse } from "../src/alexa/AlexaResponse";
import type { CapabilityProperty } from "../src/types/smartHomeResponse";

describe("AlexaResponse — defaults", () => {
  it("fills in the Smart Home v3 envelope when given nothing", () => {
    const response = new AlexaResponse().get();

    expect(response.event.header).toMatchObject({
      namespace: "Alexa",
      name: "Response",
      payloadVersion: "3",
    });
    expect(response.event.header.messageId).toEqual(expect.any(String));
    expect(response.event.payload).toEqual({});
  });

  it("generates a distinct messageId per response", () => {
    const first = new AlexaResponse().get();
    const second = new AlexaResponse().get();

    expect(first.event.header.messageId).not.toBe(
      second.event.header.messageId,
    );
  });

  it("defaults the endpoint scope to an INVALID bearer token", () => {
    const response = new AlexaResponse().get();

    expect(response.event.endpoint).toEqual({
      scope: { type: "BearerToken", token: "INVALID" },
      endpointId: "INVALID",
    });
  });

  it("treats an empty string as absent and falls back to the default", () => {
    const response = new AlexaResponse({ namespace: "", token: "" }).get();

    expect(response.event.header.namespace).toBe("Alexa");
    expect(response.event.endpoint?.scope.token).toBe("INVALID");
  });

  it("keeps caller-supplied values", () => {
    const response = new AlexaResponse({
      namespace: "Alexa.Discovery",
      name: "Discover.Response",
      payload: { endpoints: [] },
    }).get();

    expect(response.event.header.namespace).toBe("Alexa.Discovery");
    expect(response.event.header.name).toBe("Discover.Response");
    expect(response.event.payload).toEqual({ endpoints: [] });
  });
});

describe("AlexaResponse — responses that must not carry an endpoint", () => {
  // Amazon rejects an AcceptGrant/Discover reply that includes an endpoint
  // block; the constructor strips it for exactly these two names.
  it.each(["AcceptGrant.Response", "Discover.Response"])(
    "drops the endpoint from %s",
    (name) => {
      const response = new AlexaResponse({ name }).get();

      expect(response.event.endpoint).toBeUndefined();
    },
  );

  it("keeps the endpoint for any other response name", () => {
    const response = new AlexaResponse({ name: "ErrorResponse" }).get();

    expect(response.event.endpoint).toBeDefined();
  });
});

describe("AlexaResponse — payload endpoints", () => {
  it("creates the endpoints array lazily and appends to it", () => {
    const response = new AlexaResponse({ name: "Discover.Response" });

    expect(response.event.payload.endpoints).toBeUndefined();

    response.addPayloadEndpoint({ endpointId: "one", friendlyName: "One" });
    response.addPayloadEndpoint({ endpointId: "two", friendlyName: "Two" });

    expect(response.event.payload.endpoints).toHaveLength(2);
    expect(response.event.payload.endpoints?.[0]).toMatchObject({
      endpointId: "one",
      friendlyName: "One",
    });
  });

  it("fills every required endpoint field with a default", () => {
    const response = new AlexaResponse();
    const endpoint = response.createPayloadEndpoint();

    expect(endpoint).toEqual({
      capabilities: [],
      description: "Sample Endpoint Description",
      displayCategories: ["OTHER"],
      endpointId: "endpoint-001",
      friendlyName: "Sample Endpoint",
      manufacturerName: "Sample Manufacturer",
      model: "Sample Model",
    });
  });

  it("only emits a cookie when the caller passed one", () => {
    const response = new AlexaResponse();

    expect(response.createPayloadEndpoint({})).not.toHaveProperty("cookie");
    expect(
      response.createPayloadEndpoint({ cookie: { a: "1" } }),
    ).toHaveProperty("cookie", { a: "1" });
  });
});

describe("AlexaResponse — capabilities", () => {
  it("describes the baseline AlexaInterface capability by default", () => {
    const capability = new AlexaResponse().createPayloadEndpointCapability();

    expect(capability).toEqual({
      type: "AlexaInterface",
      interface: "Alexa",
      version: "3",
      proactivelyReported: false,
    });
  });

  it("omits the properties block unless `supported` is given", () => {
    const capability = new AlexaResponse().createPayloadEndpointCapability({
      interface: "Alexa.DoorbellEventSource",
      proactivelyReported: true,
    });

    expect(capability).toEqual({
      type: "AlexaInterface",
      interface: "Alexa.DoorbellEventSource",
      version: "3",
      proactivelyReported: true,
    });
    expect(capability).not.toHaveProperty("properties");
  });

  it("adds properties.supported/retrievable when `supported` is given", () => {
    const supported: CapabilityProperty[] = [{ name: "connectivity" }];
    const capability = new AlexaResponse().createPayloadEndpointCapability({
      supported,
      retrievable: true,
    });

    expect(capability.properties).toEqual({ supported, retrievable: true });
  });
});

describe("AlexaResponse — context properties", () => {
  it("creates the properties array lazily and stamps a sample time", () => {
    const response = new AlexaResponse();

    expect(response.context).toBeUndefined();

    response.addContextProperty({ value: { value: "OK" } });

    expect(response.context?.properties).toHaveLength(1);
    expect(response.context?.properties[0]).toMatchObject({
      namespace: "Alexa.EndpointHealth",
      name: "connectivity",
      value: { value: "OK" },
      uncertaintyInMilliseconds: 0,
    });
    expect(response.context?.properties[0]?.timeOfSample).toEqual(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
  });
});
