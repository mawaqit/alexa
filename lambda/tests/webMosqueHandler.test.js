/**
 * GET /mosques/search proxies apiHandler.getMosqueList so the browser never
 * sees the mawaqit.net API key. It must require a session — otherwise the
 * key becomes usable by anyone who can reach this Lambda, not just this
 * website's logged-in users.
 */
jest.mock("../handlers/apiHandler.js");
jest.mock("../handlers/webAuthHandler.js");

const apiHandler = require("../handlers/apiHandler.js");
const webAuthHandler = require("../handlers/webAuthHandler.js");
const {
  handleSearchMosques,
  handleGetMosqueTimes,
} = require("../handlers/webMosqueHandler.js");

beforeEach(() => {
  jest.clearAllMocks();
  webAuthHandler.getSessionFromEvent.mockReturnValue({
    sub: "amzn1.account.EXAMPLE",
  });
});

it("returns 401 without calling the mawaqit.net API when there is no valid session", async () => {
  webAuthHandler.getSessionFromEvent.mockReturnValue(null);

  const response = await handleSearchMosques({
    queryStringParameters: { lat: "1", lon: "2" },
  });

  expect(response.statusCode).toBe(401);
  expect(apiHandler.getMosqueList).not.toHaveBeenCalled();
});

it("returns 400 when neither word nor lat/lon are provided", async () => {
  const response = await handleSearchMosques({ queryStringParameters: {} });

  expect(response.statusCode).toBe(400);
  expect(apiHandler.getMosqueList).not.toHaveBeenCalled();
});

it("searches by lat/lon when provided", async () => {
  apiHandler.getMosqueList.mockResolvedValue([
    { uuid: "mosque-1", primaryText: "Masjid A" },
  ]);

  const response = await handleSearchMosques({
    queryStringParameters: { lat: "25.276987", lon: "55.296249" },
  });

  expect(apiHandler.getMosqueList).toHaveBeenCalledWith(
    undefined,
    "25.276987",
    "55.296249",
    25, // the website's higher cap — the voice UI's default is 5
  );
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toEqual([
    { uuid: "mosque-1", primaryText: "Masjid A" },
  ]);
});

it("searches by word when provided, without requiring lat/lon", async () => {
  apiHandler.getMosqueList.mockResolvedValue([]);

  await handleSearchMosques({ queryStringParameters: { word: "Al-Ihsaan" } });

  expect(apiHandler.getMosqueList).toHaveBeenCalledWith(
    "Al-Ihsaan",
    undefined,
    undefined,
    25,
  );
});

it("returns 200 with an empty list (not an error) when the search has zero matches — the frontend shows a friendly 'no mosque found' message for this, not an error banner", async () => {
  apiHandler.getMosqueList.mockRejectedValue(
    new Error("Received Empty Response"),
  );

  const response = await handleSearchMosques({
    queryStringParameters: { word: "Nonexistent Mosque" },
  });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toEqual([]);
});

it("returns 502 with a generic message, not the raw error, when the upstream API fails for a real reason", async () => {
  apiHandler.getMosqueList.mockRejectedValue(
    new Error("Api-Access-Token invalid: sk_live_abc123"),
  );

  const response = await handleSearchMosques({
    queryStringParameters: { word: "test" },
  });

  expect(response.statusCode).toBe(502);
  expect(response.body).not.toContain("sk_live_abc123");
});

/**
 * GET /mosques/:uuid/times powers the website's prayer picker — it must show
 * (and only offer checkboxes for) the same prayers the voice flow would,
 * which is exactly what buildEligiblePrayerTimes/routineEligiblePrayers.js
 * encodes.
 */
describe("handleGetMosqueTimes", () => {
  it("returns 401 without calling the mawaqit.net API when there is no valid session", async () => {
    webAuthHandler.getSessionFromEvent.mockReturnValue(null);

    const response = await handleGetMosqueTimes(
      { queryStringParameters: { timezone: "America/New_York" } },
      "mosque-uuid",
    );

    expect(response.statusCode).toBe(401);
    expect(apiHandler.getPrayerTimings).not.toHaveBeenCalled();
  });

  it("returns 400 when timezone is missing", async () => {
    const response = await handleGetMosqueTimes(
      { queryStringParameters: {} },
      "mosque-uuid",
    );

    expect(response.statusCode).toBe(400);
    expect(apiHandler.getPrayerTimings).not.toHaveBeenCalled();
  });

  it("returns only the prayers with a real time today, paired with their times", async () => {
    apiHandler.getPrayerTimings.mockResolvedValue({
      times: [null, "13:00", "16:30", "19:45", "21:00"],
    });

    const response = await handleGetMosqueTimes(
      { queryStringParameters: { timezone: "America/New_York" } },
      "mosque-uuid",
    );

    expect(apiHandler.getPrayerTimings).toHaveBeenCalledWith(
      "mosque-uuid",
      "America/New_York",
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      prayerTimes: [
        { canonicalName: "Dhuhr", time: "13:00" },
        { canonicalName: "Asr", time: "16:30" },
        { canonicalName: "Maghrib", time: "19:45" },
        { canonicalName: "Isha", time: "21:00" },
      ],
    });
  });

  it("returns 404 when the mosque doesn't exist", async () => {
    apiHandler.getPrayerTimings.mockRejectedValue(
      new Error("Mosque not found"),
    );

    const response = await handleGetMosqueTimes(
      { queryStringParameters: { timezone: "America/New_York" } },
      "unknown-uuid",
    );

    expect(response.statusCode).toBe(404);
  });

  it("returns 502 for any other upstream failure", async () => {
    apiHandler.getPrayerTimings.mockRejectedValue(
      new Error("Received Empty Response"),
    );

    const response = await handleGetMosqueTimes(
      { queryStringParameters: { timezone: "America/New_York" } },
      "mosque-uuid",
    );

    expect(response.statusCode).toBe(502);
  });
});
