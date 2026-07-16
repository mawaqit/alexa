/**
 * Everything here ends up inside an SSML document that Alexa must parse and
 * read aloud. A mangled tag makes the whole response fail; a mis-formatted time
 * makes Alexa say the wrong hour.
 */
jest.mock("../handlers/apiHandler.js");

const {
  formatTime,
  formatDistance,
  getUserDistanceUnits,
  calculateMinutes,
  smartEscapeSSML,
  extractPhonemeText,
} = require("../helperFunctions.js");
const { createTranslate } = require("./support/i18n");
const { buildHandlerInput } = require("./support/handlerInput");

// Intl inserts narrow/non-breaking spaces in several locales; normalize so the
// assertions describe the words, not the whitespace codepoints.
const normalize = (value) => value.replace(/[\u202f\u00a0]/g, " ");

describe("formatTime", () => {
  it("renders a 12-hour clock with the meridiem for en-US", () => {
    expect(normalize(formatTime("21:05", "en-US"))).toBe("9:05 PM");
    expect(normalize(formatTime("00:30", "en-US"))).toBe("12:30 AM");
    expect(normalize(formatTime("12:00", "en-US"))).toBe("12:00 PM");
  });

  it("keeps a 24-hour clock for fr-FR, with no meridiem to misread", () => {
    expect(formatTime("21:05", "fr-FR")).toBe("21:05");
    expect(formatTime("05:30", "fr-FR")).toBe("5:30");
    expect(formatTime("21:05", "fr-FR")).not.toMatch(/AM|PM/);
  });

  it("does not shift midnight or noon across the meridiem", () => {
    // 00:xx -> "12:xx AM" and 12:xx -> "12:xx PM"; swapping them would send the
    // user to a Fajr twelve hours off.
    expect(normalize(formatTime("00:00", "en-US"))).toBe("12:00 AM");
    expect(normalize(formatTime("12:45", "en-US"))).toBe("12:45 PM");
  });

  it("passes through anything that is not a HH:mm string", () => {
    // Jumua/Eid slots can be null or already-formatted; they must not crash or
    // silently become "Invalid Date".
    expect(formatTime(null)).toBeNull();
    expect(formatTime(undefined)).toBeUndefined();
    expect(formatTime("no schedule")).toBe("no schedule");
  });
});

describe("formatDistance", () => {
  it("uses kilometres with a locale decimal separator above 1 km", () => {
    expect(normalize(formatDistance(9600, "fr-FR", "METRIC"))).toBe(
      "9,6 kilomètres",
    );
    expect(normalize(formatDistance(9600, "en-US", "METRIC"))).toBe(
      "9.6 kilometers",
    );
  });

  it("switches to metres below 1 km rather than saying '0.8 kilometers'", () => {
    expect(normalize(formatDistance(800, "en-US", "METRIC"))).toBe(
      "800 meters",
    );
  });

  it("uses miles and feet for imperial users", () => {
    expect(normalize(formatDistance(9600, "en-US", "IMPERIAL"))).toBe(
      "6 miles",
    );
    expect(normalize(formatDistance(800, "en-US", "IMPERIAL"))).toBe(
      "2,625 feet",
    );
  });

  it("returns an empty string for a distance the API did not provide", () => {
    // The mosque-info prompt interpolates this; "NaN kilometers" would be read
    // aloud verbatim.
    expect(formatDistance(undefined)).toBe("");
    expect(formatDistance(null)).toBe("");
    expect(formatDistance("not-a-number")).toBe("");
  });
});

describe("getUserDistanceUnits", () => {
  it("uses the device setting when Alexa provides one", async () => {
    const handlerInput = buildHandlerInput({ distanceUnits: "IMPERIAL" });

    await expect(getUserDistanceUnits(handlerInput)).resolves.toBe("IMPERIAL");
  });

  it("falls back to the locale default when the lookup fails", async () => {
    const handlerInput = buildHandlerInput({ locale: "en-US" });
    handlerInput.serviceClientFactory.getUpsServiceClient = () => ({
      getSystemDistanceUnits: async () => {
        throw new Error("ServiceError");
      },
    });

    await expect(getUserDistanceUnits(handlerInput)).resolves.toBe("IMPERIAL");
  });

  it("defaults non-US locales to metric when the lookup fails", async () => {
    const handlerInput = buildHandlerInput({ locale: "fr-FR" });
    handlerInput.serviceClientFactory.getUpsServiceClient = () => ({
      getSystemDistanceUnits: async () => {
        throw new Error("ServiceError");
      },
    });

    await expect(getUserDistanceUnits(handlerInput)).resolves.toBe("METRIC");
  });
});

describe("calculateMinutes", () => {
  const t = createTranslate("en-US");

  it("speaks hours and minutes once an hour away", () => {
    expect(
      calculateMinutes({ t }, "2026-07-16T13:00", "2026-07-16T15:30"),
    ).toBe("2 hours and 30 minutes");
  });

  it("speaks minutes only when under an hour", () => {
    expect(
      calculateMinutes({ t }, "2026-07-16T13:00", "2026-07-16T13:45"),
    ).toBe("45 minutes");
  });

  it("switches to seconds under a minute rather than saying '0 minutes'", () => {
    expect(
      calculateMinutes({ t }, "2026-07-16T13:00", "2026-07-16T13:00"),
    ).toBe("0 seconds");
  });

  it("uses the exact 60-minute boundary as one hour", () => {
    expect(
      calculateMinutes({ t }, "2026-07-16T13:00", "2026-07-16T14:00"),
    ).toBe("1 hours and 0 minutes");
  });
});

describe("smartEscapeSSML", () => {
  it("escapes a bare ampersand from a mosque name", () => {
    // Real mosque names contain "&". Unescaped, Alexa rejects the SSML and the
    // user hears the generic error prompt instead of their prayer time.
    expect(smartEscapeSSML("Masjid Noor & Rahma")).toBe(
      "Masjid Noor &amp; Rahma",
    );
  });

  it("leaves already-escaped entities alone instead of double-escaping", () => {
    expect(smartEscapeSSML("Noor &amp; Rahma")).toBe("Noor &amp; Rahma");
  });

  it("preserves the SSML tags the prompts rely on", () => {
    const ssml = "The next prayer is <sub alias='fajer'>Fajr</sub>";

    expect(smartEscapeSSML(ssml)).toBe(ssml);
  });

  it("escapes stray angle brackets in text while keeping real tags", () => {
    expect(smartEscapeSSML("<break time='1s'/>5 > 3")).toBe(
      "<break time='1s'/>5 &gt; 3",
    );
  });

  it("returns an empty string for empty input", () => {
    expect(smartEscapeSSML("")).toBe("");
    expect(smartEscapeSSML(undefined)).toBe("");
  });
});

describe("extractPhonemeText", () => {
  it("recovers the display name from a prompt's SSML wrapper", () => {
    // APL screens and routine names need "Fajr", not the <sub> markup.
    expect(extractPhonemeText(["<sub alias='fajer'>Fajr</sub>"])).toEqual([
      "Fajr",
    ]);
  });

  it("passes plain names through untouched", () => {
    expect(extractPhonemeText(["All Prayers"])).toEqual(["All Prayers"]);
  });

  it("maps every prayer name in the real en-US prompts to plain text", () => {
    const names = extractPhonemeText(createTranslate("en-US")("prayerNames"));

    expect(names).toEqual([
      "Fajr",
      "Dhuhr",
      "Asr",
      "Maghrib",
      "Isha",
      "Jumma",
      "Eid",
      "Shuruq",
    ]);
  });
});
