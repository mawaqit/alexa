/**
 * Routines schedule the adhan on the user's device. A routine pinned to a stale
 * or mismatched time plays the adhan at the wrong moment every day until the
 * user notices, so the name->index mapping and the daily refresh are the risk.
 */
jest.mock("../handlers/apiHandler.js");
jest.mock("../handlers/eventBridgeScheduler.js");

const {
  updateRoutinePrayers,
  deleteRoutine,
  checkForRoutinePrayerAlreadyExists,
  CANONICAL_PRAYER_NAMES,
} = require("../helperFunctions.js");
const { buildHandlerInput } = require("./support/handlerInput");
const { TODAY_TIMES } = require("./support/fixtures");

const buildInput = ({ routinePrayers, times = TODAY_TIMES }) =>
  buildHandlerInput({
    intentName: "TestIntent",
    sessionAttributes: {
      persistentAttributes: { uuid: "mosque-uuid", routinePrayers },
      mosqueTimes: { times },
    },
  });

describe("updateRoutinePrayers — keeping saved routines on the right time", () => {
  it("refreshes each routine to today's time for its own prayer", async () => {
    // Yesterday's stored times must be replaced by today's, prayer by prayer.
    const routinePrayers = [
      { name: "Fajr", canonicalName: "Fajr", time: "05:28" },
      { name: "Isha", canonicalName: "Isha", time: "23:09" },
    ];
    const handlerInput = buildInput({ routinePrayers });

    await updateRoutinePrayers(handlerInput);

    expect(routinePrayers[0].time).toBe("05:30");
    expect(routinePrayers[1].time).toBe("23:05");
    expect(handlerInput._savePersistentAttributes).toHaveBeenCalled();
  });

  it("matches on canonical name, not on the localized spoken name", async () => {
    // A French user's routine is stored with a translated `name`; only the
    // canonical name reliably identifies which prayer it is.
    const routinePrayers = [
      { name: "Aube", canonicalName: "Fajr", time: "05:28" },
    ];
    const handlerInput = buildInput({ routinePrayers });

    await updateRoutinePrayers(handlerInput);

    expect(routinePrayers[0].time).toBe("05:30");
  });

  it("falls back to the prayer name for routines saved before canonical names existed", async () => {
    const routinePrayers = [{ name: "asr", time: "17:45" }];
    const handlerInput = buildInput({ routinePrayers });

    await updateRoutinePrayers(handlerInput);

    expect(routinePrayers[0].time).toBe("17:50");
  });

  it("leaves Jumua and Eid routines alone — their times are not in `times`", async () => {
    // Jumua is canonical index 5, past the five daily prayers. Indexing into
    // `times` with it would either be undefined or grab the wrong prayer.
    const routinePrayers = [
      { name: "Jumma", canonicalName: "Jumma", time: "13:15" },
      { name: "Eid", canonicalName: "Eid", time: "08:00" },
    ];
    const handlerInput = buildInput({ routinePrayers });

    await updateRoutinePrayers(handlerInput);

    expect(routinePrayers[0].time).toBe("13:15");
    expect(routinePrayers[1].time).toBe("08:00");
  });

  it("keeps the old time when the mosque publishes no time for that prayer", async () => {
    const routinePrayers = [
      { name: "Isha", canonicalName: "Isha", time: "23:09" },
    ];
    const handlerInput = buildInput({
      routinePrayers,
      times: ["05:30", "13:45", "17:50", "21:35", undefined],
    });

    await updateRoutinePrayers(handlerInput);

    expect(routinePrayers[0].time).toBe("23:09");
  });

  it("does not touch persistence when the user has no routines", async () => {
    const handlerInput = buildInput({ routinePrayers: [] });

    await updateRoutinePrayers(handlerInput);

    expect(handlerInput._savePersistentAttributes).not.toHaveBeenCalled();
  });

  it("covers the five daily prayers with canonical names in `times` order", () => {
    // Guards the shared contract: CANONICAL_PRAYER_NAMES[i] must describe
    // mosqueTimes.times[i] for i < 5.
    expect(CANONICAL_PRAYER_NAMES.slice(0, 5)).toEqual([
      "Fajr",
      "Dhuhr",
      "Asr",
      "Maghrib",
      "Isha",
    ]);
  });
});

describe("checkForRoutinePrayerAlreadyExists", () => {
  it("reports an existing routine when name and time both match", async () => {
    const handlerInput = buildInput({
      routinePrayers: [{ name: "Fajr", canonicalName: "Fajr", time: "05:30" }],
    });

    const exists = await checkForRoutinePrayerAlreadyExists(handlerInput, {
      name: "Fajr",
      canonicalName: "Fajr",
      time: "05:30",
    });

    expect(exists).toBe(true);
  });

  it("drops the stale entry when the prayer's time has moved", async () => {
    // Same prayer, new time: the old routine must go so the caller can recreate
    // it, otherwise the user ends up with two adhans a minute apart.
    const routinePrayers = [
      { name: "Fajr", canonicalName: "Fajr", time: "05:28" },
    ];
    const handlerInput = buildInput({ routinePrayers });

    const exists = await checkForRoutinePrayerAlreadyExists(handlerInput, {
      name: "Fajr",
      canonicalName: "Fajr",
      time: "05:30",
    });

    expect(exists).toBe(false);
    expect(routinePrayers).toHaveLength(0);
  });

  it("does not confuse two different prayers", async () => {
    const handlerInput = buildInput({
      routinePrayers: [{ name: "Fajr", canonicalName: "Fajr", time: "05:30" }],
    });

    const exists = await checkForRoutinePrayerAlreadyExists(handlerInput, {
      name: "Asr",
      canonicalName: "Asr",
      time: "17:50",
    });

    expect(exists).toBe(false);
  });
});

describe("deleteRoutine", () => {
  it("removes a single routine by canonical name and keeps the rest", async () => {
    const routinePrayers = [
      { name: "Fajr", canonicalName: "Fajr", time: "05:30" },
      { name: "Asr", canonicalName: "Asr", time: "17:50" },
    ];
    const handlerInput = buildInput({ routinePrayers });

    const deleted = await deleteRoutine(handlerInput, "Fajr");

    expect(deleted).toBe(true);
    expect(routinePrayers).toEqual([
      { name: "Asr", canonicalName: "Asr", time: "17:50" },
    ]);
    expect(handlerInput._savePersistentAttributes).toHaveBeenCalled();
  });

  it("clears every routine when the user asks for all prayers", async () => {
    const handlerInput = buildInput({
      routinePrayers: [
        { name: "Fajr", canonicalName: "Fajr", time: "05:30" },
        { name: "Asr", canonicalName: "Asr", time: "17:50" },
      ],
    });

    const deleted = await deleteRoutine(handlerInput, "All Prayers");

    expect(deleted).toBe(true);
    expect(
      handlerInput._getPersistentAttributes().routinePrayers,
    ).toBeUndefined();
  });

  it("reports failure rather than silently succeeding for an unknown routine", async () => {
    const routinePrayers = [
      { name: "Fajr", canonicalName: "Fajr", time: "05:30" },
    ];
    const handlerInput = buildInput({ routinePrayers });

    const deleted = await deleteRoutine(handlerInput, "Maghrib");

    expect(deleted).toBe(false);
    expect(routinePrayers).toHaveLength(1);
  });
});
