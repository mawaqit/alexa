/**
 * webApi.js is the Lambda entry point for the companion website's HTTP API
 * (a Lambda Function URL). It must never throw — an unhandled error reaches
 * the caller as a raw 500 with no CORS headers, which the browser reports
 * as an opaque network error instead of something the frontend can show
 * the user.
 */
jest.mock("../handlers/awsSsmHandler.js");
jest.mock("../handlers/webAuthHandler.js");
jest.mock("../handlers/webConfigHandler.js");
jest.mock("../handlers/webMosqueHandler.js");

const awsSsmHandler = require("../handlers/awsSsmHandler.js");
const webAuthHandler = require("../handlers/webAuthHandler.js");
const webConfigHandler = require("../handlers/webConfigHandler.js");
const webMosqueHandler = require("../handlers/webMosqueHandler.js");
const webApi = require("../webApi.js");

const httpEvent = (method, path, extra = {}) => ({
  requestContext: { http: { method } },
  rawPath: path,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  awsSsmHandler.handler.mockResolvedValue();
});

it("bootstraps SSM secrets before routing every request", async () => {
  webAuthHandler.handleAuthSession.mockResolvedValue({ statusCode: 401 });

  await webApi.handler(httpEvent("GET", "/auth/session"));

  expect(awsSsmHandler.handler).toHaveBeenCalled();
});

it.each([
  ["GET", "/auth/start", "handleAuthStart"],
  ["GET", "/auth/callback", "handleAuthCallback"],
  ["POST", "/auth/logout", "handleAuthLogout"],
  ["GET", "/auth/session", "handleAuthSession"],
])("routes %s %s to webAuthHandler.%s", async (method, path, handlerName) => {
  webAuthHandler[handlerName].mockResolvedValue({ statusCode: 200 });

  const response = await webApi.handler(httpEvent(method, path));

  expect(webAuthHandler[handlerName]).toHaveBeenCalled();
  expect(response.statusCode).toBe(200);
});

it.each([
  ["GET", "/me/config", "handleGetConfig"],
  ["PUT", "/me/mosque", "handleSaveMosque"],
  ["PUT", "/me/prayers", "handleSavePrayers"],
  ["GET", "/me/reciters", "handleGetReciters"],
  ["PUT", "/me/reciter", "handleSaveReciter"],
])("routes %s %s to webConfigHandler.%s", async (method, path, handlerName) => {
  webConfigHandler[handlerName].mockResolvedValue({ statusCode: 200 });

  const response = await webApi.handler(httpEvent(method, path));

  expect(webConfigHandler[handlerName]).toHaveBeenCalled();
  expect(response.statusCode).toBe(200);
});

it("routes GET /mosques/search to webMosqueHandler.handleSearchMosques", async () => {
  webMosqueHandler.handleSearchMosques.mockResolvedValue({ statusCode: 200 });

  const response = await webApi.handler(httpEvent("GET", "/mosques/search"));

  expect(webMosqueHandler.handleSearchMosques).toHaveBeenCalled();
  expect(response.statusCode).toBe(200);
});

it("routes GET /mosques/:uuid/times to webMosqueHandler.handleGetMosqueTimes with the decoded uuid", async () => {
  webMosqueHandler.handleGetMosqueTimes.mockResolvedValue({ statusCode: 200 });

  const response = await webApi.handler(
    httpEvent("GET", "/mosques/2c119cce-ac59-4765-8ca6-da97d0b29e91/times"),
  );

  expect(webMosqueHandler.handleGetMosqueTimes).toHaveBeenCalledWith(
    expect.anything(),
    "2c119cce-ac59-4765-8ca6-da97d0b29e91",
  );
  expect(response.statusCode).toBe(200);
});

it("returns 404 for an unknown route instead of throwing", async () => {
  const response = await webApi.handler(httpEvent("GET", "/does-not-exist"));

  expect(response.statusCode).toBe(404);
});

it("returns a 500 JSON body instead of throwing when a route handler blows up", async () => {
  webAuthHandler.handleAuthSession.mockRejectedValue(new Error("boom"));

  const response = await webApi.handler(httpEvent("GET", "/auth/session"));

  expect(response.statusCode).toBe(500);
  expect(JSON.parse(response.body)).toEqual({ error: "Internal error" });
});

it("returns a 500 JSON body instead of throwing when the SSM bootstrap itself fails", async () => {
  awsSsmHandler.handler.mockRejectedValue(new Error("SSM unreachable"));

  const response = await webApi.handler(httpEvent("GET", "/auth/session"));

  expect(response.statusCode).toBe(500);
});
