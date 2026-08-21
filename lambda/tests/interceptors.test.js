/**
 * handleNewSession only ever loaded mosque/prayer context for users who had
 * already selected a mosque by voice — a user who configured everything
 * from the companion website first had no equivalent hook and would just
 * hit the usual "please select a mosque" prompt forever. This covers that
 * gap being closed: on a fresh session with nothing selected by voice, it
 * should apply whatever the website staged (if anything) before falling
 * through to the normal flow.
 */
jest.mock("../handlers/authHandler.js");
jest.mock("../handlers/apiHandler.js");
jest.mock("../handlers/webConfigHandler.js");

const authHandler = require("../handlers/authHandler.js");
const apiHandler = require("../handlers/apiHandler.js");
const webConfigHandler = require("../handlers/webConfigHandler.js");
const { SavePersistenceAttributesToSession } = require("../interceptors.js");
const { buildHandlerInput } = require("./support/handlerInput");

const FIVE_PRAYER_TIMES = {
  times: ["05:30", "13:00", "16:30", "19:45", "21:00"],
};

beforeEach(() => {
  jest.clearAllMocks();
  apiHandler.getPrayerTimings.mockResolvedValue(FIVE_PRAYER_TIMES);
});

it("does nothing when the session isn't new", async () => {
  const handlerInput = buildHandlerInput({ persistentAttributes: {} });
  handlerInput.requestEnvelope.session.new = false;

  await SavePersistenceAttributesToSession.process(handlerInput);

  expect(webConfigHandler.applyPendingWebConfig).not.toHaveBeenCalled();
});

it("leaves the pre-existing branch untouched when a mosque was already selected by voice", async () => {
  const handlerInput = buildHandlerInput({
    persistentAttributes: { uuid: "existing-mosque" },
  });
  authHandler.getUserInfo.mockResolvedValue({
    user_id: "amzn1.account.EXAMPLE",
  });

  await SavePersistenceAttributesToSession.process(handlerInput);

  expect(webConfigHandler.applyPendingWebConfig).not.toHaveBeenCalled();
  expect(apiHandler.getPrayerTimings).toHaveBeenCalledWith(
    "existing-mosque",
    "Europe/Paris",
  );
});

describe("web-first hydration (no mosque selected by voice yet)", () => {
  it("does nothing when the skill isn't account-linked yet — the existing link-account prompt stays untouched", async () => {
    const handlerInput = buildHandlerInput({
      persistentAttributes: {},
      accessToken: null,
    });

    await SavePersistenceAttributesToSession.process(handlerInput);

    expect(authHandler.getUserInfo).not.toHaveBeenCalled();
    expect(webConfigHandler.applyPendingWebConfig).not.toHaveBeenCalled();
  });

  it("does nothing further when nothing was staged from the website", async () => {
    const handlerInput = buildHandlerInput({ persistentAttributes: {} });
    authHandler.getUserInfo.mockResolvedValue({
      user_id: "amzn1.account.EXAMPLE",
    });
    webConfigHandler.applyPendingWebConfig.mockResolvedValue({
      applied: false,
      reason: "nothing-pending",
    });

    await SavePersistenceAttributesToSession.process(handlerInput);

    // The Alexa id (session.user.userId in the fixture) is passed through
    // directly — see the comment in interceptors.js on why this must not
    // rely on the userId-index GSI here.
    expect(webConfigHandler.applyPendingWebConfig).toHaveBeenCalledWith(
      "amzn1.account.EXAMPLE",
      { alexaId: "user-1" },
    );
    expect(handlerInput._getPersistentAttributes()).toEqual({});
  });

  it("applies a pending web config, loads it as this session's persistent attributes, and fetches mosque times so the same launch can speak them", async () => {
    const handlerInput = buildHandlerInput({ persistentAttributes: {} });
    authHandler.getUserInfo.mockResolvedValue({
      user_id: "amzn1.account.EXAMPLE",
    });
    const appliedAttributes = {
      uuid: "new-mosque",
      user_id: "amzn1.account.EXAMPLE",
      routinePrayers: [],
    };
    webConfigHandler.applyPendingWebConfig.mockResolvedValue({
      applied: true,
      attributes: appliedAttributes,
    });

    await SavePersistenceAttributesToSession.process(handlerInput);

    // Pushed straight into the attributesManager's cache rather than
    // re-reading via getPersistentAttributes() — see the comment in
    // interceptors.js on why a re-read would return stale data here.
    expect(handlerInput._getPersistentAttributes()).toBe(appliedAttributes);
    expect(apiHandler.getPrayerTimings).toHaveBeenCalledWith(
      "new-mosque",
      "Europe/Paris",
    );
  });

  it("never throws when applyPendingWebConfig itself fails", async () => {
    const handlerInput = buildHandlerInput({ persistentAttributes: {} });
    authHandler.getUserInfo.mockResolvedValue({
      user_id: "amzn1.account.EXAMPLE",
    });
    webConfigHandler.applyPendingWebConfig.mockRejectedValue(
      new Error("DynamoDB unavailable"),
    );

    await expect(
      SavePersistenceAttributesToSession.process(handlerInput),
    ).resolves.toBeUndefined();
  });
});
