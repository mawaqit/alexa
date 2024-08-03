const axios = require("axios");
const apiKey = "Bearer " + process.env.mawaqitApiKey;
const mawaqitBaseUrl = process.env.baseUrl;
const headers = {
  accept: "application/json",
  Authorization: apiKey,
};

const getMosqueList = async (
  searchWord,
  latitudeInDegrees,
  longitudeInDegrees
) => {
  let url = `/mosque/search?`;
  // if (searchWord) {
  //   url += `word=${searchWord}`;
  // } else {
  //   url += `lat=${latitudeInDegrees}&lon=${longitudeInDegrees}`;
  // }
  // url += `word=India`; //TODO: testing purposes remove later
  url += `lat=10.9543588&lon=79.7294113`;
  const config = getConfig("get", url, "2.0");
  console.log("Config: ", JSON.stringify(config));
  return await axios
    .request(config)
    .then((response) => {        
      console.log("Mosque List: ", JSON.stringify(response.data));
      if (!response || !response.data || !response.data.length) {
        throw "Received Empty Response";
      }

      return response.data.map(({ name, uuid, proximity, localisation, jumua, jumua2, jumua3 }) => ({
        primaryText: name,
        uuid,
        proximity,
        localisation,
        jumua,
        jumua2,
        jumua3
      })).slice(0, 5);
    })
    .catch((error) => {
      console.log("Error while fetching mosque list: ", error);
      throw error;
    });
};

const getPrayerTimings = async (mosqueUuid) => {
  const config = getConfig("get", `/mosque/${mosqueUuid}/times`);
  console.log("Config: ", JSON.stringify(config));
  return await axios
    .request(config)
    .then((response) => {
        
      console.log("Mosque Timings: ", JSON.stringify(response.data));
      if (!response || !response.data || !response.data.times) {
        throw "Received Empty Response";
      }

      return response.data;
    })
    .catch((error) => {
        
      console.log("Error while fetching mosque Timings: ", error);
      if (error.response && error.response.status === 404) {
        console.log("Mosque not found: ", error.response.status);
        throw "Mosque not found";
      }
      throw error;
    });
};

const getConfig = (httpMethod, url, apiVersion = "3.0") => {
  return {
    method: httpMethod,
    url: mawaqitBaseUrl + apiVersion + url,
    headers: headers,
  };
};

module.exports = {
  getMosqueList,
  getPrayerTimings,
};
