/**
 * Slot resolution decides whether Alexa actually recognised what the user said.
 * Treating an unmatched utterance as valid is how the skill ends up acting on a
 * prayer or a mosque the user never asked for.
 */
jest.mock("../handlers/apiHandler.js");

const {
  getSlotValues,
  getResolvedId,
  getResolvedValue,
  getIntentName,
} = require("../helperFunctions.js");

const slot = (name, value, status, resolvedValue) => ({
  name,
  value,
  ...(status
    ? {
        resolutions: {
          resolutionsPerAuthority: [
            {
              status: { code: status },
              values: resolvedValue ? [{ value: resolvedValue }] : [],
            },
          ],
        },
      }
    : {}),
});

const envelopeWith = (slots) => ({
  request: { intent: { name: "NextPrayerTimeIntent", slots } },
});

describe("getSlotValues", () => {
  it("marks a matched slot as validated and keeps both synonym and canonical value", () => {
    const slots = {
      prayerName: slot("prayerName", "dohr", "ER_SUCCESS_MATCH", {
        name: "Dhuhr",
        id: "1",
      }),
    };

    expect(getSlotValues(slots).prayerName).toEqual({
      synonym: "dohr",
      value: "Dhuhr",
      id: "1",
      isValidated: true,
    });
  });

  it("marks an unmatched slot as not validated", () => {
    // "brunch" is not a prayer. Callers gate on isValidated; reporting true here
    // would let a nonsense utterance flow into the prayer lookup.
    const slots = {
      prayerName: slot("prayerName", "brunch", "ER_SUCCESS_NO_MATCH"),
    };

    expect(getSlotValues(slots).prayerName).toEqual({
      synonym: "brunch",
      value: "brunch",
      id: null,
      isValidated: false,
    });
  });

  it("treats a slot with no resolutions at all as not validated", () => {
    const slots = { searchWord: slot("searchWord", "Toulouse") };

    expect(getSlotValues(slots).searchWord).toMatchObject({
      value: "Toulouse",
      isValidated: false,
    });
  });

  it("returns an empty map for a missing slots object", () => {
    expect(getSlotValues(undefined)).toEqual({});
    expect(getSlotValues({})).toEqual({});
  });
});

describe("getResolvedId", () => {
  it("returns the id that indexes into the prayer names array", () => {
    const envelope = envelopeWith({
      prayerName: slot("prayerName", "asser", "ER_SUCCESS_MATCH", {
        name: "Asr",
        id: "2",
      }),
    });

    expect(getResolvedId(envelope, "prayerName")).toBe("2");
  });

  it("preserves id '0' — Fajr must not be lost to a falsy check", () => {
    // The handler branches on `if (!prayerNameResolvedId)`. The id is a string
    // here; the day it becomes a number, "0" would fail that check and Fajr
    // would answer "I couldn't recognize the prayer name".
    const envelope = envelopeWith({
      prayerName: slot("prayerName", "fajer", "ER_SUCCESS_MATCH", {
        name: "Fajr",
        id: "0",
      }),
    });

    const id = getResolvedId(envelope, "prayerName");
    expect(id).toBe("0");
    expect(Boolean(id)).toBe(true);
  });

  it("returns undefined for an unresolved or absent slot", () => {
    expect(
      getResolvedId(
        envelopeWith({ prayerName: slot("prayerName", "brunch") }),
        "prayerName",
      ),
    ).toBeUndefined();
    expect(getResolvedId(envelopeWith({}), "prayerName")).toBeUndefined();
    expect(getResolvedId({}, "prayerName")).toBeUndefined();
  });
});

describe("getResolvedValue", () => {
  it("returns the canonical name rather than the spoken synonym", () => {
    const envelope = envelopeWith({
      prayerName: slot("prayerName", "eesha", "ER_SUCCESS_MATCH", {
        name: "Isha",
        id: "4",
      }),
    });

    expect(getResolvedValue(envelope, "prayerName")).toBe("Isha");
  });

  it("returns undefined instead of throwing on a malformed envelope", () => {
    expect(getResolvedValue({}, "prayerName")).toBeUndefined();
  });
});

describe("getIntentName", () => {
  it("returns the intent name when present", () => {
    expect(getIntentName({ requestEnvelope: envelopeWith({}) })).toBe(
      "NextPrayerTimeIntent",
    );
  });

  it("returns null for a non-intent request", () => {
    expect(
      getIntentName({
        requestEnvelope: { request: { type: "LaunchRequest" } },
      }),
    ).toBeNull();
  });
});
