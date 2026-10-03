/**
 * The Next Prayer widget shows one prayer and a countdown, often glanced at
 * for a few seconds. Two things must hold:
 *
 * - It never shows a guessed time. After Isha, tomorrow's Fajr comes from the
 *   calendar; if the calendar is unavailable the widget gets an error state
 *   (retried on its next mount), not today's Fajr time reused — voice keeps
 *   that fallback, the screen must not.
 * - Its countdown runs to the prayer's exact start, and the prayer keeps its
 *   "It's time" screen for its whole minute before moving on.
 *
 * Tapping it speaks the next prayer, and must work whether or not the tap
 * arrives with a session.
 */
jest.mock("../handlers/apiHandler.js");

const moment = require("moment-timezone");
const {
  getAccessToken,
  getPrayerTimings,
  updateDatastore,
} = require("../handlers/apiHandler.js");
const {
  InstallPrayerTimeWidgetRequestHandler,
  ReadPrayerTimeAPLEventHandler,
} = require("../handlers/prayerTimeWidgetHandler.js");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");
const {
  TODAY_TIMES,
  TOMORROW_TIMINGS,
  buildCalendar,
  freezeAt,
} = require("./support/fixtures");

const TZ = "Europe/Paris";
const UUID = "mosque-uuid";
const TODAY = "2026-07-16";
const TOMORROW = "2026-07-17";

const epochOf = (date, time) =>
  moment.tz(`${date} ${time}`, "YYYY-MM-DD HH:mm", TZ).valueOf();
const freezeAtSecond = (wallClock) =>
  jest.setSystemTime(moment.tz(wallClock, "YYYY-MM-DD HH:mm:ss", TZ).toDate());

const buildInstall = (persistentAttributes = { uuid: UUID }) =>
  buildHandlerInput({
    requestType: "Alexa.DataStore.PackageManager.UsagesInstalled",
    timezone: TZ,
    persistentAttributes: {
      primaryText: "Mosquée de Paris",
      ...persistentAttributes,
    },
  });

// Today's times, plus tomorrow's when the calendar is asked for.
const serveTimes = ({ tomorrow = TOMORROW_TIMINGS } = {}) =>
  getPrayerTimings.mockImplementation(
    async (_uuid, _tz, _iqama, isPrayerCalendarRequired) =>
      isPrayerCalendarRequired
        ? {
            calendar: buildCalendar(tomorrow ? { [TOMORROW]: tomorrow } : {}),
          }
        : { times: TODAY_TIMES },
  );

const pushedContent = () => {
  expect(updateDatastore).toHaveBeenCalledTimes(1);
  const [, commands] = updateDatastore.mock.calls[0];
  return commands[0].content;
};

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  jest.clearAllMocks();
  getAccessToken.mockResolvedValue({
    access_token: "token",
    token_type: "Bearer",
  });
  updateDatastore.mockResolvedValue({ results: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("InstallPrayerTimeWidgetRequestHandler — what the widget is sent", () => {
  it("counts down to the next prayer's exact start", async () => {
    // Pushed mid-minute: the countdown must still end at 13:45:00, not at
    // 13:45 plus however many seconds past the minute the push happened.
    freezeAtSecond(`${TODAY} 13:00:40`);
    serveTimes();

    await InstallPrayerTimeWidgetRequestHandler.handle(buildInstall());

    const content = pushedContent();
    expect(content.status).toBe("ok");
    expect(content.data.nextPrayerName).toBe("Dhuhr");
    expect(content.data.nextPrayerTime).toBe("13:45");
    expect(content.nextUpdateTime).toBe(epochOf(TODAY, "13:45"));
    expect(content.pushedAt).toBe(Date.now());
  });

  it("keeps the prayer for its own minute, already due, so It's time shows", async () => {
    // Due on arrival: the document's pushedAt + 60 s rule then holds the
    // screen for the minute before fetching the next prayer.
    freezeAtSecond(`${TODAY} 23:05:30`);
    serveTimes();

    await InstallPrayerTimeWidgetRequestHandler.handle(buildInstall());

    const content = pushedContent();
    expect(content.data.nextPrayerName).toBe("Isha");
    expect(content.nextUpdateTime).toBe(epochOf(TODAY, "23:05"));
  });

  it("moves to tomorrow's Fajr from the calendar once Isha's minute is over", async () => {
    freezeAtSecond(`${TODAY} 23:06:10`);
    serveTimes();

    await InstallPrayerTimeWidgetRequestHandler.handle(buildInstall());

    const content = pushedContent();
    expect(content.data.nextPrayerName).toBe("Fajr");
    // Tomorrow's 05:31, not today's 05:30.
    expect(content.data.nextPrayerTime).toBe("05:31");
    expect(content.nextUpdateTime).toBe(epochOf(TOMORROW, "05:31"));
  });

  it("pushes the error state instead of guessing Fajr when the calendar is missing", async () => {
    freezeAt(`${TODAY} 23:30`, TZ);
    serveTimes({ tomorrow: null });

    await InstallPrayerTimeWidgetRequestHandler.handle(buildInstall());

    const content = pushedContent();
    expect(content.status).toBe("error");
    expect(content.data).toBeNull();
    expect(content.labels.error).toBe(
      "Couldn't load prayer times. They'll update shortly.",
    );
  });

  it("pushes the error state when today's times can't be fetched", async () => {
    // It used to push nothing, leaving "Fetching..." up indefinitely.
    freezeAt(`${TODAY} 13:00`, TZ);
    getPrayerTimings.mockRejectedValue(new Error("MAWAQIT API down"));

    await InstallPrayerTimeWidgetRequestHandler.handle(buildInstall());

    const content = pushedContent();
    expect(content.status).toBe("error");
    // Due at once, so the next mount retries it.
    expect(content.nextUpdateTime).toBe(Date.now());
  });

  it("asks for a mosque when none is configured", async () => {
    freezeAt(`${TODAY} 13:00`, TZ);

    await InstallPrayerTimeWidgetRequestHandler.handle(buildInstall({}));

    const content = pushedContent();
    expect(content.status).toBe("error");
    expect(content.labels.error).toMatch(/haven't registered a mosque/);
    expect(getPrayerTimings).not.toHaveBeenCalled();
  });

  it("doesn't throw when the request carries no device", async () => {
    freezeAt(`${TODAY} 13:00`, TZ);
    serveTimes();
    const handlerInput = buildInstall();
    delete handlerInput.requestEnvelope.context.System.device;

    await expect(
      InstallPrayerTimeWidgetRequestHandler.handle(handlerInput),
    ).resolves.toBeDefined();
    expect(updateDatastore).not.toHaveBeenCalled();
  });
});

describe("ReadPrayerTimeAPLEventHandler — tapping the widget", () => {
  const buildTap = ({ inSession, persistentAttributes = {} }) =>
    buildHandlerInput({
      requestType: "Alexa.Presentation.APL.UserEvent",
      timezone: TZ,
      inSession,
      persistentAttributes,
      sessionAttributes: inSession
        ? {
            persistentAttributes: {
              uuid: UUID,
              primaryText: "Mosquée de Paris",
            },
            mosqueTimes: { times: TODAY_TIMES },
          }
        : {},
    });

  it("speaks the next prayer and keeps the conversation open in session", async () => {
    freezeAt(`${TODAY} 04:00`, TZ);
    const handlerInput = buildTap({ inSession: true });

    const response = await ReadPrayerTimeAPLEventHandler.handle(handlerInput);

    expect(spokenText(response)).toContain("The next prayer is Fajr");
    expect(spokenText(response)).toContain("Do you need anything else");
    expect(response.shouldEndSession).toBe(false);
    // The tap must not re-render a full-screen document over the widget.
    expect(handlerInput.attributesManager.getRequestAttributes()).toMatchObject(
      { skipAplDirective: true, skipCardDirective: true },
    );
  });

  it("speaks the next prayer when the tap arrives without a session", async () => {
    // Every session-attribute read throws out of session, which used to turn
    // the tap into an unhandled error.
    freezeAt(`${TODAY} 04:00`, TZ);
    serveTimes();

    const response = await ReadPrayerTimeAPLEventHandler.handle(
      buildTap({
        inSession: false,
        persistentAttributes: { uuid: UUID, primaryText: "Mosquée de Paris" },
      }),
    );
    const speech = spokenText(response);

    expect(speech).toContain("The next prayer is Fajr");
    expect(speech).toContain("5:30 AM");
    // No session to continue: a question would be left unanswerable.
    expect(speech).not.toContain("Do you need anything else");
    expect(response.shouldEndSession).toBe(true);
  });

  it("says no mosque is registered when the tap arrives without a session or a mosque", async () => {
    // Choosing a mosque is a dialog, which can't run without a session.
    freezeAt(`${TODAY} 04:00`, TZ);

    const response = await ReadPrayerTimeAPLEventHandler.handle(
      buildTap({ inSession: false }),
    );

    expect(spokenText(response)).toMatch(/haven't registered a mosque/);
    expect(response.shouldEndSession).toBe(true);
    expect(getPrayerTimings).not.toHaveBeenCalled();
  });
});
