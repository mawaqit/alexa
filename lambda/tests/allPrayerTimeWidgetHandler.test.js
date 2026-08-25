/**
 * Two failure surfaces on the All Prayer Time widget.
 *
 * (1) Tapping the widget used to speak only the next prayer (via
 *     checkForPersistenceData -> getNextPrayerTime), same as the single-prayer
 *     widget — wrong for a widget titled "Prayer Times". It now delegates to
 *     AllPrayerTimeIntentHandler, which speaks all five.
 * (2) A missing mosque, or a failed prayer-times fetch, used to push nothing
 *     to the datastore: nextUpdateTime stayed 0 and the document sat on
 *     "Fetching..." forever, since onMount only gets one shot at a fetch. It
 *     now pushes an explicit error sentinel (nextUpdateTime: -1) the document
 *     can branch on instead.
 */
jest.mock("../handlers/apiHandler.js");

const {
  getPrayerTimings,
  updateDatastore,
} = require("../handlers/apiHandler.js");
const {
  ReadAllPrayerTimeAPLEventHandler,
  InstallAllPrayerTimeWidgetRequestHandler,
} = require("../handlers/allPrayerTimeWidgetHandler.js");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");
const { TODAY_TIMES, freezeAt } = require("./support/fixtures");

const TZ = "Europe/Paris";
const UUID = "mosque-uuid";

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("ReadAllPrayerTimeAPLEventHandler — tapping the widget", () => {
  const buildTapInput = () =>
    buildHandlerInput({
      requestType: "Alexa.Presentation.APL.UserEvent",
      timezone: TZ,
      sessionAttributes: {
        persistentAttributes: { uuid: UUID, primaryText: "Mosquée de Paris" },
        mosqueTimes: { times: TODAY_TIMES, shuruq: "06:45" },
      },
    });

  it("speaks all five prayers, not just the next one", async () => {
    freezeAt("2026-07-16 04:00", TZ);

    const response =
      await ReadAllPrayerTimeAPLEventHandler.handle(buildTapInput());
    const speech = spokenText(response);

    expect(speech).toContain("Fajr is at 5:30 AM");
    expect(speech).toContain("Isha is at 11:05 PM");
  });

  it("suppresses the APL/card directives so the tap doesn't re-render the widget", async () => {
    freezeAt("2026-07-16 04:00", TZ);
    const handlerInput = buildTapInput();

    await ReadAllPrayerTimeAPLEventHandler.handle(handlerInput);

    expect(handlerInput.attributesManager.getSessionAttributes()).toMatchObject(
      { skipAplDirective: true, skipCardDirective: true },
    );
  });
});

describe("InstallAllPrayerTimeWidgetRequestHandler — failure surfaces", () => {
  it("pushes an error sentinel instead of nothing when no mosque is configured", async () => {
    freezeAt("2026-07-16 04:00", TZ);
    const handlerInput = buildHandlerInput({
      requestType: "Alexa.DataStore.PackageManager.UsagesInstalled",
      timezone: TZ,
      persistentAttributes: {},
    });

    await InstallAllPrayerTimeWidgetRequestHandler.handle(handlerInput);

    expect(updateDatastore).toHaveBeenCalledTimes(1);
    const [, commands] = updateDatastore.mock.calls[0];
    expect(commands[0].content.nextUpdateTime).toBe(-1);
    expect(commands[0].content.labels.error).toBeTruthy();
  });

  it("pushes the same error sentinel when the prayer-times fetch throws", async () => {
    freezeAt("2026-07-16 04:00", TZ);
    getPrayerTimings.mockRejectedValue(new Error("MAWAQIT API down"));
    const handlerInput = buildHandlerInput({
      requestType: "Alexa.DataStore.PackageManager.UsagesInstalled",
      timezone: TZ,
      persistentAttributes: { uuid: UUID, primaryText: "Mosquée de Paris" },
    });

    await InstallAllPrayerTimeWidgetRequestHandler.handle(handlerInput);

    expect(updateDatastore).toHaveBeenCalledTimes(1);
    const [, commands] = updateDatastore.mock.calls[0];
    expect(commands[0].content.nextUpdateTime).toBe(-1);
  });

  it("does not push an error state on a normal successful install", async () => {
    freezeAt("2026-07-16 04:00", TZ);
    getPrayerTimings.mockResolvedValue({ times: TODAY_TIMES });
    const handlerInput = buildHandlerInput({
      requestType: "Alexa.DataStore.PackageManager.UsagesInstalled",
      timezone: TZ,
      persistentAttributes: { uuid: UUID, primaryText: "Mosquée de Paris" },
    });

    await InstallAllPrayerTimeWidgetRequestHandler.handle(handlerInput);

    expect(updateDatastore).toHaveBeenCalledTimes(1);
    const [, commands] = updateDatastore.mock.calls[0];
    expect(commands[0].content.nextUpdateTime).toBeGreaterThan(0);
    expect(commands[0].content.labels.error).toBeUndefined();
  });
});
