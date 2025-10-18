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
  return [
    addressLine1,
    addressLine2,
    addressLine3,
    city,
    stateOrRegion,
    countryCode,
    postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Retrieve Google Geocoding API results for a given address.
 * @param {string} address - The full address string to geocode.
 * @returns {Array|undefined} An array of geocoding result objects from the Google API, or `undefined` if the request failed or no results were returned.
 * @throws {Error} If the Google API key is not configured in environment variables.
 */
async function fetchGeocodingResults(address) {
  const googleApiKey = getGoogleApiKey();
  if (!googleApiKey) {
    throw new Error("Google API key is not set in environment variables.");
  }
  const url =
    googleBaseUrl + `?address=${encodeURIComponent(address)}&key=${googleApiKey}`;
  const response = await axios.get(url).catch((error) => {
    console.error("Error fetching geocoding results:", error);
    throw "GeoConversionError: No results found";
  })
  return response?.data?.results;
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
  if (!results || !results.length)
    throw "GeoConversionError: No results found";
  console.log(`Found geocoding results: ${JSON.stringify(results)}`);
  const desiredComponents = {
    postal_code: addressJson.postalCode || '',
    locality: addressJson.city?.split(',').pop()?.trim() || '',
    sublocality: addressJson.addressLine2 ? extractSublocality(addressJson.addressLine2) : "",
    route: addressJson.addressLine1 || ''
};

  const bestResult = findBestResult(results, desiredComponents);
  const location = bestResult?.geometry?.location;
  if (!location) {
    throw "GeoConversionError: No location found in results";
  }
  const lat = location.lat;
  const lng = location.lng;
  if(lat === null || lat === undefined || lng === null || lng === undefined) {
    throw "GeoConversionError: No latitude or longitude found";
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