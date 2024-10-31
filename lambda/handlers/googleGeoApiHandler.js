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

// Function to fetch geocoding results from Google API
async function fetchGeocodingResults(address) {
  const url =
    googleBaseUrl + `?address=${encodeURIComponent(address)}&key=${getGoogleApiKey()}`;
  const response = await axios.get(url);
  return response.data.results;
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
    locality: addressJson.city ? addressJson.city.split(',').pop().trim() : '',
    sublocality: addressJson.addressLine2 ? extractSublocality(addressJson.addressLine2) : "",
    route: addressJson.addressLine1 || ''
};

  const bestResult = findBestResult(results, desiredComponents);
  const lat = bestResult.geometry.location.lat;
  const lng = bestResult.geometry.location.lng;
  if(!lat || !lng) throw "GeoConversionError: No latitude or longitude found";
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
