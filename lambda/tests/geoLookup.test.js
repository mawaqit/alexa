/**
 * Turning the device address into coordinates is the only way a first-time user
 * reaches the mosque list, so every failure here is total: there is no other
 * phrase that gets them past it.
 *
 * Two failures used to look identical. Google answers a rejected key, an
 * exhausted quota and disabled billing with HTTP 200 and a `status` field, so
 * axios resolves and the results array is simply absent — indistinguishable
 * from an address that genuinely has no match, and reported to the user as
 * "I couldn't convert your address". They then re-check an address that was
 * never wrong. These tests pin the distinction, and the fallback that keeps a
 * geocoding outage from being a dead end.
 */
jest.mock("axios");
jest.mock("../handlers/apiHandler.js");
jest.mock("../handlers/googleGeoApiHandler.js");
jest.mock("../handlers/googleTranslateHandler.js");

const axios = require("axios");
const { getLatLng } = jest.requireActual("../handlers/googleGeoApiHandler.js");
const {
  getLatLng: getLatLngMock,
} = require("../handlers/googleGeoApiHandler.js");
const { getMosqueList } = require("../handlers/apiHandler.js");
const { detectLanguage } = require("../handlers/googleTranslateHandler.js");
const { getListOfMosqueBasedOnCity } = require("../helperFunctions.js");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");

const ADDRESS = {
  addressLine1: "Gerhart-Hauptmann-Strasse 7",
  addressLine2: "",
  addressLine3: "",
  city: "Magdeburg",
  stateOrRegion: "Sachsen-Anhalt",
  countryCode: "DE",
  postalCode: "39108",
};

const MOSQUES = [
  { primaryText: "Alrahman Moschee", uuid: "uuid-1", proximity: "1383" },
  { primaryText: "Darul Aman", uuid: "uuid-2", proximity: "3479" },
];

/** The `address` query parameter Google actually received, decoded. */
const requestedAddress = () =>
  decodeURIComponent(
    new URL(axios.get.mock.calls[0][0]).searchParams.get("address"),
  );

beforeEach(() => {
  jest.clearAllMocks();
  process.env.googleApiKey = "test-key";
  detectLanguage.mockResolvedValue("en");
});

describe("address to coordinates", () => {
  it("keeps the postal code with the city rather than after the country", async () => {
    axios.get.mockResolvedValue({
      data: {
        status: "OK",
        results: [
          {
            address_components: [],
            geometry: { location: { lat: 52.134, lng: 11.6166 } },
          },
        ],
      },
    });

    await getLatLng(ADDRESS);

    // "…, Sachsen-Anhalt, 39108, DE" — not "…, Sachsen-Anhalt, DE, 39108",
    // which splits the postcode from the country that qualifies it.
    expect(requestedAddress()).toBe(
      "Gerhart-Hauptmann-Strasse 7, Magdeburg, Sachsen-Anhalt, 39108, DE",
    );
  });

  it("reports a rejected API key as a service failure, not a bad address", async () => {
    // HTTP 200 with a status field: axios resolves, so only `status` reveals it.
    axios.get.mockResolvedValue({
      data: {
        status: "REQUEST_DENIED",
        error_message: "The provided API key is invalid.",
      },
    });

    await expect(getLatLng(ADDRESS)).rejects.toThrow(/^GeoServiceError/);
  });

  it("reports an exhausted quota as a service failure", async () => {
    axios.get.mockResolvedValue({ data: { status: "OVER_QUERY_LIMIT" } });

    await expect(getLatLng(ADDRESS)).rejects.toThrow(/^GeoServiceError/);
  });

  it("reports a failed request as a service failure", async () => {
    axios.get.mockRejectedValue(new Error("socket hang up"));

    await expect(getLatLng(ADDRESS)).rejects.toThrow(/^GeoServiceError/);
  });

  it("reports a success carrying no results as a service failure", async () => {
    // "OK" with nothing in it is self-contradictory, so it says nothing about
    // the address — only ZERO_RESULTS does.
    axios.get.mockResolvedValue({ data: { status: "OK", results: [] } });

    await expect(getLatLng(ADDRESS)).rejects.toThrow(/^GeoServiceError/);
  });

  it("reports a response with no status as a service failure", async () => {
    axios.get.mockResolvedValue({ data: {} });

    await expect(getLatLng(ADDRESS)).rejects.toThrow(/^GeoServiceError/);
  });

  it("still reports an unmatched address as a conversion failure", async () => {
    // The one case where the address really is the problem.
    axios.get.mockResolvedValue({
      data: { status: "ZERO_RESULTS", results: [] },
    });

    await expect(getLatLng(ADDRESS)).rejects.toThrow(/^GeoConversionError/);
  });
});

describe("when geocoding is unavailable", () => {
  const buildInput = () =>
    buildHandlerInput({
      intentName: "SelectMosqueIntent",
      consentToken: "consent-token",
      deviceAddress: ADDRESS,
    });

  it("falls back to searching by the city already in the address", async () => {
    getLatLngMock.mockRejectedValue(
      new Error("GeoServiceError: REQUEST_DENIED"),
    );
    getMosqueList.mockResolvedValue(MOSQUES);

    const response = await getListOfMosqueBasedOnCity(buildInput(), "");

    // The city search takes the name as its first argument; the coordinate
    // search passes `false` there instead.
    expect(getMosqueList).toHaveBeenCalledWith("Magdeburg");
    expect(spokenText(response)).toContain("Alrahman Moschee");
  });

  it("falls back the same way when the address itself cannot be matched", async () => {
    getLatLngMock.mockRejectedValue(
      new Error("GeoConversionError: No results found"),
    );
    getMosqueList.mockResolvedValue(MOSQUES);

    await getListOfMosqueBasedOnCity(buildInput(), "");

    expect(getMosqueList).toHaveBeenCalledWith("Magdeburg");
  });

  it("asks the user to try later when the city search also finds nothing", async () => {
    getLatLngMock.mockRejectedValue(
      new Error("GeoServiceError: REQUEST_DENIED"),
    );
    getMosqueList.mockRejectedValue(new Error("Received Empty Response"));

    const response = await getListOfMosqueBasedOnCity(buildInput(), "");

    // Never blame the address: it was never established to be at fault.
    expect(spokenText(response)).not.toMatch(/your address/i);
    expect(spokenText(response)).toMatch(/try again/i);
  });
});
