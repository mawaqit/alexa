/**
 * GET /me/config has three possible answers depending on how far along the
 * user is: already Alexa-linked (read from the persistence table via the
 * userId-index bridge), web-only with a pending save waiting to be applied
 * once they do link, or nothing configured at all. Getting the wrong one of
 * these wrong sends the frontend down the wrong onboarding path.
 */
jest.mock("../handlers/dynamoDbHandler.js");
jest.mock("../handlers/webAuthHandler.js");
jest.mock("../handlers/apiHandler.js");
jest.mock("../handlers/eventBridgeScheduler.js");
jest.mock("../util/CustomDynamoDbPersistenceAdapter.js");

const dbHandler = require("../handlers/dynamoDbHandler.js");
const webAuthHandler = require("../handlers/webAuthHandler.js");
const apiHandler = require("../handlers/apiHandler.js");
const eventBridgeScheduler = require("../handlers/eventBridgeScheduler.js");
const {
  CustomDynamoDbPersistenceAdapter,
} = require("../util/CustomDynamoDbPersistenceAdapter.js");
const {
  handleGetConfig,
  handleSaveMosque,
  handleSavePrayers,
  handleGetReciters,
  handleSaveReciter,
  applyPendingWebConfig,
} = require("../handlers/webConfigHandler.js");
// The real, static list — same one intentHandler.js's FavoriteAdhaanReciterIntent
// offers by voice (see datasources.js). Not mocked: it's plain data, and
// asserting against it directly is what proves the website can't drift out
// of sync with the voice flow.
const { adhaanRecitation } = require("../datasources.js");

const httpEvent = (body) => ({ body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  webAuthHandler.getSessionFromEvent.mockReturnValue({
    sub: "amzn1.account.EXAMPLE",
  });
});

it("returns 401 without touching DynamoDB when there is no valid session", async () => {
  webAuthHandler.getSessionFromEvent.mockReturnValue(null);

  const response = await handleGetConfig({});

  expect(response.statusCode).toBe(401);
  expect(dbHandler.GetPersistenceUserByUserId).not.toHaveBeenCalled();
});

it("returns the Alexa-linked mosque and routine prayers when the userId-index lookup finds a row", async () => {
  webAuthHandler.getSessionFromEvent.mockReturnValue({
    sub: "amzn1.account.EXAMPLE",
  });
  dbHandler.GetPersistenceUserByUserId.mockResolvedValue({
    id: "amzn1.ask.account.EXAMPLE",
    attributes: {
      uuid: "mosque-uuid",
      primaryText: "Masjid Al-Ihsaan",
      proximity: 12.5,
      localisation: "Miami",
      jumua: "13:30",
      routinePrayers: [{ name: "Fajr", canonicalName: "Fajr", time: "05:30" }],
      // Fields that must not leak into the response.
      user_id: "amzn1.account.EXAMPLE",
      code: "secret-oauth-code",
    },
  });

  const response = await handleGetConfig({});

  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body);
  expect(body.linked).toBe("alexa");
  expect(body.mosque).toEqual({
    uuid: "mosque-uuid",
    primaryText: "Masjid Al-Ihsaan",
    proximity: 12.5,
    localisation: "Miami",
    jumua: "13:30",
    jumua2: undefined,
    jumua3: undefined,
    image: undefined,
  });
  expect(body.routinePrayers).toEqual([
    { name: "Fajr", canonicalName: "Fajr", time: "05:30" },
  ]);
  expect(body.user_id).toBeUndefined();
  expect(body.code).toBeUndefined();
});

it("falls back to the pending web config when there is no Alexa-linked row yet", async () => {
  webAuthHandler.getSessionFromEvent.mockReturnValue({
    sub: "amzn1.account.EXAMPLE",
  });
  dbHandler.GetPersistenceUserByUserId.mockResolvedValue(null);
  dbHandler.GetAzanUserInfo.mockResolvedValue({
    id: "amzn1.account.EXAMPLE",
    pendingMosqueSelection: {
      uuid: "mosque-uuid",
      primaryText: "Masjid Al-Ihsaan",
    },
    pendingRoutinePrayers: ["Fajr", "Isha"],
    refresh_token: "token",
    endpointId: "mawaqit-azan-trigger-EXAMPLE",
  });

  const response = await handleGetConfig({});

  const body = JSON.parse(response.body);
  expect(body).toEqual({
    linked: "web-only",
    mosque: { uuid: "mosque-uuid", primaryText: "Masjid Al-Ihsaan" },
    routinePrayers: ["Fajr", "Isha"],
    favouriteAdhaan: null,
    pending: true,
    deviceLinked: true,
  });
});

it("reports deviceLinked: false when the pending config exists but the skill was never account-linked", async () => {
  webAuthHandler.getSessionFromEvent.mockReturnValue({
    sub: "amzn1.account.EXAMPLE",
  });
  dbHandler.GetPersistenceUserByUserId.mockResolvedValue(null);
  dbHandler.GetAzanUserInfo.mockResolvedValue({
    id: "amzn1.account.EXAMPLE",
    pendingMosqueSelection: { uuid: "mosque-uuid" },
  });

  const response = await handleGetConfig({});

  expect(JSON.parse(response.body).deviceLinked).toBe(false);
});

it("returns linked: none when neither the Alexa link nor a pending web config exist", async () => {
  webAuthHandler.getSessionFromEvent.mockReturnValue({
    sub: "amzn1.account.EXAMPLE",
  });
  dbHandler.GetPersistenceUserByUserId.mockResolvedValue(null);
  dbHandler.GetAzanUserInfo.mockResolvedValue(undefined);

  const response = await handleGetConfig({});

  expect(JSON.parse(response.body)).toEqual({
    linked: "none",
    mosque: null,
    routinePrayers: [],
    favouriteAdhaan: null,
  });
});

it("returns the Alexa-linked user's favourite reciter by name only, never the mp3 URLs", async () => {
  dbHandler.GetPersistenceUserByUserId.mockResolvedValue({
    id: "amzn1.ask.account.EXAMPLE",
    attributes: {
      uuid: "mosque-uuid",
      favouriteAdhaan: {
        primaryText: "Madina",
        fajrUrl: "https://mawaqit.net/static/mp3/adhan-madina-fajr.mp3",
        otherUrl: "https://mawaqit.net/static/mp3/adhan-madina.mp3",
      },
    },
  });

  const response = await handleGetConfig({});

  expect(JSON.parse(response.body).favouriteAdhaan).toBe("Madina");
});

it("surfaces a pending (not yet Alexa-linked) favourite reciter selection", async () => {
  dbHandler.GetPersistenceUserByUserId.mockResolvedValue(null);
  dbHandler.GetAzanUserInfo.mockResolvedValue({
    pendingFavouriteAdhaan: { primaryText: "Egypt" },
  });

  const response = await handleGetConfig({});

  const body = JSON.parse(response.body);
  expect(body.linked).toBe("web-only");
  expect(body.favouriteAdhaan).toBe("Egypt");
});

/**
 * handleSaveMosque/handleSavePrayers never write the persistence table
 * directly — they stage a "pending" write on azan-users-data (atomic, since
 * that table has other concurrent writers) and delegate to
 * applyPendingWebConfig for the actual apply. These tests cover the staging
 * + validation; applyPendingWebConfig's own tests below cover the merge.
 */
describe("handleSaveMosque", () => {
  const validBody = {
    uuid: "mosque-uuid",
    primaryText: "Masjid Al-Ihsaan",
    timezone: "America/New_York",
  };

  it("returns 401 without writing anything when there is no valid session", async () => {
    webAuthHandler.getSessionFromEvent.mockReturnValue(null);

    const response = await handleSaveMosque(httpEvent(validBody));

    expect(response.statusCode).toBe(401);
    expect(dbHandler.UpdateAzanUserAttributesAtomic).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await handleSaveMosque({ body: "{not json" });

    expect(response.statusCode).toBe(400);
  });

  it.each([
    ["uuid", { ...validBody, uuid: undefined }],
    ["primaryText", { ...validBody, primaryText: undefined }],
    ["timezone", { ...validBody, timezone: undefined }],
  ])("returns 400 when %s is missing", async (_field, body) => {
    const response = await handleSaveMosque(httpEvent(body));

    expect(response.statusCode).toBe(400);
    expect(dbHandler.UpdateAzanUserAttributesAtomic).not.toHaveBeenCalled();
  });

  it("stages the mosque selection and timezone atomically, stripping undefined optional fields", async () => {
    dbHandler.GetPersistenceUserByUserId.mockResolvedValue(null); // not linked yet

    await handleSaveMosque(httpEvent(validBody));

    expect(dbHandler.UpdateAzanUserAttributesAtomic).toHaveBeenCalledWith(
      "amzn1.account.EXAMPLE",
      {
        pendingMosqueSelection: {
          uuid: "mosque-uuid",
          primaryText: "Masjid Al-Ihsaan",
        },
        pendingTimezone: "America/New_York",
      },
    );
  });

  it("reports applied: false with a reason when the user isn't Alexa-linked yet", async () => {
    dbHandler.GetPersistenceUserByUserId.mockResolvedValue(null);

    const response = await handleSaveMosque(httpEvent(validBody));

    expect(JSON.parse(response.body)).toEqual({
      saved: true,
      applied: false,
      reason: "not-linked",
    });
  });

  it("reports applied: true when the save gets picked up immediately for an already-linked user", async () => {
    dbHandler.GetPersistenceUserByUserId.mockResolvedValue({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: {},
    });
    dbHandler.GetAzanUserInfo.mockResolvedValue({
      pendingMosqueSelection: validBody,
    });

    const response = await handleSaveMosque(httpEvent(validBody));

    expect(JSON.parse(response.body)).toEqual({ saved: true, applied: true });
  });
});

describe("handleSavePrayers", () => {
  const validBody = { prayers: ["Fajr", "Isha"], timezone: "America/New_York" };

  it("returns 401 without writing anything when there is no valid session", async () => {
    webAuthHandler.getSessionFromEvent.mockReturnValue(null);

    const response = await handleSavePrayers(httpEvent(validBody));

    expect(response.statusCode).toBe(401);
    expect(dbHandler.UpdateAzanUserAttributesAtomic).not.toHaveBeenCalled();
  });

  it("returns 400 when prayers isn't an array", async () => {
    const response = await handleSavePrayers(
      httpEvent({ prayers: "Fajr", timezone: "America/New_York" }),
    );

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when timezone is missing", async () => {
    const response = await handleSavePrayers(httpEvent({ prayers: ["Fajr"] }));

    expect(response.statusCode).toBe(400);
  });

  it("stages the prayer list and timezone atomically", async () => {
    dbHandler.GetPersistenceUserByUserId.mockResolvedValue(null);

    await handleSavePrayers(httpEvent(validBody));

    expect(dbHandler.UpdateAzanUserAttributesAtomic).toHaveBeenCalledWith(
      "amzn1.account.EXAMPLE",
      {
        pendingRoutinePrayers: ["Fajr", "Isha"],
        pendingTimezone: "America/New_York",
      },
    );
  });
});

describe("handleGetReciters", () => {
  it("returns 401 when there is no valid session", async () => {
    webAuthHandler.getSessionFromEvent.mockReturnValue(null);

    const response = await handleGetReciters({});

    expect(response.statusCode).toBe(401);
  });

  it("returns the same reciter list the voice flow offers, by name only", async () => {
    const response = await handleGetReciters({});

    expect(JSON.parse(response.body)).toEqual(
      adhaanRecitation.map(({ primaryText }) => ({ primaryText })),
    );
  });
});

describe("handleSaveReciter", () => {
  it("returns 401 without writing anything when there is no valid session", async () => {
    webAuthHandler.getSessionFromEvent.mockReturnValue(null);

    const response = await handleSaveReciter(
      httpEvent({ primaryText: "Madina" }),
    );

    expect(response.statusCode).toBe(401);
    expect(dbHandler.UpdateAzanUserAttributesAtomic).not.toHaveBeenCalled();
  });

  it("returns 400 when primaryText is missing", async () => {
    const response = await handleSaveReciter(httpEvent({}));

    expect(response.statusCode).toBe(400);
    expect(dbHandler.UpdateAzanUserAttributesAtomic).not.toHaveBeenCalled();
  });

  it("returns 400 for a name that isn't in the known reciter list, instead of staging junk", async () => {
    const response = await handleSaveReciter(
      httpEvent({ primaryText: "Someone Made This Up" }),
    );

    expect(response.statusCode).toBe(400);
    expect(dbHandler.UpdateAzanUserAttributesAtomic).not.toHaveBeenCalled();
  });

  it("stages the full matching reciter entry (name + both mp3 URLs), not just the name", async () => {
    dbHandler.GetPersistenceUserByUserId.mockResolvedValue(null); // not linked yet

    await handleSaveReciter(httpEvent({ primaryText: "Madina" }));

    expect(dbHandler.UpdateAzanUserAttributesAtomic).toHaveBeenCalledWith(
      "amzn1.account.EXAMPLE",
      {
        pendingFavouriteAdhaan: adhaanRecitation.find(
          (r) => r.primaryText === "Madina",
        ),
      },
    );
  });
});

/**
 * applyPendingWebConfig is the one place allowed to write the persistence
 * table (via CustomDynamoDbPersistenceAdapter, never a raw PutCommand) and
 * the one place that turns a prayer selection into real EventBridge
 * schedules. Called both synchronously after a website save and from the
 * web-first hydration path in interceptors.js — these tests exercise it
 * directly, independent of either caller.
 */
describe("applyPendingWebConfig", () => {
  // applyPendingWebConfig always re-reads the row by primary key (a
  // consistent GetItem) rather than trusting the userId-index GSI lookup's
  // own copy of `attributes` — the GSI is eventually consistent, and this
  // function full-replaces the row on every call, so a stale read here
  // could silently wipe whatever another recent save just wrote (see the
  // comment on the function). These tests mock both lookups identically,
  // since in the absence of a race they return the same row; the race
  // itself is exercised by the dedicated test below.
  function mockLinkedRow(row) {
    dbHandler.GetPersistenceUserByUserId.mockResolvedValue(row);
    dbHandler.GetPersistenceUserById.mockResolvedValue(row);
  }

  it("returns not-linked and never reads azan-users-data when there is no persistence row for this LWA id", async () => {
    dbHandler.GetPersistenceUserByUserId.mockResolvedValue(null);

    const result = await applyPendingWebConfig("amzn1.account.EXAMPLE");

    expect(result).toEqual({ applied: false, reason: "not-linked" });
    expect(dbHandler.GetAzanUserInfo).not.toHaveBeenCalled();
  });

  it("re-reads the row by primary key instead of trusting the GSI lookup's own (possibly stale) attributes — regression test for a save silently wiping another save that just landed", async () => {
    // Simulates two independent website saves landing back to back (e.g.
    // save reciter, then immediately save prayers): the userId-index GSI
    // lookup below still reflects the state from *before* the reciter save
    // (GSI queries are eventually consistent), but the row itself, read by
    // primary key, already has it. Using the GSI's own copy here would
    // silently drop favouriteAdhaan the moment this call's full-replace
    // PutCommand runs.
    dbHandler.GetPersistenceUserByUserId.mockResolvedValue({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: { uuid: "mosque-uuid" }, // stale — missing favouriteAdhaan
    });
    dbHandler.GetPersistenceUserById.mockResolvedValue({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: {
        uuid: "mosque-uuid",
        favouriteAdhaan: { primaryText: "Madina" },
      },
    });
    dbHandler.GetAzanUserInfo.mockResolvedValue({
      pendingRoutinePrayers: ["Fajr"],
      pendingTimezone: "America/New_York",
    });
    apiHandler.getPrayerTimings.mockResolvedValue({
      times: ["05:30", "13:00", "16:30", "19:45", "21:00"],
    });

    await applyPendingWebConfig("amzn1.account.EXAMPLE");

    const [, savedAttributes] =
      CustomDynamoDbPersistenceAdapter.prototype.saveAttributes.mock.calls[0];
    expect(savedAttributes.favouriteAdhaan).toEqual({ primaryText: "Madina" });
  });

  it("returns nothing-pending and never writes when there's a linked row but nothing staged", async () => {
    mockLinkedRow({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: { uuid: "existing-mosque" },
    });
    dbHandler.GetAzanUserInfo.mockResolvedValue({ refresh_token: "token" });

    const result = await applyPendingWebConfig("amzn1.account.EXAMPLE");

    expect(result).toEqual({ applied: false, reason: "nothing-pending" });
    expect(
      CustomDynamoDbPersistenceAdapter.prototype.saveAttributes,
    ).not.toHaveBeenCalled();
  });

  it("applies a pending mosque selection, overwriting the mosque fields on the existing attributes", async () => {
    mockLinkedRow({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: {
        uuid: "old-mosque",
        routinePrayers: [],
        supportId: "123-456",
      },
    });
    dbHandler.GetAzanUserInfo.mockResolvedValue({
      pendingMosqueSelection: { uuid: "new-mosque", primaryText: "New Masjid" },
    });

    const result = await applyPendingWebConfig("amzn1.account.EXAMPLE");

    expect(result.applied).toBe(true);
    // Returned so the web-first hydration path in interceptors.js can push
    // this straight into its own attributesManager cache — see the comment
    // on applyPendingWebConfig's return statement.
    expect(result.attributes.uuid).toBe("new-mosque");
    const [envelope, savedAttributes] =
      CustomDynamoDbPersistenceAdapter.prototype.saveAttributes.mock.calls[0];
    expect(envelope.session.user.userId).toBe("amzn1.ask.account.EXAMPLE");
    expect(savedAttributes.uuid).toBe("new-mosque");
    expect(savedAttributes.primaryText).toBe("New Masjid");
    // Untouched fields must survive the merge.
    expect(savedAttributes.supportId).toBe("123-456");
  });

  /**
   * A routine schedule is built against a specific mosque's prayer times —
   * switching mosques makes any existing ones stale. Changing mosque from
   * the website must not leave the user thinking their old prayers are
   * still active (routinePrayers still showing "checked" in the UI) while
   * no working schedule actually exists for the new mosque.
   */
  describe("changing to a different mosque", () => {
    it("clears existing routinePrayers and deletes their old-mosque EventBridge schedules", async () => {
      mockLinkedRow({
        id: "amzn1.ask.account.EXAMPLE",
        attributes: {
          uuid: "old-mosque",
          routinePrayers: [
            { name: "Fajr", canonicalName: "Fajr", time: "05:30" },
            { name: "Isha", canonicalName: "Isha", time: "21:00" },
          ],
        },
      });
      dbHandler.GetAzanUserInfo.mockResolvedValue({
        pendingMosqueSelection: {
          uuid: "new-mosque",
          primaryText: "New Masjid",
        },
      });

      const result = await applyPendingWebConfig("amzn1.account.EXAMPLE");

      expect(result.applied).toBe(true);
      expect(eventBridgeScheduler.deleteSchedule).toHaveBeenCalledWith(
        "old-mosque",
        "Fajr",
      );
      expect(eventBridgeScheduler.deleteSchedule).toHaveBeenCalledWith(
        "old-mosque",
        "Isha",
      );
      const [, savedAttributes] =
        CustomDynamoDbPersistenceAdapter.prototype.saveAttributes.mock.calls[0];
      expect(savedAttributes.routinePrayers).toEqual([]);
    });

    it("does not touch schedules or routinePrayers when re-saving the same mosque", async () => {
      const existingRoutinePrayers = [
        { name: "Fajr", canonicalName: "Fajr", time: "05:30" },
      ];
      mockLinkedRow({
        id: "amzn1.ask.account.EXAMPLE",
        attributes: {
          uuid: "same-mosque",
          routinePrayers: existingRoutinePrayers,
        },
      });
      dbHandler.GetAzanUserInfo.mockResolvedValue({
        pendingMosqueSelection: {
          uuid: "same-mosque",
          primaryText: "Updated Name",
        },
      });

      await applyPendingWebConfig("amzn1.account.EXAMPLE");

      expect(eventBridgeScheduler.deleteSchedule).not.toHaveBeenCalled();
      const [, savedAttributes] =
        CustomDynamoDbPersistenceAdapter.prototype.saveAttributes.mock.calls[0];
      expect(savedAttributes.routinePrayers).toEqual(existingRoutinePrayers);
    });

    it("does not call deleteSchedule when there were no existing routinePrayers to clean up", async () => {
      mockLinkedRow({
        id: "amzn1.ask.account.EXAMPLE",
        attributes: { uuid: "old-mosque", routinePrayers: [] },
      });
      dbHandler.GetAzanUserInfo.mockResolvedValue({
        pendingMosqueSelection: { uuid: "new-mosque" },
      });

      await applyPendingWebConfig("amzn1.account.EXAMPLE");

      expect(eventBridgeScheduler.deleteSchedule).not.toHaveBeenCalled();
    });
  });

  it("clears the pending fields (to null) only after the persistence write succeeds", async () => {
    mockLinkedRow({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: { uuid: "old-mosque" },
    });
    dbHandler.GetAzanUserInfo.mockResolvedValue({
      pendingMosqueSelection: { uuid: "new-mosque" },
    });

    await applyPendingWebConfig("amzn1.account.EXAMPLE");

    expect(dbHandler.UpdateAzanUserAttributesAtomic).toHaveBeenCalledWith(
      "amzn1.account.EXAMPLE",
      {
        pendingMosqueSelection: null,
        pendingRoutinePrayers: null,
        pendingTimezone: null,
        pendingFavouriteAdhaan: null,
      },
    );
  });

  it("applies a pending reciter selection onto favouriteAdhaan, with no scheduling side effects", async () => {
    mockLinkedRow({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: { uuid: "mosque-uuid" },
    });
    const madina = adhaanRecitation.find((r) => r.primaryText === "Madina");
    dbHandler.GetAzanUserInfo.mockResolvedValue({
      pendingFavouriteAdhaan: madina,
    });

    const result = await applyPendingWebConfig("amzn1.account.EXAMPLE");

    expect(result.applied).toBe(true);
    const [, savedAttributes] =
      CustomDynamoDbPersistenceAdapter.prototype.saveAttributes.mock.calls[0];
    expect(savedAttributes.favouriteAdhaan).toEqual(madina);
    expect(eventBridgeScheduler.createOrUpdateSchedule).not.toHaveBeenCalled();
    expect(eventBridgeScheduler.deleteSchedule).not.toHaveBeenCalled();
    expect(dbHandler.UpdateAzanUserAttributesAtomic).toHaveBeenCalledWith(
      "amzn1.account.EXAMPLE",
      expect.objectContaining({ pendingFavouriteAdhaan: null }),
    );
  });

  it("returns no-mosque-selected when prayers are staged but the user has never picked a mosque", async () => {
    mockLinkedRow({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: {}, // no uuid
    });
    dbHandler.GetAzanUserInfo.mockResolvedValue({
      pendingRoutinePrayers: ["Fajr"],
      pendingTimezone: "America/New_York",
    });

    const result = await applyPendingWebConfig("amzn1.account.EXAMPLE");

    expect(result).toEqual({ applied: false, reason: "no-mosque-selected" });
    expect(apiHandler.getPrayerTimings).not.toHaveBeenCalled();
  });

  it("returns missing-timezone when prayers are staged without a timezone", async () => {
    mockLinkedRow({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: { uuid: "mosque-uuid" },
    });
    dbHandler.GetAzanUserInfo.mockResolvedValue({
      pendingRoutinePrayers: ["Fajr"],
    });

    const result = await applyPendingWebConfig("amzn1.account.EXAMPLE");

    expect(result).toEqual({ applied: false, reason: "missing-timezone" });
  });

  it("deletes schedules for dropped prayers, creates/updates schedules for kept ones, and preserves the localized name of a prayer that already had a voice-created routine", async () => {
    mockLinkedRow({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: {
        uuid: "mosque-uuid",
        routinePrayers: [
          {
            name: "Le Maghrib",
            canonicalName: "Maghrib",
            namePhoneme: "muh-grib",
            time: "19:45",
          },
        ],
      },
    });
    dbHandler.GetAzanUserInfo.mockResolvedValue({
      pendingRoutinePrayers: ["Fajr", "Isha"], // Maghrib dropped, Fajr+Isha added
      pendingTimezone: "America/New_York",
    });
    apiHandler.getPrayerTimings.mockResolvedValue({
      times: ["05:30", "13:00", "16:30", "19:50", "21:15"], // Fajr, Dhuhr, Asr, Maghrib, Isha
    });

    const result = await applyPendingWebConfig("amzn1.account.EXAMPLE");

    expect(result.applied).toBe(true);
    expect(eventBridgeScheduler.deleteSchedule).toHaveBeenCalledWith(
      "mosque-uuid",
      "Maghrib",
    );
    expect(eventBridgeScheduler.createOrUpdateSchedule).toHaveBeenCalledWith({
      mosqueId: "mosque-uuid",
      prayerName: "Fajr",
      time: "05:30",
      timezone: "America/New_York",
    });
    expect(eventBridgeScheduler.createOrUpdateSchedule).toHaveBeenCalledWith({
      mosqueId: "mosque-uuid",
      prayerName: "Isha",
      time: "21:15",
      timezone: "America/New_York",
    });
    // Maghrib was dropped, so it must not get a fresh schedule call.
    expect(
      eventBridgeScheduler.createOrUpdateSchedule,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({ prayerName: "Maghrib" }),
    );

    const [, savedAttributes] =
      CustomDynamoDbPersistenceAdapter.prototype.saveAttributes.mock.calls[0];
    expect(savedAttributes.routinePrayers).toEqual([
      {
        name: "Fajr",
        canonicalName: "Fajr",
        namePhoneme: "Fajr",
        time: "05:30",
      },
      {
        name: "Isha",
        canonicalName: "Isha",
        namePhoneme: "Isha",
        time: "21:15",
      },
    ]);
  });

  it("skips a desired prayer the mosque has no time for instead of scheduling a bogus time", async () => {
    mockLinkedRow({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: { uuid: "mosque-uuid", routinePrayers: [] },
    });
    dbHandler.GetAzanUserInfo.mockResolvedValue({
      pendingRoutinePrayers: ["Fajr"],
      pendingTimezone: "America/New_York",
    });
    apiHandler.getPrayerTimings.mockResolvedValue({
      times: [null, "13:00", "16:30", "19:45", "21:00"],
    });

    const result = await applyPendingWebConfig("amzn1.account.EXAMPLE");

    expect(result.applied).toBe(true);
    expect(eventBridgeScheduler.createOrUpdateSchedule).not.toHaveBeenCalled();
    const [, savedAttributes] =
      CustomDynamoDbPersistenceAdapter.prototype.saveAttributes.mock.calls[0];
    expect(savedAttributes.routinePrayers).toEqual([]);
  });

  it("returns prayer-times-unavailable and writes nothing when the mosque times API fails, leaving the pending config intact for a retry", async () => {
    mockLinkedRow({
      id: "amzn1.ask.account.EXAMPLE",
      attributes: { uuid: "mosque-uuid", routinePrayers: [] },
    });
    dbHandler.GetAzanUserInfo.mockResolvedValue({
      pendingRoutinePrayers: ["Fajr"],
      pendingTimezone: "America/New_York",
    });
    apiHandler.getPrayerTimings.mockRejectedValue(
      new Error("Mosque not found"),
    );

    const result = await applyPendingWebConfig("amzn1.account.EXAMPLE");

    expect(result).toEqual({
      applied: false,
      reason: "prayer-times-unavailable",
    });
    expect(
      CustomDynamoDbPersistenceAdapter.prototype.saveAttributes,
    ).not.toHaveBeenCalled();
    expect(dbHandler.UpdateAzanUserAttributesAtomic).not.toHaveBeenCalled();
  });

  /**
   * The web-first hydration path (interceptors.js) already knows the Alexa
   * id directly — it's inside a live Alexa request. This is not just an
   * optimization: the userId-index GSI lookup used above can only find a
   * row whose attributes.user_id has already been promoted to the top-level
   * userId column, which for a genuinely first-ever launch hasn't happened
   * yet (Alexa.Authorization.Grant only ever writes `{ code }`). Passing
   * `{ alexaId }` is what makes hydration actually able to fire on that
   * first launch instead of permanently dead-ending on "not-linked".
   */
  describe("with a known alexaId (the web-first hydration path)", () => {
    it("fetches the row directly by id and never queries the userId-index GSI", async () => {
      dbHandler.GetPersistenceUserById.mockResolvedValue({
        id: "amzn1.ask.account.EXAMPLE",
        attributes: { uuid: "mosque-uuid" },
      });
      dbHandler.GetAzanUserInfo.mockResolvedValue({
        pendingMosqueSelection: { uuid: "new-mosque" },
      });

      await applyPendingWebConfig("amzn1.account.EXAMPLE", {
        alexaId: "amzn1.ask.account.EXAMPLE",
      });

      expect(dbHandler.GetPersistenceUserById).toHaveBeenCalledWith(
        "amzn1.ask.account.EXAMPLE",
      );
      expect(dbHandler.GetPersistenceUserByUserId).not.toHaveBeenCalled();
    });

    it("still applies (does not bail as not-linked) when no row exists yet at all — the exact first-launch scenario this parameter fixes", async () => {
      dbHandler.GetPersistenceUserById.mockResolvedValue(null);
      dbHandler.GetAzanUserInfo.mockResolvedValue({
        pendingMosqueSelection: {
          uuid: "new-mosque",
          primaryText: "New Masjid",
        },
      });

      const result = await applyPendingWebConfig("amzn1.account.EXAMPLE", {
        alexaId: "amzn1.ask.account.NEW",
      });

      expect(result).toEqual({ applied: true, attributes: expect.any(Object) });
      const [envelope, savedAttributes] =
        CustomDynamoDbPersistenceAdapter.prototype.saveAttributes.mock.calls[0];
      expect(envelope.session.user.userId).toBe("amzn1.ask.account.NEW");
      expect(savedAttributes.uuid).toBe("new-mosque");
    });

    it("sets user_id on the saved attributes so a later website visit can find this row via the GSI", async () => {
      dbHandler.GetPersistenceUserById.mockResolvedValue(null);
      dbHandler.GetAzanUserInfo.mockResolvedValue({
        pendingMosqueSelection: { uuid: "new-mosque" },
      });

      await applyPendingWebConfig("amzn1.account.EXAMPLE", {
        alexaId: "amzn1.ask.account.NEW",
      });

      const [, savedAttributes] =
        CustomDynamoDbPersistenceAdapter.prototype.saveAttributes.mock.calls[0];
      expect(savedAttributes.user_id).toBe("amzn1.account.EXAMPLE");
    });
  });
});
