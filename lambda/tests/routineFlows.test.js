/**
 * Flow: "Alexa, set up the adhan" -> she reads "1. All prayers, 2. Fajr,
 * 3. Dhuhr, ..." -> the user says a number.
 *
 * The number is resolved against a list whose first entry is "All Prayers", so
 * the handler indexes with `- 2` after filtering that entry back out. Get it
 * wrong and the user gets a daily adhan for a prayer they did not pick — at the
 * wrong hour, every day, with nothing on screen to explain it.
 *
 * Also covers deleting the user's data, which is irreversible.
 */
jest.mock("../handlers/apiHandler.js");
jest.mock("../handlers/dynamoDbHandler.js");
jest.mock("../handlers/authHandler.js");
jest.mock("../handlers/eventBridgeScheduler.js");

const authHandler = require("../handlers/authHandler.js");
const dbHandler = require("../handlers/dynamoDbHandler.js");
const eventBridgeScheduler = require("../handlers/eventBridgeScheduler.js");
const {
  CreateRoutinePrayerIndexHandler,
  DeleteDataIntentHandler,
} = require("../handlers/intentHandler.js");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");
const { TODAY_TIMES, freezeAt } = require("./support/fixtures");

const TZ = "Europe/Paris";

const buildInput = ({ said, routinePrayers } = {}) =>
  buildHandlerInput({
    intentName: "CreateRoutineIntent",
    timezone: TZ,
    slots:
      said === undefined
        ? {}
        : { prayerIndex: { name: "prayerIndex", value: said } },
    sessionAttributes: {
      persistentAttributes: {
        uuid: "mosque-uuid",
        primaryText: "Mosquée de Paris",
        routinePrayers,
      },
      mosqueTimes: { times: TODAY_TIMES },
    },
  });

/** The prayer names + times passed to EventBridge, in call order. */
const scheduledPrayers = () =>
  eventBridgeScheduler.createOrUpdateSchedule.mock.calls.map(([args]) => [
    args.prayerName,
    args.time,
  ]);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  jest.clearAllMocks();
  freezeAt("2026-07-16 04:00", TZ);
  // Account linking is satisfied; this suite is about the prayer choice.
  authHandler.getUserInfo.mockResolvedValue({
    user_id: "user-1",
  });
  dbHandler.GetAzanUserInfo.mockResolvedValue({
    refresh_token: "token",
    endpointId: "endpoint-1",
  });
  eventBridgeScheduler.createOrUpdateSchedule.mockResolvedValue({});
});

afterEach(() => {
  jest.useRealTimers();
});

describe('"set up the adhan" — the number picks that prayer', () => {
  it.each([
    ["2", "Fajr", "05:30"],
    ["3", "Dhuhr", "13:45"],
    ["4", "Asr", "17:50"],
    ["5", "Maghrib", "21:35"],
    ["6", "Isha", "23:05"],
  ])(
    'saying "%s" schedules %s at %s and nothing else',
    async (said, expectedPrayer, expectedTime) => {
      // Entry 1 is "All Prayers", so the spoken number is two ahead of the
      // filtered array. An off-by-one wakes the user for the wrong prayer.
      const handlerInput = buildInput({ said });

      await CreateRoutinePrayerIndexHandler.handle(handlerInput);

      expect(scheduledPrayers()).toEqual([[expectedPrayer, expectedTime]]);
    },
  );

  it("schedules the adhan under the canonical name the azan lambda expects", async () => {
    // The prompts speak "<sub alias='dohr'>Dhuhr</sub>" and a French user sees
    // a translated name; EventBridge must still get "Dhuhr".
    const handlerInput = buildInput({ said: "3" });

    await CreateRoutinePrayerIndexHandler.handle(handlerInput);

    expect(eventBridgeScheduler.createOrUpdateSchedule).toHaveBeenCalledWith({
      mosqueId: "mosque-uuid",
      prayerName: "Dhuhr",
      time: "13:45",
      timezone: TZ,
    });
  });

  it('saying "1" schedules every prayer, each at its own time', async () => {
    const handlerInput = buildInput({ said: "1" });

    await CreateRoutinePrayerIndexHandler.handle(handlerInput);

    expect(scheduledPrayers()).toEqual([
      ["Fajr", "05:30"],
      ["Dhuhr", "13:45"],
      ["Asr", "17:50"],
      ["Maghrib", "21:35"],
      ["Isha", "23:05"],
    ]);
  });

  it("does not schedule an 'All Prayers' pseudo-routine", async () => {
    // "All Prayers" is a menu entry, not a prayer. Scheduling it would fire an
    // adhan at an empty time.
    const handlerInput = buildInput({ said: "1" });

    await CreateRoutinePrayerIndexHandler.handle(handlerInput);

    expect(scheduledPrayers().map(([name]) => name)).not.toContain(
      "All Prayers",
    );
  });

  it("offers only the prayers not already scheduled, and still numbers them right", async () => {
    // Fajr already has a routine, so the menu is "1. All, 2. Dhuhr, 3. Asr…".
    // Saying "2" must now mean Dhuhr, not Fajr.
    const handlerInput = buildInput({
      said: "2",
      routinePrayers: [{ name: "Fajr", canonicalName: "Fajr", time: "05:30" }],
    });

    await CreateRoutinePrayerIndexHandler.handle(handlerInput);

    expect(scheduledPrayers()).toEqual([["Dhuhr", "13:45"]]);
  });
});

describe('"set up the adhan" — a number that matches nothing', () => {
  it.each([["7"], ["0"], ["99"]])(
    'saying "%s" asks again instead of scheduling',
    async (said) => {
      const handlerInput = buildInput({ said });

      const response =
        await CreateRoutinePrayerIndexHandler.handle(handlerInput);

      expect(
        eventBridgeScheduler.createOrUpdateSchedule,
      ).not.toHaveBeenCalled();
      expect(response.shouldEndSession).toBe(false);
    },
  );

  it("re-elicits the number rather than dead-ending the conversation", async () => {
    const handlerInput = buildInput({ said: "7" });

    const response = await CreateRoutinePrayerIndexHandler.handle(handlerInput);

    expect(response.directives).toContainEqual(
      expect.objectContaining({
        type: "Dialog.ElicitSlot",
        slotToElicit: "prayerIndex",
      }),
    );
  });
});

describe('"set up the adhan" — prerequisites', () => {
  it("asks the user to link their account before touching any schedule", async () => {
    authHandler.getUserInfo.mockResolvedValue(null);
    const handlerInput = buildInput({ said: "3" });

    const response = await CreateRoutinePrayerIndexHandler.handle(handlerInput);

    expect(eventBridgeScheduler.createOrUpdateSchedule).not.toHaveBeenCalled();
    expect(spokenText(response)).toBeTruthy();
  });

  it("asks the user to register a mosque first", async () => {
    const handlerInput = buildHandlerInput({
      intentName: "CreateRoutineIntent",
      timezone: TZ,
      slots: { prayerIndex: { name: "prayerIndex", value: "3" } },
      sessionAttributes: {},
    });

    const response = await CreateRoutinePrayerIndexHandler.handle(handlerInput);

    expect(eventBridgeScheduler.createOrUpdateSchedule).not.toHaveBeenCalled();
    expect(spokenText(response)).toContain("haven't registered a mosque");
  });

  it("does not claim success when EventBridge rejects the schedule", async () => {
    // Telling the user their adhan is set when nothing was scheduled is the
    // worst outcome here: they find out by missing a prayer.
    eventBridgeScheduler.createOrUpdateSchedule.mockRejectedValue(
      new Error("EventBridge throttled"),
    );
    const handlerInput = buildInput({ said: "3" });

    const response = await CreateRoutinePrayerIndexHandler.handle(handlerInput);

    expect(spokenText(response)).not.toContain("has been created");
    expect(spokenText(response)).toMatch(/sorry|error|try again/i);
  });
});

describe('"delete my data" — irreversible, so it must be complete', () => {
  const buildDeleteInput = (options = {}) =>
    buildHandlerInput({ intentName: "DeleteDataIntent", timezone: TZ, ...options });

  it("asks for confirmation when confirmationStatus is NONE", async () => {
    const handlerInput = buildDeleteInput({ confirmationStatus: "NONE" });
    dbHandler.DeleteUserInfo.mockResolvedValue({});
    handlerInput.attributesManager.deletePersistentAttributes = jest.fn(
      async () => {},
    );

    const response = await DeleteDataIntentHandler.handle(handlerInput);

    // Verify dialog confirmation directive is returned
    expect(response.directives).toContainEqual(
      expect.objectContaining({
        type: "Dialog.ConfirmIntent",
      }),
    );
    expect(spokenText(response)).toContain("Are you sure you want to delete all your data");

    // Verify nothing was deleted
    expect(dbHandler.DeleteUserInfo).not.toHaveBeenCalled();
    expect(
      handlerInput.attributesManager.deletePersistentAttributes,
    ).not.toHaveBeenCalled();
  });

  it("does not delete data and asks if they need anything else when confirmationStatus is DENIED", async () => {
    const handlerInput = buildDeleteInput({ confirmationStatus: "DENIED" });
    dbHandler.DeleteUserInfo.mockResolvedValue({});
    handlerInput.attributesManager.deletePersistentAttributes = jest.fn(
      async () => {},
    );

    const response = await DeleteDataIntentHandler.handle(handlerInput);

    expect(spokenText(response)).toContain("your data has not been deleted");
    expect(spokenText(response)).toContain("Do you need anything else");
    expect(response.shouldEndSession).toBe(false);

    // Verify nothing was deleted
    expect(dbHandler.DeleteUserInfo).not.toHaveBeenCalled();
    expect(
      handlerInput.attributesManager.deletePersistentAttributes,
    ).not.toHaveBeenCalled();
  });

  it("clears both the azan record and the skill's own attributes when confirmationStatus is CONFIRMED", async () => {
    // Leaving either behind means a "deleted" user still gets adhan pushes, or
    // a re-enabled skill silently resurrects the old mosque.
    dbHandler.DeleteUserInfo.mockResolvedValue({});
    const handlerInput = buildDeleteInput({ confirmationStatus: "CONFIRMED" });
    handlerInput.attributesManager.deletePersistentAttributes = jest.fn(
      async () => {},
    );

    const response = await DeleteDataIntentHandler.handle(handlerInput);

    expect(dbHandler.DeleteUserInfo).toHaveBeenCalledWith("user-1");
    expect(
      handlerInput.attributesManager.deletePersistentAttributes,
    ).toHaveBeenCalled();
    expect(spokenText(response)).toContain("successfully deleted");
    expect(response.shouldEndSession).toBe(true);
  });

  it("does not report success when the deletion failed (confirmed)", async () => {
    dbHandler.DeleteUserInfo.mockRejectedValue(new Error("DynamoDB down"));
    const handlerInput = buildDeleteInput({ confirmationStatus: "CONFIRMED" });
    handlerInput.attributesManager.deletePersistentAttributes = jest.fn(
      async () => {},
    );

    const response = await DeleteDataIntentHandler.handle(handlerInput);

    expect(spokenText(response)).not.toContain("successfully deleted");
    expect(
      handlerInput.attributesManager.deletePersistentAttributes,
    ).not.toHaveBeenCalled();
  });
});
