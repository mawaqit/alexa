/**
 * Failure surfaces on the All Prayer Time widget.
 *
 * (1) Tapping the widget used to speak only the next prayer (via
 *     checkForPersistenceData -> getNextPrayerTime), same as the single-prayer
 *     widget — wrong for a widget titled "Prayer Times". It now delegates to
 *     AllPrayerTimeIntentHandler, which speaks all five — with or without a
 *     session, since the SDK throws on any session-attribute access without
 *     one.
 * (2) The widget must never show another day's times as current. A missing
 *     mosque, a failed fetch, or tomorrow's times missing after Isha used to
 *     push nothing, a sentinel nothing ever retried, or today's list after
 *     Isha. Each now pushes an error state that is due at once, so the
 *     document retries it on the next mount.
 * (3) The list moves to tomorrow one minute after Isha — Isha keeps its
 *     "It's time" minute, like the Next Prayer widget.
 * (4) A refresh refused as early pushes nothing, so nothing re-arms the
 *     device's timer until the widget remounts. A device clock a few seconds
 *     fast must therefore still get its refresh.
 */
jest.mock("../handlers/apiHandler.js");

const moment = require("moment-timezone");
const {
  getAccessToken,
  getPrayerTimings,
  updateDatastore,
} = require("../handlers/apiHandler.js");
const {
  ReadAllPrayerTimeAPLEventHandler,
  InstallAllPrayerTimeWidgetRequestHandler,
  UpdateAllPrayerTimeAPLEventHandler,
} = require("../handlers/allPrayerTimeWidgetHandler.js");
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
// TODAY_TIMES' Isha.
const ISHA = "23:05";

const epochOf = (date, time) =>
  moment.tz(`${date} ${time}`, "YYYY-MM-DD HH:mm", TZ).valueOf();
const freezeAtSecond = (wallClock) =>
  jest.setSystemTime(moment.tz(wallClock, "YYYY-MM-DD HH:mm:ss", TZ).toDate());

// Today's times, plus tomorrow's when the calendar is asked for (which is
// how getTomorrowPrayerTimes reads them).
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
  // Nothing is preloaded without a session: the mosque comes from persistence.
  const buildOutOfSessionTap = (persistentAttributes) =>
    buildHandlerInput({
      requestType: "Alexa.Presentation.APL.UserEvent",
      timezone: TZ,
      inSession: false,
      persistentAttributes,
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

    // Request attributes, which AddDirectiveResponseInterceptor reads for this
    // response — session attributes don't exist on an out-of-session tap.
    expect(handlerInput.attributesManager.getRequestAttributes()).toMatchObject(
      { skipAplDirective: true, skipCardDirective: true },
    );
  });

  it("speaks all five prayers when the tap arrives without a session", async () => {
    // Every session-attribute read throws out of session, which used to turn
    // the tap into the generic error prompt.
    freezeAt("2026-07-16 04:00", TZ);
    getPrayerTimings.mockResolvedValue({ times: TODAY_TIMES });

    const response = await ReadAllPrayerTimeAPLEventHandler.handle(
      buildOutOfSessionTap({ uuid: UUID, primaryText: "Mosquée de Paris" }),
    );
    const speech = spokenText(response);

    expect(getPrayerTimings).toHaveBeenCalledWith(UUID, TZ);
    expect(speech).toContain("Fajr is at 5:30 AM");
    expect(speech).toContain("Isha is at 11:05 PM");
    // No session to continue: a question would be left unanswerable.
    expect(speech).not.toContain("Do you need anything else");
    expect(response.shouldEndSession).toBe(true);
  });

  it("says no mosque is registered when the tap arrives without a session or a mosque", async () => {
    // Choosing a mosque is a dialog, which can't run without a session.
    freezeAt("2026-07-16 04:00", TZ);

    const response = await ReadAllPrayerTimeAPLEventHandler.handle(
      buildOutOfSessionTap({}),
    );

    expect(spokenText(response)).toMatch(/haven't registered a mosque/);
    expect(response.shouldEndSession).toBe(true);
    expect(getPrayerTimings).not.toHaveBeenCalled();
  });
});

describe("InstallAllPrayerTimeWidgetRequestHandler — what the widget is sent", () => {
  const buildInstall = (persistentAttributes = { uuid: UUID }) =>
    buildHandlerInput({
      requestType: "Alexa.DataStore.PackageManager.UsagesInstalled",
      timezone: TZ,
      persistentAttributes: {
        primaryText: "Mosquée de Paris",
        ...persistentAttributes,
      },
    });

  it("pushes today's list before Isha, refreshing once Isha's minute ends", async () => {
    freezeAt(`${TODAY} 13:00`, TZ);
    serveTimes();

    await InstallAllPrayerTimeWidgetRequestHandler.handle(buildInstall());

    const content = pushedContent();
    expect(content.status).toBe("ok");
    expect(content.data.prayers.map((p) => p.time)).toEqual(TODAY_TIMES);
    expect(content.data.prayers[4].epoch).toBe(epochOf(TODAY, ISHA));
    expect(content.nextUpdateTime).toBe(epochOf(TODAY, ISHA) + 60 * 1000);
    expect(content.pushedAt).toBe(Date.now());
  });

  it("keeps today's list through Isha's own minute", async () => {
    // The Next Prayer widget shows "It's time" for this minute; this list
    // must agree rather than already showing tomorrow.
    freezeAtSecond(`${TODAY} 23:05:30`);
    serveTimes();

    await InstallAllPrayerTimeWidgetRequestHandler.handle(buildInstall());

    expect(pushedContent().data.prayers[4].epoch).toBe(epochOf(TODAY, ISHA));
  });

  it("switches to tomorrow's list, dated tomorrow, once Isha's minute is over", async () => {
    freezeAtSecond(`${TODAY} 23:06:00`);
    serveTimes();

    await InstallAllPrayerTimeWidgetRequestHandler.handle(buildInstall());

    const content = pushedContent();
    // Tomorrow's real times (05:31 Fajr), not today's reused.
    expect(content.data.prayers.map((p) => p.time)).toEqual(
      TOMORROW_TIMINGS.filter((_, index) => index !== 1),
    );
    expect(content.data.prayers[0].epoch).toBe(epochOf(TOMORROW, "05:31"));
    expect(content.nextUpdateTime).toBe(epochOf(TOMORROW, "23:04") + 60 * 1000);
  });

  it("switches even when the device's refresh lands a few seconds early", async () => {
    // The device timer fires at Isha + 1 min by its own clock; a clock a few
    // seconds ahead must not get today's list for another minute.
    freezeAtSecond(`${TODAY} 23:05:57`);
    serveTimes();

    await InstallAllPrayerTimeWidgetRequestHandler.handle(buildInstall());

    expect(pushedContent().data.prayers[0].epoch).toBe(
      epochOf(TOMORROW, "05:31"),
    );
  });

  it("pushes the error state, not today's list, when tomorrow is missing after Isha", async () => {
    // Today's list after Isha would present the day just ended as upcoming.
    freezeAt(`${TODAY} 23:30`, TZ);
    serveTimes({ tomorrow: null });

    await InstallAllPrayerTimeWidgetRequestHandler.handle(buildInstall());

    const content = pushedContent();
    expect(content.status).toBe("error");
    expect(content.data).toBeNull();
    expect(content.labels.error).toBe(
      "Couldn't load prayer times. They'll update shortly.",
    );
  });

  it("pushes the error state when the prayer-times fetch throws", async () => {
    freezeAt(`${TODAY} 13:00`, TZ);
    getPrayerTimings.mockRejectedValue(new Error("MAWAQIT API down"));

    await InstallAllPrayerTimeWidgetRequestHandler.handle(buildInstall());

    expect(pushedContent().status).toBe("error");
  });

  it("asks for a mosque when none is configured", async () => {
    freezeAt(`${TODAY} 13:00`, TZ);

    await InstallAllPrayerTimeWidgetRequestHandler.handle(buildInstall({}));

    const content = pushedContent();
    expect(content.status).toBe("error");
    expect(content.labels.error).toMatch(/haven't registered a mosque/);
    expect(getPrayerTimings).not.toHaveBeenCalled();
  });

  it("makes every error state due at once, so the next mount retries it", async () => {
    // The old -1 sentinel was never retried: one outage at Isha left the
    // error on screen until the user changed mosque.
    freezeAt(`${TODAY} 13:00`, TZ);
    getPrayerTimings.mockRejectedValue(new Error("MAWAQIT API down"));

    await InstallAllPrayerTimeWidgetRequestHandler.handle(buildInstall());

    const content = pushedContent();
    expect(content.nextUpdateTime).toBe(Date.now());
    expect(content.pushedAt).toBe(Date.now());
  });
});

describe("UpdateAllPrayerTimeAPLEventHandler — the device's refresh timer", () => {
  // The refresh the document sends once nextUpdateTime is due by its clock.
  const buildRefresh = (nextUpdateTime) => {
    const handlerInput = buildHandlerInput({
      requestType: "Alexa.Presentation.APL.UserEvent",
      timezone: TZ,
      inSession: false,
      persistentAttributes: { uuid: UUID, primaryText: "Mosquée de Paris" },
    });
    handlerInput.requestEnvelope.request.arguments = [
      "FETCH_ALL_PRAYER_TIME",
      nextUpdateTime,
    ];
    return handlerInput;
  };
  const ishaMinuteEnd = epochOf(TODAY, ISHA) + 60 * 1000;

  it("refreshes when the device's clock runs a few seconds ahead of ours", async () => {
    // Refused, this would push nothing and the widget would keep today's
    // list after Isha until it remounts.
    freezeAtSecond(`${TODAY} 23:05:57`);
    serveTimes();

    await UpdateAllPrayerTimeAPLEventHandler.handle(
      buildRefresh(ishaMinuteEnd),
    );

    expect(pushedContent().data.prayers[0].epoch).toBe(
      epochOf(TOMORROW, "05:31"),
    );
  });

  it("ignores a refresh that is not due yet", async () => {
    freezeAt(`${TODAY} 13:00`, TZ);
    serveTimes();

    await UpdateAllPrayerTimeAPLEventHandler.handle(
      buildRefresh(ishaMinuteEnd),
    );

    expect(updateDatastore).not.toHaveBeenCalled();
  });
});
