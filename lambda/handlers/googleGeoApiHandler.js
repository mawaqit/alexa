const axios = require("axios");
const googleBaseUrl = "https://maps.googleapis.com/maps/api/geocode/json";

// Function to construct the full address string from the given JSON
function constructAddress(addressJson) {
  const {
    addressLine1,
    addressLine2,
    addressLine3,
    city,
    stateOrRegion,
    countryCode,
    postalCode,
  } = addressJson;
  // Postal code before country code. Alexa hands these over as separate
  // fields, and putting the country between the region and the postcode
  // splits a pair every geocoder expects to read together.
  return [
    addressLine1,
    addressLine2,
    addressLine3,
    city,
    stateOrRegion,
    postalCode,
    countryCode,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Retrieve Google Geocoding API results for a given address.
 * @param {string} address - The full address string to geocode.
 * @returns {Array|undefined} An array of geocoding result objects from the Google API, or `undefined` if no results were returned.
 * @throws {Error} If the Google API key is not configured in environment variables.
 * @throws {Error} `GeoServiceError: ...` if the request or the API itself failed.
 */
async function fetchGeocodingResults(address) {
  const googleApiKey = getGoogleApiKey();
  if (!googleApiKey) {
    throw new Error("Google API key is not set in environment variables.");
  }
  const url =
    googleBaseUrl +
    `?address=${encodeURIComponent(address)}&key=${googleApiKey}`;

  let response;
  try {
    response = await axios.get(url);
  } catch (error) {
    // A failed request says nothing about the address, so it must not reach the
    // user as "I couldn't convert your address".
    console.error(
      "Geocoding request failed:",
      error?.response?.status,
      error?.message,
    );
    throw new Error("GeoServiceError: geocoding request failed");
  }

  // Google answers REQUEST_DENIED, OVER_QUERY_LIMIT and friends with HTTP 200,
  // so axios resolves and only `status` tells us the key, quota or billing is
  // at fault. Without this check those arrive as an empty result list and get
  // blamed on the address.
  const { status, error_message: errorMessage, results } = response?.data ?? {};

  // The only answer that establishes the address itself has no match. Returned
  // empty so getLatLng reports it as a conversion failure.
  if (status === "ZERO_RESULTS") {
    return [];
  }

  // Everything else — a rejected key, an absent status, OK with no results —
  // means the lookup did not happen. That is not evidence about the address.
  if (status !== "OK" || !results?.length) {
    console.error("Geocoding rejected:", status, errorMessage);
    throw new Error(`GeoServiceError: ${status ?? "malformed response"}`);
  }
  return results;
}

// Function to calculate the matching score for each result
function calculateScore(result, desiredComponents) {
  let score = 0;
  result.address_components.forEach((component) => {
    if (
      component.types.includes("postal_code") &&
      component.long_name === desiredComponents.postal_code
    ) {
      score += 3; // Higher weight for postal code
    }
    if (
      component.types.includes("locality") &&
      component.long_name === desiredComponents.locality
    ) {
      score += 2;
    }
    if (
      component.types.includes("sublocality") &&
      component.long_name === desiredComponents.sublocality
    ) {
      score += 2;
    }
    if (
      component.types.includes("route") &&
      component.long_name === desiredComponents.route
    ) {
      score += 1;
    }
  });
  return score;
}

// Function to find the best matching result
function findBestResult(results, desiredComponents) {
  const scoredResults = results.map((result) => ({
    result,
    score: calculateScore(result, desiredComponents),
  }));
  scoredResults.sort((a, b) => b.score - a.score);
  return scoredResults[0].result;
}

// Main function to get latitude and longitude from the address JSON
async function getLatLng(addressJson) {
  const address = constructAddress(addressJson);
  console.log(`Fetching geocoding results for address: ${address}`);
  const results = await fetchGeocodingResults(address);
  if (!results?.length) throw new Error("GeoConversionError: No results found");
  console.log(`Found geocoding results: ${JSON.stringify(results)}`);
  const desiredComponents = {
    postal_code: addressJson.postalCode || "",
    locality: addressJson.city?.split(",").pop()?.trim() || "",
    sublocality: addressJson.addressLine2
      ? extractSublocality(addressJson.addressLine2)
      : "",
    route: addressJson.addressLine1 || "",
  };

  const bestResult = findBestResult(results, desiredComponents);
  const location = bestResult?.geometry?.location;
  if (!location) {
    throw new Error("GeoConversionError: No location found in results");
  }
  const lat = location.lat;
  const lng = location.lng;
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    throw new Error("GeoConversionError: No latitude or longitude found");
  }
  return { lat, lng };
}

// Function to extract sublocality from addressLine2
function extractSublocality(addressLine2) {
  const parts = addressLine2.split(",");
  return parts.length > 1 ? parts[parts.length - 1].trim() : null;
}

const getGoogleApiKey = () => {
  return process.env.googleApiKey;
};

module.exports = { getLatLng };
